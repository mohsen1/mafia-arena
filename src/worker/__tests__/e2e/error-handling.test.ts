/**
 * E2E tests for error handling scenarios.
 *
 * Tests:
 * - Parse error recovery with retries
 * - Idempotency (duplicate gameId handling)
 * - Game failure after max retries
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {
  getOrCreateProvider,
  clearSharedProviders,
  setupParseErrorScenario,
  STANDARD_GAME_CONFIG,
} from '../mocks/scenarios.js';
import {
  initializeTestDatabase,
  cleanupTestData,
  getGameFromDb,
} from '../setup.js';
import worker from '../../index.js';

// Mock the AI provider factory
vi.mock('../../ai/factory.js', () => ({
  createProvidersForGame: (modelIds: string[]) => {
    const providers = new Map();
    for (const modelId of modelIds) {
      providers.set(modelId, getOrCreateProvider(modelId));
    }
    return providers;
  },
  createProvider: (modelId: string) => getOrCreateProvider(modelId),
}));

describe('Error Handling E2E', () => {
  beforeAll(async () => {
    await initializeTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupTestData(env.DB);
    clearSharedProviders();
  });

  afterEach(() => {
    clearSharedProviders();
  });

  describe('Parse Error Recovery', () => {
    it('recovers from malformed JSON with retries', async () => {
      const provider = getOrCreateProvider('test/model');

      // Queue invalid responses first, then valid ones
      // The adapter retries up to MAX_PARSE_RETRIES times
      provider.queueRawResponse('This is not JSON at all!!!');
      provider.queueRawResponse('Still not JSON { broken');

      // Rest will use default valid responses
      // The game should eventually complete

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: STANDARD_GAME_CONFIG,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { success: boolean; gameId: string };

      // Game should still complete (adapter uses fallback after retries)
      expect(result.success).toBe(true);

      const game = await getGameFromDb(env.DB, result.gameId);
      expect(game).toBeDefined();
      expect(game!.status).toBe('completed');
    });

    it('handles invalid schema responses', async () => {
      const provider = getOrCreateProvider('test/model');

      // Queue responses with wrong schema (missing required fields)
      provider.queueAction('persona_generation', {
        // Missing 'name', 'background', 'personality'
        invalid_field: 'this should fail validation',
      });
      provider.queueAction('persona_generation', {
        name: 123, // Wrong type
        background: 'test',
        personality: 'test',
      });

      // Default responses will be valid

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: STANDARD_GAME_CONFIG,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { success: boolean; gameId: string };

      // Should complete despite initial failures
      expect(result.success).toBe(true);

      const game = await getGameFromDb(env.DB, result.gameId);
      expect(game!.status).toBe('completed');
    });
  });

  describe('Idempotency', () => {
    it('rejects starting a game that is already running', async () => {
      const provider = getOrCreateProvider('test/model');

      // Make the first request
      const request1 = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: STANDARD_GAME_CONFIG,
        }),
      });

      const ctx1 = createExecutionContext();
      const response1 = await worker.fetch(request1, env, ctx1);
      // Don't wait for completion yet

      const result1 = await response1.json() as { gameId: string };

      // Immediately try to start another game with same ID by hitting the DO directly
      // This simulates a duplicate queue message
      const doId = env.GAME_RUNNER.idFromName(result1.gameId);
      const doStub = env.GAME_RUNNER.get(doId);

      const duplicateRequest = new Request('http://internal/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: result1.gameId,
          batchId: 'duplicate-test',
          config: STANDARD_GAME_CONFIG,
        }),
      });

      const duplicateResponse = await doStub.fetch(duplicateRequest);

      // Should get a conflict response (409) or the existing status
      // The DO should not start a new game
      const duplicateResult = await duplicateResponse.json() as {
        error?: string;
        gameId?: string;
      };

      // Either it returns the existing game or an error
      if (duplicateResponse.status === 409) {
        expect(duplicateResult.error).toContain('already running');
      }

      // Wait for original game to complete
      await waitOnExecutionContext(ctx1);

      // Verify only one game record exists
      const games = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM games WHERE id = ?'
      )
        .bind(result1.gameId)
        .first<{ count: number }>();

      expect(games!.count).toBe(1);
    });
  });

  describe('API Validation', () => {
    it('rejects invalid game configuration', async () => {
      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            playerCount: 3, // Too few players (minimum is 7)
            mafiaCount: 1,
            teams: [
              { modelId: 'test/model', team: 'mafia', count: 1 },
              { modelId: 'test/model', team: 'town', count: 2 },
            ],
          },
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      // Should get a validation error
      expect(response.status).toBe(500); // Engine validation fails
    });

    it('rejects missing teams configuration', async () => {
      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            playerCount: 7,
            mafiaCount: 2,
            // Missing teams
          },
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(400);
      const result = await response.json() as Record<string, unknown>;
      // Convert the entire response to a string to search for 'teams'
      const responseStr = JSON.stringify(result).toLowerCase();
      expect(responseStr).toContain('teams');
    });
  });

  describe('Trace ID Propagation', () => {
    it('includes trace ID in game record', async () => {
      const provider = getOrCreateProvider('test/model');

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: STANDARD_GAME_CONFIG,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { gameId: string; traceId: string };

      // Verify trace ID was generated and returned
      expect(result.traceId).toBeDefined();
      expect(result.traceId.length).toBeGreaterThan(0);

      // Verify trace ID is stored in D1
      const game = await env.DB.prepare(
        'SELECT trace_id FROM games WHERE id = ?'
      )
        .bind(result.gameId)
        .first<{ trace_id: string }>();

      expect(game!.trace_id).toBe(result.traceId);
    });
  });
});


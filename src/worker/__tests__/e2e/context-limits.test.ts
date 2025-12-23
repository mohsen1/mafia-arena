/**
 * E2E tests for context window and summarization.
 *
 * Tests:
 * - Context level configuration (full, windowed, summary)
 * - Large game context handling
 * - Token usage tracking
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {
  getOrCreateProvider,
  clearSharedProviders,
  DISCUSSION_GAME_CONFIG,
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

describe('Context Window E2E', () => {
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

  describe('Context Level Configuration', () => {
    it('accepts full context level', async () => {
      const provider = getOrCreateProvider('test-model');

      const config = {
        ...DISCUSSION_GAME_CONFIG,
        contextLevel: 'full' as const,
      };

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { success: boolean; gameId: string; error?: { message?: string } };
      if (!result.success) {
        console.error('Game failed:', result.error);
      }
      expect(result.success).toBe(true);

      // Verify game completed
      const game = await getGameFromDb(env.DB, result.gameId);
      expect(game!.status).toBe('completed');
    });

    it('accepts windowed context level', async () => {
      const provider = getOrCreateProvider('test-model');

      const config = {
        ...DISCUSSION_GAME_CONFIG,
        contextLevel: 'windowed' as const,
        contextWindowSize: 2,
      };

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { success: boolean; gameId: string };
      expect(result.success).toBe(true);

      const game = await getGameFromDb(env.DB, result.gameId);
      expect(game!.status).toBe('completed');
    });

    it('accepts summary context level (default)', async () => {
      const provider = getOrCreateProvider('test-model');

      const config = {
        ...DISCUSSION_GAME_CONFIG,
        contextLevel: 'summary' as const,
      };

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { success: boolean; gameId: string };
      expect(result.success).toBe(true);

      const game = await getGameFromDb(env.DB, result.gameId);
      expect(game!.status).toBe('completed');
    });
  });

  describe('Token Usage Tracking', () => {
    it('tracks total token usage in game record', async () => {
      const provider = getOrCreateProvider('test-model');

      // Configure provider to return specific token counts
      provider.queueAction(
        'persona_generation',
        { name: 'Test', background: 'Test', personality: 'Test' },
        { tokensUsed: { input: 500, output: 100 } }
      );

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: DISCUSSION_GAME_CONFIG,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { gameId: string };
      const game = await getGameFromDb(env.DB, result.gameId);

      // Total tokens should be sum of all AI calls
      expect(game!.total_tokens).toBeGreaterThan(0);
    });

    it('records token usage per AI call in transcript', async () => {
      const provider = getOrCreateProvider('test-model');

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: DISCUSSION_GAME_CONFIG,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { gameId: string };

      // Check transcript for token usage
      const transcript = await env.TRANSCRIPTS.get(
        `games/${result.gameId}/transcript.json`
      );
      const data = await transcript!.json() as {
        events: Array<{
          type: string;
          tokensUsed?: { input: number; output: number };
        }>;
      };

      const aiCalls = data.events.filter((e) => e.type === 'ai_call');

      // Each AI call should have token usage
      for (const call of aiCalls) {
        expect(call.tokensUsed).toBeDefined();
        expect(call.tokensUsed!.input).toBeGreaterThan(0);
        expect(call.tokensUsed!.output).toBeGreaterThan(0);
      }
    });
  });

  describe('Discussion Phases', () => {
    it('handles games with discussion enabled', async () => {
      const provider = getOrCreateProvider('test-model');

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: DISCUSSION_GAME_CONFIG,
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { success: boolean; gameId: string };
      expect(result.success).toBe(true);

      // Verify transcript has discussion events
      const transcript = await env.TRANSCRIPTS.get(
        `games/${result.gameId}/transcript.json`
      );
      const data = await transcript!.json() as {
        events: Array<{ type: string }>;
      };

      const discussionEvents = data.events.filter(
        (e) => e.type === 'discussion'
      );
      expect(discussionEvents.length).toBeGreaterThan(0);
    });

    it('records discussion messages from all players', async () => {
      const provider = getOrCreateProvider('test-model');

      const request = new Request('http://test/api/games/run-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            ...DISCUSSION_GAME_CONFIG,
            dayDiscussionRounds: 2, // Multiple discussion rounds
          },
        }),
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      const result = await response.json() as { gameId: string };

      const transcript = await env.TRANSCRIPTS.get(
        `games/${result.gameId}/transcript.json`
      );
      const data = await transcript!.json() as {
        events: Array<{
          type: string;
          playerName?: string;
          message?: string;
        }>;
      };

      const discussionEvents = data.events.filter(
        (e) => e.type === 'discussion'
      );

      // Each alive player should have discussion events
      // In round 1 with 7 players, we should have at least 7 discussion messages
      expect(discussionEvents.length).toBeGreaterThanOrEqual(7);

      // Verify messages are captured
      for (const event of discussionEvents) {
        expect(event.playerName).toBeDefined();
        expect(event.message).toBeDefined();
        expect(event.message!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Persona Theme', () => {
    it('uses specified persona theme', async () => {
      const provider = getOrCreateProvider('test-model');

      const themes = ['noir', 'victorian', 'modern', 'fantasy'] as const;

      for (const theme of themes) {
        clearSharedProviders();
        await cleanupTestData(env.DB);

        const freshProvider = getOrCreateProvider('test-model');

        const request = new Request('http://test/api/games/run-direct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            config: {
              ...DISCUSSION_GAME_CONFIG,
              personaTheme: theme,
            },
          }),
        });

        const ctx = createExecutionContext();
        const response = await worker.fetch(request, env, ctx);
        await waitOnExecutionContext(ctx);

        const result = await response.json() as { success: boolean; gameId: string };
        expect(result.success).toBe(true);

        // Verify theme is stored
        const game = await env.DB.prepare(
          'SELECT persona_theme FROM games WHERE id = ?'
        )
          .bind(result.gameId)
          .first<{ persona_theme: string }>();

        expect(game!.persona_theme).toBe(theme);
      }
    });
  });
});


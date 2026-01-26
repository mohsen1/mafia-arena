/**
 * Leaderboard API route E2E tests.
 * Validates response structure, pagination, and field naming conventions.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { initializeTestDatabase, cleanupTestData } from './setup.js';
import worker from '../index.js';

describe('Leaderboard API E2E', () => {
  beforeAll(async () => {
    await initializeTestDatabase(env.DB);
  });

  beforeEach(async () => {
    // Clean and seed test data
    await cleanupTestData(env.DB);

    // Insert test models (use IDs that won't be filtered by leaderboard query)
    await env.DB.prepare(`
      INSERT OR IGNORE INTO models (id, family, display_name, api_provider, api_model_id)
      VALUES ('e2e-test-model-1', 'test', 'E2E Test Model 1', 'openrouter', 'e2e-test-1')
    `).run();

    await env.DB.prepare(`
      INSERT OR IGNORE INTO models (id, family, display_name, api_provider, api_model_id)
      VALUES ('e2e-test-model-2', 'test', 'E2E Test Model 2', 'openrouter', 'e2e-test-2')
    `).run();

    // Insert leaderboard entries (games_played >= 3 to meet minimum threshold)
    await env.DB.prepare(`
      INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens)
      VALUES ('e2e-test-model-1', 'mafia', 10, 7, 50000)
    `).run();

    await env.DB.prepare(`
      INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens)
      VALUES ('e2e-test-model-2', 'town', 8, 4, 40000)
    `).run();
  });

  describe('GET /api/leaderboard', () => {
    it('should return data in standard pagination format', async () => {
      const request = new Request('http://test/api/leaderboard');
      const response = await worker.fetch(request, env);
      const json = await response.json() as { data: unknown[]; pagination: unknown };

      expect(json).toHaveProperty('data');
      expect(json).toHaveProperty('pagination');
      expect(Array.isArray(json.data)).toBe(true);
    });

    it('should use camelCase field names in response', async () => {
      const request = new Request('http://test/api/leaderboard');
      const response = await worker.fetch(request, env);
      const json = await response.json() as { data: Array<Record<string, unknown>> };

      expect(json.data.length).toBeGreaterThan(0);
      const entry = json.data[0];

      // Verify camelCase field names (not snake_case)
      expect(entry).toHaveProperty('modelId');
      expect(entry).toHaveProperty('displayName');
      expect(entry).toHaveProperty('gamesPlayed');
      expect(entry).toHaveProperty('gamesWon');
      expect(entry).toHaveProperty('winRate');
      expect(entry).toHaveProperty('totalTokens');

      // Verify old snake_case names are NOT present
      expect(entry).not.toHaveProperty('model_id');
      expect(entry).not.toHaveProperty('display_name');
      expect(entry).not.toHaveProperty('games_played');
      expect(entry).not.toHaveProperty('games_won');
      expect(entry).not.toHaveProperty('win_rate');
      expect(entry).not.toHaveProperty('total_tokens');
    });

    it('should include all required leaderboard fields', async () => {
      const request = new Request('http://test/api/leaderboard');
      const response = await worker.fetch(request, env);
      const json = await response.json() as { data: Array<Record<string, unknown>> };
      const entry = json.data[0];

      expect(entry).toMatchObject({
        modelId: expect.any(String),
        displayName: expect.any(String),
        provider: expect.any(String),
        team: expect.any(String),
        gamesPlayed: expect.any(Number),
        gamesWon: expect.any(Number),
        winRate: expect.any(Number),
        totalTokens: expect.any(Number),
      });
    });

    it('should have correct pagination metadata', async () => {
      const request = new Request('http://test/api/leaderboard?limit=2&offset=0');
      const response = await worker.fetch(request, env);
      const json = await response.json() as {
        data: unknown[];
        pagination: { total: number; limit: number; offset: number; hasMore: boolean };
      };

      expect(json.pagination).toMatchObject({
        total: expect.any(Number),
        limit: expect.any(Number),
        offset: expect.any(Number),
        hasMore: expect.any(Boolean),
      });

      expect(json.pagination.total).toBeGreaterThanOrEqual(json.data.length);
    });
  });

  describe('Team filtering', () => {
    it('should filter by mafia team', async () => {
      const request = new Request('http://test/api/leaderboard?team=mafia');
      const response = await worker.fetch(request, env);
      const json = await response.json() as { data: unknown[] };

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
    });

    it('should filter by town team', async () => {
      const request = new Request('http://test/api/leaderboard?team=town');
      const response = await worker.fetch(request, env);
      const json = await response.json() as { data: unknown[] };

      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
    });
  });

  describe('Response format validation', () => {
    it('should maintain consistent types for numeric fields', async () => {
      const request = new Request('http://test/api/leaderboard');
      const response = await worker.fetch(request, env);
      const json = await response.json() as {
        data: Array<{
          gamesPlayed: unknown;
          gamesWon: unknown;
          winRate: unknown;
          totalTokens: unknown;
        }>;
      };
      const entry = json.data[0];

      expect(typeof entry.gamesPlayed).toBe('number');
      expect(typeof entry.gamesWon).toBe('number');
      expect(typeof entry.winRate).toBe('number');
      expect(typeof entry.totalTokens).toBe('number');
    });

    it('should maintain consistent types for string fields', async () => {
      const request = new Request('http://test/api/leaderboard');
      const response = await worker.fetch(request, env);
      const json = await response.json() as {
        data: Array<{
          modelId: unknown;
          displayName: unknown;
          provider: unknown;
          team: unknown;
        }>;
      };
      const entry = json.data[0];

      expect(typeof entry.modelId).toBe('string');
      expect(typeof entry.displayName).toBe('string');
      expect(typeof entry.provider).toBe('string');
      expect(typeof entry.team).toBe('string');
    });

    it('should validate team enum values', async () => {
      const request = new Request('http://test/api/leaderboard');
      const response = await worker.fetch(request, env);
      const json = await response.json() as { data: Array<{ team: string }> };

      for (const entry of json.data) {
        expect(['mafia', 'town']).toContain(entry.team);
      }
    });
  });
});

/**
 * E2E tests for admin API routes.
 *
 * Tests the Drizzle ORM integration for admin operations:
 * - Game management (fail, complete)
 * - DLQ management (list, retry, discard)
 * - Model management (list, delete)
 * - Maintenance operations (find duplicates)
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { initializeTestDatabase, cleanupTestData } from '../setup.js';
import worker from '../../index.js';

// Helper to create admin auth header
function adminAuthHeader(): HeadersInit {
  // Use test credentials - these are set in .dev.vars
  const username = env.ADMIN_USERNAME || 'admin';
  const password = env.ADMIN_PASSWORD || 'test-password';
  const credentials = btoa(`${username}:${password}`);
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
}

// Helper to make admin API requests
async function adminRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const request = new Request(`http://test/api/admin${path}`, {
    ...options,
    headers: {
      ...adminAuthHeader(),
      ...(options.headers || {}),
    },
  });

  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe('Admin Routes E2E', () => {
  beforeAll(async () => {
    await initializeTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupTestData(env.DB);
  });

  describe('Authentication', () => {
    it('rejects requests without auth header', async () => {
      const request = new Request('http://test/api/admin/models', {
        method: 'GET',
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });

    it('rejects requests with invalid credentials', async () => {
      const request = new Request('http://test/api/admin/models', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa('wrong:credentials')}`,
        },
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);

      expect(response.status).toBe(401);
    });
  });

  describe('Model Management', () => {
    it('GET /models returns list of models', async () => {
      const response = await adminRequest('/models');
      
      expect(response.status).toBe(200);
      const data = await response.json() as { models: unknown[] };
      expect(data.models).toBeDefined();
      expect(Array.isArray(data.models)).toBe(true);
    });

    it('DELETE /models/:id returns 404 for non-existent model', async () => {
      const response = await adminRequest('/models/non-existent-model', {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
    });

    it('DELETE /models/:id deletes existing model', async () => {
      // Use a model ID without slashes to avoid URL encoding issues
      await env.DB.prepare(
        `INSERT INTO models (id, family, display_name, api_provider) 
         VALUES ('test-delete-me', 'test', 'Delete Me Model', 'openrouter')`
      ).run();

      const response = await adminRequest('/models/test-delete-me', {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);

      // Verify deletion
      const check = await env.DB.prepare(
        `SELECT id FROM models WHERE id = ?`
      ).bind('test-delete-me').first();
      expect(check).toBeNull();
    });
  });

  describe('Game Management', () => {
    beforeEach(async () => {
      // Insert a test game
      await env.DB.prepare(
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, status, created_at)
         VALUES ('test-game-1', 'test-batch', 'hash123', 7, 2, 'running', ?)`
      ).bind(Date.now()).run();
    });

    it('POST /games/:id/fail marks game as failed', async () => {
      const response = await adminRequest('/games/test-game-1/fail', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Admin marked as failed' }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);

      // Verify status change
      const game = await env.DB.prepare(
        `SELECT status, error_message FROM games WHERE id = ?`
      ).bind('test-game-1').first<{ status: string; error_message: string }>();
      
      expect(game?.status).toBe('failed');
      expect(game?.error_message).toContain('Admin marked as failed');
    });

    it('POST /games/:id/fail returns 404 for non-existent game', async () => {
      const response = await adminRequest('/games/non-existent/fail', {
        method: 'POST',
        body: JSON.stringify({ reason: 'test' }),
      });

      expect(response.status).toBe(404);
    });

    it('POST /games/:id/complete force-completes a game', async () => {
      const response = await adminRequest('/games/test-game-1/complete', {
        method: 'POST',
        body: JSON.stringify({ winner: 'town', rounds: 5 }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);

      // Verify completion
      const game = await env.DB.prepare(
        `SELECT status, winner, rounds FROM games WHERE id = ?`
      ).bind('test-game-1').first<{ status: string; winner: string; rounds: number }>();
      
      expect(game?.status).toBe('completed');
      expect(game?.winner).toBe('town');
      expect(game?.rounds).toBe(5);
    });

    it('POST /games/:id/complete validates winner value', async () => {
      const response = await adminRequest('/games/test-game-1/complete', {
        method: 'POST',
        body: JSON.stringify({ winner: 'invalid', rounds: 5 }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('DLQ Management', () => {
    beforeEach(async () => {
      // Insert test DLQ entries
      await env.DB.prepare(
        `INSERT INTO dlq_entries (id, queue_name, message_body, error_message, attempts, created_at)
         VALUES ('dlq-1', 'GAME_QUEUE', '{"gameId":"game-1"}', 'Test error', 3, ?)`
      ).bind(Date.now()).run();

      await env.DB.prepare(
        `INSERT INTO dlq_entries (id, queue_name, message_body, error_message, attempts, status, created_at)
         VALUES ('dlq-2', 'BATCH_QUEUE', '{"batchId":"batch-1"}', 'Another error', 2, 'retried', ?)`
      ).bind(Date.now() - 1000).run();
    });

    it('GET /dlq returns pending entries by default', async () => {
      const response = await adminRequest('/dlq');

      expect(response.status).toBe(200);
      const data = await response.json() as { entries: Array<{ id: string }> };
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
      
      // Should only include pending entries
      const ids = data.entries.map(e => e.id);
      expect(ids).toContain('dlq-1');
      expect(ids).not.toContain('dlq-2'); // This is 'retried' status
    });

    it('GET /dlq?status=retried returns retried entries', async () => {
      const response = await adminRequest('/dlq?status=retried');

      expect(response.status).toBe(200);
      const data = await response.json() as { entries: Array<{ id: string }> };
      
      const ids = data.entries.map(e => e.id);
      expect(ids).toContain('dlq-2');
      expect(ids).not.toContain('dlq-1');
    });

    it('GET /dlq/stats returns statistics', async () => {
      const response = await adminRequest('/dlq/stats');

      expect(response.status).toBe(200);
      const data = await response.json() as { 
        total: number;
        byQueue: Record<string, number>;
        byStatus: Record<string, number>;
      };
      
      expect(data.total).toBeGreaterThanOrEqual(2);
      expect(data.byQueue).toBeDefined();
      expect(data.byStatus).toBeDefined();
    });

    it('POST /dlq/:id/discard marks entry as discarded', async () => {
      const response = await adminRequest('/dlq/dlq-1/discard', {
        method: 'POST',
      });

      expect(response.status).toBe(200);
      const data = await response.json() as { success: boolean };
      expect(data.success).toBe(true);

      // Verify status change
      const entry = await env.DB.prepare(
        `SELECT status FROM dlq_entries WHERE id = ?`
      ).bind('dlq-1').first<{ status: string }>();
      
      expect(entry?.status).toBe('discarded');
    });

    it('POST /dlq/:id/discard returns 404 for non-existent entry', async () => {
      const response = await adminRequest('/dlq/non-existent/discard', {
        method: 'POST',
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Maintenance Operations', () => {
    it('GET /maintenance/find-duplicates returns duplicate analysis', async () => {
      // Insert some models with similar names
      await env.DB.prepare(
        `INSERT INTO models (id, family, display_name, api_provider) VALUES
         ('anthropic/claude-3-sonnet', 'anthropic', 'Claude 3 Sonnet', 'openrouter'),
         ('anthropic/claude-3-sonnet-20240229', 'anthropic', 'Claude 3 Sonnet (Old)', 'openrouter')`
      ).run();

      const response = await adminRequest('/maintenance/find-duplicates');

      expect(response.status).toBe(200);
      const data = await response.json() as { 
        success: boolean;
        duplicates: unknown[];
      };
      
      expect(data.success).toBe(true);
      expect(Array.isArray(data.duplicates)).toBe(true);
    });

    it('GET /maintenance/low-sample-models returns models with few games', async () => {
      // Insert a model with no games
      await env.DB.prepare(
        `INSERT INTO models (id, family, display_name, api_provider) 
         VALUES ('test/no-games', 'test', 'No Games Model', 'openrouter')`
      ).run();

      const response = await adminRequest('/maintenance/low-sample-models');

      expect(response.status).toBe(200);
      const data = await response.json() as { 
        success: boolean;
        models: Array<{ id: string; gamesPlayed: number }>;
      };
      
      expect(data.success).toBe(true);
      expect(Array.isArray(data.models)).toBe(true);
    });
  });

  describe('Batch Management', () => {
    it('GET /batches returns empty list initially', async () => {
      const response = await adminRequest('/batches');

      expect(response.status).toBe(200);
      const data = await response.json() as { batches: unknown[] };
      expect(data.batches).toBeDefined();
      expect(Array.isArray(data.batches)).toBe(true);
    });

    it('GET /batches/:id returns 404 for non-existent batch', async () => {
      const response = await adminRequest('/batches/non-existent');

      expect(response.status).toBe(404);
    });
  });
});


/**
 * Unit tests for batch service logic.
 * Tests race condition protection and batch statistics updates.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { initializeTestDatabase, cleanupTestData } from './setup.js';
import { processBatchMessage, getBatch } from '../batch/service.js';
import type { BatchConfig } from '../types.js';

describe('Batch Service', () => {
  beforeAll(async () => {
    await initializeTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupTestData(env.DB);
  });

  const createMockConfig = (overrides: Partial<BatchConfig> = {}): BatchConfig => ({
    name: 'Test Batch',
    totalGames: 5,
    gameConfig: {
      playerCount: 7,
      mafiaCount: 2,
      teams: [
        { modelId: 'test/model', team: 'mafia', count: 2 },
        { modelId: 'test/model', team: 'town', count: 5 },
      ],
      maxRounds: 10,
      discussionEnabled: true,
      contextLevel: 'windowed',
      personaConstraints: 'moderate',
    },
    createdBy: 'test-user',
    userId: 'user-123',
    ...overrides,
  });

  describe('processBatchMessage - Race Condition Protection', () => {
    it('should skip processing if batch status is cancelled', async () => {
      const batchId = 'batch-cancelled-test';
      const config = createMockConfig();

      // Create a batch that is already marked 'cancelled'
      await env.DB.prepare(`
        INSERT INTO batches (id, name, status, total_games, games_queued, config_json, created_by)
        VALUES (?, 'Race Test', 'cancelled', 5, 0, ?, 'test-user')
      `).bind(batchId, JSON.stringify(config)).run();

      // Try to process it
      await processBatchMessage(env, batchId, config, 'test-trace');

      // Verify NO games were queued and status unchanged
      const batch = await env.DB.prepare('SELECT status, games_queued FROM batches WHERE id = ?')
        .bind(batchId).first<{ status: string; games_queued: number }>();

      expect(batch?.status).toBe('cancelled');
      expect(batch?.games_queued).toBe(0);
    });

    it('should skip processing if batch status is failed', async () => {
      const batchId = 'batch-failed-test';
      const config = createMockConfig();

      // Create a batch that is already marked 'failed'
      await env.DB.prepare(`
        INSERT INTO batches (id, name, status, total_games, games_queued, config_json, created_by)
        VALUES (?, 'Failed Test', 'failed', 5, 0, ?, 'test-user')
      `).bind(batchId, JSON.stringify(config)).run();

      // Try to process it
      await processBatchMessage(env, batchId, config, 'test-trace');

      // Verify status unchanged
      const batch = await env.DB.prepare('SELECT status, games_queued FROM batches WHERE id = ?')
        .bind(batchId).first<{ status: string; games_queued: number }>();

      expect(batch?.status).toBe('failed');
      expect(batch?.games_queued).toBe(0);
    });

    it('should process batch normally if status is queued', async () => {
      const batchId = 'batch-normal-test';
      const config = createMockConfig();

      // Create a batch in queued status
      await env.DB.prepare(`
        INSERT INTO batches (id, name, status, total_games, games_queued, config_json, created_by)
        VALUES (?, 'Normal Test', 'queued', 5, 0, ?, 'test-user')
      `).bind(batchId, JSON.stringify(config)).run();

      // Process it
      await processBatchMessage(env, batchId, config, 'test-trace');

      // Verify status changed to processing and games were queued
      const batch = await env.DB.prepare('SELECT status, games_queued FROM batches WHERE id = ?')
        .bind(batchId).first<{ status: string; games_queued: number }>();

      expect(batch?.status).toBe('processing');
      expect(batch?.games_queued).toBe(5);
    });

    it('should resume from checkpoint if partially processed', async () => {
      const batchId = 'batch-resume-test';
      const config = createMockConfig();

      // Create a batch that was partially processed (3 of 5 games queued)
      await env.DB.prepare(`
        INSERT INTO batches (id, name, status, total_games, games_queued, config_json, created_by)
        VALUES (?, 'Resume Test', 'processing', 5, 3, ?, 'test-user')
      `).bind(batchId, JSON.stringify(config)).run();

      // Process it
      await processBatchMessage(env, batchId, config, 'test-trace');

      // Verify it only queued the remaining 2 games
      const batch = await env.DB.prepare('SELECT games_queued FROM batches WHERE id = ?')
        .bind(batchId).first<{ games_queued: number }>();

      expect(batch?.games_queued).toBe(5);
    });

    it('should not re-process fully queued batch', async () => {
      const batchId = 'batch-fully-queued';
      const config = createMockConfig();

      // Create a batch that is already fully queued
      await env.DB.prepare(`
        INSERT INTO batches (id, name, status, total_games, games_queued, config_json, created_by)
        VALUES (?, 'Full Test', 'processing', 5, 5, ?, 'test-user')
      `).bind(batchId, JSON.stringify(config)).run();

      // Process it (should be a no-op)
      await processBatchMessage(env, batchId, config, 'test-trace');

      // Verify it stayed at 5 (no additional games)
      const batch = await env.DB.prepare('SELECT games_queued FROM batches WHERE id = ?')
        .bind(batchId).first<{ games_queued: number }>();

      expect(batch?.games_queued).toBe(5);
    });
  });

  describe('getBatch', () => {
    it('should return null for non-existent batch', async () => {
      const batch = await getBatch(env, 'non-existent-batch');
      expect(batch).toBeNull();
    });

    it('should return batch record with all fields', async () => {
      const batchId = 'batch-get-test';
      await env.DB.prepare(`
        INSERT INTO batches (id, name, status, total_games, completed_games, failed_games, games_queued, config_json, created_by)
        VALUES (?, 'Get Test', 'processing', 10, 3, 1, 7, '{}', 'test-user')
      `).bind(batchId).run();

      const batch = await getBatch(env, batchId);

      expect(batch).not.toBeNull();
      expect(batch?.id).toBe(batchId);
      expect(batch?.status).toBe('processing');
      expect(batch?.total_games).toBe(10);
      expect(batch?.completed_games).toBe(3);
      expect(batch?.failed_games).toBe(1);
      expect(batch?.games_queued).toBe(7);
    });
  });

  describe('Batch Status Transitions', () => {
    it('should handle failed status from queue processing', async () => {
      const batchId = 'batch-queue-failed';

      // Create a batch
      await env.DB.prepare(`
        INSERT INTO batches (id, name, status, total_games, config_json, created_by)
        VALUES (?, 'Queue Fail Test', 'processing', 5, '{}', 'test-user')
      `).bind(batchId).run();

      // Simulate what happens when queue processing fails (index.ts handleBatchMessage)
      const errorMessage = 'Queue processing failed: API timeout';
      await env.DB.prepare(`
        UPDATE batches 
        SET status = 'failed', error_message = ? 
        WHERE id = ?
      `).bind(errorMessage, batchId).run();

      // Verify
      const batch = await env.DB.prepare('SELECT status, error_message FROM batches WHERE id = ?')
        .bind(batchId).first<{ status: string; error_message: string }>();

      expect(batch?.status).toBe('failed');
      expect(batch?.error_message).toContain('Queue processing failed');
    });
  });
});


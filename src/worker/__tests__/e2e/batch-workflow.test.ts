/**
 * E2E tests for batch workflow processing.
 *
 * Tests the full batch API flow:
 * - Batch creation and request storage
 * - Request aggregation with atomic claiming
 * - Provider batch submission
 * - Polling and result dispatch
 * - Error handling and retries
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { initializeTestDatabase, cleanupTestData } from '../setup.js';
import { BatchService } from '../../batch/BatchService.js';
import type { AIRequestMessage } from '../../ai/types.js';
import type { BatchProvider, BatchRequest, BatchRequestResult } from '../../batch/types.js';

// Mock batch provider for testing
class MockBatchProvider {
  readonly name: BatchProvider = 'anthropic';
  public createBatchCalls: Array<{ requests: BatchRequest[]; options?: { internalJobId?: string } }> = [];
  public checkStatusCalls: string[] = [];
  public getResultsCalls: Array<{ jobId: string; outputResourceId?: string }> = [];
  
  private _nextCreateBatchResult: { providerJobId: string; inputResourceId?: string; metadata?: Record<string, unknown> } = {
    providerJobId: 'mock-provider-job-123',
  };
  private _nextStatusResult: { status: 'completed' | 'processing' | 'failed'; completedCount?: number; failedCount?: number; outputResourceId?: string; error?: string } = {
    status: 'processing',
  };
  private _nextResults: BatchRequestResult[] = [];
  private _shouldFail = false;
  private _failError = 'Mock provider error';

  setNextCreateBatchResult(result: typeof this._nextCreateBatchResult): void {
    this._nextCreateBatchResult = result;
  }

  setNextStatusResult(result: typeof this._nextStatusResult): void {
    this._nextStatusResult = result;
  }

  setNextResults(results: BatchRequestResult[]): void {
    this._nextResults = results;
  }

  setShouldFail(shouldFail: boolean, error?: string): void {
    this._shouldFail = shouldFail;
    if (error) this._failError = error;
  }

  async createBatch(requests: BatchRequest[], options?: { internalJobId?: string }): Promise<typeof this._nextCreateBatchResult> {
    this.createBatchCalls.push({ requests, options });
    if (this._shouldFail) {
      throw new Error(this._failError);
    }
    return this._nextCreateBatchResult;
  }

  async checkStatus(providerJobId: string): Promise<typeof this._nextStatusResult> {
    this.checkStatusCalls.push(providerJobId);
    return this._nextStatusResult;
  }

  async getResults(providerJobId: string, outputResourceId?: string): Promise<BatchRequestResult[]> {
    this.getResultsCalls.push({ jobId: providerJobId, outputResourceId });
    return this._nextResults;
  }

  async cancelBatch(_providerJobId: string): Promise<void> {
    // No-op for tests
  }

  formatRequest(_request: unknown, _customId: string, _modelId: string): unknown {
    return { mock: true };
  }

  parseResponse(_providerResponse: unknown, _modelId?: string): { content: string; tokensUsed: { input: number; output: number; total: number }; latencyMs: number; modelId: string } {
    return {
      content: '{"test": "response"}',
      tokensUsed: { input: 100, output: 50, total: 150 },
      latencyMs: 100,
      modelId: 'anthropic/claude-test',
    };
  }

  reset(): void {
    this.createBatchCalls = [];
    this.checkStatusCalls = [];
    this.getResultsCalls = [];
    this._shouldFail = false;
    this._nextStatusResult = { status: 'processing' };
    this._nextResults = [];
  }
}

describe('Batch Workflow E2E', () => {
  let batchService: BatchService;
  let mockProvider: MockBatchProvider;

  beforeAll(async () => {
    await initializeTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupTestData(env.DB);
    
    // Create batch service with test options
    batchService = new BatchService(env, {
      minBatchSize: 2, // Lower threshold for testing
      maxBatchSize: 10,
      maxWaitTimeMs: 1000, // 1 second for testing
      pollIntervalMs: 100,
    });
    
    // Register mock provider
    mockProvider = new MockBatchProvider();
    batchService.registerProvider(mockProvider as unknown as Parameters<typeof batchService.registerProvider>[0]);
  });

  describe('Request Storage', () => {
    it('should store batch API requests in D1', async () => {
      const message: AIRequestMessage = {
        requestId: 'test-request-1',
        gameId: 'test-game-1',
        modelId: 'anthropic/claude-test',
        request: {
          systemPrompt: 'You are a test AI',
          userPrompt: 'Hello',
          temperature: 0.7,
          maxTokens: 100,
        },
        context: {
          round: 1,
          phase: 'discussion',
          playerId: 'player_1',
          actionType: 'discussion',
        },
        timestamp: Date.now(),
        discountPricing: true,
      };

      await batchService.storeRequest(message);

      // Verify request was stored
      const stored = await env.DB.prepare(`
        SELECT * FROM batch_api_requests WHERE request_id = ?
      `).bind('test-request-1').first();

      expect(stored).toBeDefined();
      expect(stored!.game_id).toBe('test-game-1');
      expect(stored!.model_id).toBe('anthropic/claude-test');
      expect(stored!.provider).toBe('anthropic');
      expect(stored!.status).toBe('pending');
    });

    it('should reject requests for models that do not support batch pricing', async () => {
      const message: AIRequestMessage = {
        requestId: 'test-request-2',
        gameId: 'test-game-2',
        modelId: 'test/model', // Uses openrouter, no batch support
        request: {
          systemPrompt: 'Test',
          userPrompt: 'Test',
          temperature: 0.7,
          maxTokens: 100,
        },
        context: {
          round: 1,
          phase: 'discussion',
          playerId: 'player_1',
          actionType: 'discussion',
        },
        timestamp: Date.now(),
        discountPricing: true,
      };

      await expect(batchService.storeRequest(message)).rejects.toThrow(
        /does not support batch pricing/
      );
    });
  });

  describe('Request Aggregation', () => {
    it('should aggregate pending requests into batches', async () => {
      // Store multiple requests
      for (let i = 0; i < 5; i++) {
        await env.DB.prepare(`
          INSERT INTO batch_api_requests (
            id, request_id, custom_id, game_id, model_id, provider,
            request_body, context_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
          `req-${i}`,
          `request-${i}`,
          `custom-${i}`,
          `game-${i}`,
          'anthropic/claude-test',
          'anthropic',
          JSON.stringify({ systemPrompt: 'Test', userPrompt: 'Test' }),
          JSON.stringify({ round: 1, phase: 'test', playerId: `player_${i}`, actionType: 'test' }),
          Date.now() - 60000 // Created 1 minute ago
        ).run();
      }

      // Run aggregation
      const result = await batchService.aggregateAndSubmit();

      expect(result.batchesCreated).toBe(1);
      expect(result.requestsProcessed).toBe(5);
      expect(mockProvider.createBatchCalls.length).toBe(1);
      expect(mockProvider.createBatchCalls[0]!.requests.length).toBe(5);
    });

    it('should use atomic claiming to prevent race conditions', async () => {
      // Store requests
      for (let i = 0; i < 3; i++) {
        await env.DB.prepare(`
          INSERT INTO batch_api_requests (
            id, request_id, custom_id, game_id, model_id, provider,
            request_body, context_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
          `claim-req-${i}`,
          `claim-request-${i}`,
          `claim-custom-${i}`,
          `claim-game-${i}`,
          'anthropic/claude-test',
          'anthropic',
          JSON.stringify({ systemPrompt: 'Test', userPrompt: 'Test' }),
          JSON.stringify({ round: 1, phase: 'test', playerId: `player_${i}`, actionType: 'test' }),
          Date.now() - 60000
        ).run();
      }

      // First aggregation should claim and process
      const result1 = await batchService.aggregateAndSubmit();
      expect(result1.requestsProcessed).toBe(3);

      // Second aggregation should find no pending requests
      const result2 = await batchService.aggregateAndSubmit();
      expect(result2.requestsProcessed).toBe(0);
    });

    it('should release claims on failure', async () => {
      // Store requests
      for (let i = 0; i < 3; i++) {
        await env.DB.prepare(`
          INSERT INTO batch_api_requests (
            id, request_id, custom_id, game_id, model_id, provider,
            request_body, context_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
          `fail-req-${i}`,
          `fail-request-${i}`,
          `fail-custom-${i}`,
          `fail-game-${i}`,
          'anthropic/claude-test',
          'anthropic',
          JSON.stringify({ systemPrompt: 'Test', userPrompt: 'Test' }),
          JSON.stringify({ round: 1, phase: 'test', playerId: `player_${i}`, actionType: 'test' }),
          Date.now() - 60000
        ).run();
      }

      // Make provider fail
      mockProvider.setShouldFail(true, 'Simulated failure');

      // First aggregation should fail
      await batchService.aggregateAndSubmit();

      // Requests should be back to pending
      const pending = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM batch_api_requests WHERE status = 'pending'
      `).first<{ count: number }>();
      expect(pending!.count).toBe(3);

      // Batch job should be marked as failed
      const failedJobs = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM batch_api_jobs WHERE status = 'failed'
      `).first<{ count: number }>();
      expect(failedJobs!.count).toBe(1);
    });
  });

  describe('Job Polling and Dispatch', () => {
    it('should poll active jobs and dispatch results', async () => {
      // Create a submitted job
      const jobId = 'test-job-1';
      const providerJobId = 'provider-job-1';
      await env.DB.prepare(`
        INSERT INTO batch_api_jobs (
          id, provider, provider_job_id, model_id, status, request_count, created_at
        ) VALUES (?, 'anthropic', ?, 'anthropic/claude-test', 'submitted', 2, ?)
      `).bind(jobId, providerJobId, Date.now()).run();

      // Create bundled requests
      for (let i = 0; i < 2; i++) {
        await env.DB.prepare(`
          INSERT INTO batch_api_requests (
            id, request_id, custom_id, batch_job_id, game_id, model_id, provider,
            request_body, context_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bundled', ?)
        `).bind(
          `poll-req-${i}`,
          `poll-request-${i}`,
          `poll-custom-${i}`,
          jobId,
          `poll-game-${i}`,
          'anthropic/claude-test',
          'anthropic',
          JSON.stringify({ systemPrompt: 'Test', userPrompt: 'Test' }),
          JSON.stringify({ round: 1, phase: 'test', playerId: `player_${i}`, actionType: 'test' }),
          Date.now()
        ).run();
      }

      // Configure mock to return completed status with results
      mockProvider.setNextStatusResult({
        status: 'completed',
        completedCount: 2,
        outputResourceId: 'output-123',
      });
      mockProvider.setNextResults([
        {
          customId: 'poll-custom-0',
          success: true,
          response: {
            content: '{"message": "Test response 0"}',
            tokensUsed: { input: 100, output: 50, total: 150 },
            latencyMs: 100,
            modelId: 'anthropic/claude-test',
          },
        },
        {
          customId: 'poll-custom-1',
          success: true,
          response: {
            content: '{"message": "Test response 1"}',
            tokensUsed: { input: 100, output: 50, total: 150 },
            latencyMs: 100,
            modelId: 'anthropic/claude-test',
          },
        },
      ]);

      // Run polling
      const result = await batchService.pollAndDispatch();

      expect(result.jobsPolled).toBe(1);
      expect(result.jobsCompleted).toBe(1);
      expect(result.resultsDispatched).toBe(2);

      // Verify job is marked completed
      const job = await env.DB.prepare(`
        SELECT status FROM batch_api_jobs WHERE id = ?
      `).bind(jobId).first<{ status: string }>();
      expect(job!.status).toBe('completed');

      // Verify requests are marked completed
      const completedRequests = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM batch_api_requests WHERE batch_job_id = ? AND status = 'completed'
      `).bind(jobId).first<{ count: number }>();
      expect(completedRequests!.count).toBe(2);
    });

    it('should handle job failures gracefully', async () => {
      // Create a submitted job
      const jobId = 'fail-job-1';
      await env.DB.prepare(`
        INSERT INTO batch_api_jobs (
          id, provider, provider_job_id, model_id, status, request_count, created_at
        ) VALUES (?, 'anthropic', 'provider-fail-1', 'anthropic/claude-test', 'submitted', 1, ?)
      `).bind(jobId, Date.now()).run();

      // Create bundled request
      await env.DB.prepare(`
        INSERT INTO batch_api_requests (
          id, request_id, custom_id, batch_job_id, game_id, model_id, provider,
          request_body, context_json, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'bundled', ?)
      `).bind(
        'fail-req-1',
        'fail-request-1',
        'fail-custom-1',
        jobId,
        'fail-game-1',
        'anthropic/claude-test',
        'anthropic',
        JSON.stringify({ systemPrompt: 'Test', userPrompt: 'Test' }),
        JSON.stringify({ round: 1, phase: 'test', playerId: 'player_1', actionType: 'test' }),
        Date.now()
      ).run();

      // Configure mock to return failed status
      mockProvider.setNextStatusResult({
        status: 'failed',
        error: 'Provider error: rate limit exceeded',
      });

      // Run polling
      await batchService.pollAndDispatch();

      // Verify job is marked failed
      const job = await env.DB.prepare(`
        SELECT status, error_message FROM batch_api_jobs WHERE id = ?
      `).bind(jobId).first<{ status: string; error_message: string }>();
      expect(job!.status).toBe('failed');
      expect(job!.error_message).toContain('rate limit');

      // Verify request is marked failed
      const request = await env.DB.prepare(`
        SELECT status, error_message FROM batch_api_requests WHERE batch_job_id = ?
      `).bind(jobId).first<{ status: string; error_message: string }>();
      expect(request!.status).toBe('failed');
    });
  });

  describe('Batch Statistics', () => {
    it('should return accurate batch statistics', async () => {
      // Create some pending requests
      for (let i = 0; i < 3; i++) {
        await env.DB.prepare(`
          INSERT INTO batch_api_requests (
            id, request_id, custom_id, game_id, model_id, provider,
            request_body, context_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(
          `stats-req-${i}`,
          `stats-request-${i}`,
          `stats-custom-${i}`,
          `stats-game-${i}`,
          'anthropic/claude-test',
          'anthropic',
          JSON.stringify({ systemPrompt: 'Test', userPrompt: 'Test' }),
          JSON.stringify({ round: 1, phase: 'test', playerId: `player_${i}`, actionType: 'test' }),
          Date.now()
        ).run();
      }

      // Create an active job
      await env.DB.prepare(`
        INSERT INTO batch_api_jobs (
          id, provider, model_id, status, request_count, created_at
        ) VALUES ('stats-job-1', 'anthropic', 'anthropic/claude-test', 'processing', 5, ?)
      `).bind(Date.now()).run();

      const stats = await batchService.getStats();

      expect(stats.pendingByProvider.anthropic).toBe(3);
      expect(stats.activeJobsByProvider.anthropic).toBe(1);
    });
  });

  describe('Request Grouping', () => {
    it('should group requests by provider and model', async () => {
      // Add requests for different models
      await env.DB.prepare(`
        INSERT INTO batch_api_requests (
          id, request_id, custom_id, game_id, model_id, provider,
          request_body, context_json, status, created_at
        ) VALUES 
          ('group-1', 'group-request-1', 'group-custom-1', 'group-game-1', 'anthropic/claude-test', 'anthropic', '{}', '{}', 'pending', ?),
          ('group-2', 'group-request-2', 'group-custom-2', 'group-game-2', 'anthropic/claude-test', 'anthropic', '{}', '{}', 'pending', ?),
          ('group-3', 'group-request-3', 'group-custom-3', 'group-game-3', 'anthropic/claude-test', 'anthropic', '{}', '{}', 'pending', ?)
      `).bind(Date.now() - 60000, Date.now() - 60000, Date.now() - 60000).run();

      const result = await batchService.aggregateAndSubmit();

      // Should create 1 batch for anthropic/claude-test
      expect(result.batchesCreated).toBe(1);
      expect(result.requestsProcessed).toBe(3);
      
      // All 3 requests should be in the same batch
      expect(mockProvider.createBatchCalls.length).toBe(1);
      expect(mockProvider.createBatchCalls[0]!.requests.length).toBe(3);
    });
  });

  describe('Idempotency', () => {
    it('should not dispatch results twice for the same request', async () => {
      // Create a completed job
      const jobId = 'idempotent-job-1';
      await env.DB.prepare(`
        INSERT INTO batch_api_jobs (
          id, provider, provider_job_id, model_id, status, request_count, created_at
        ) VALUES (?, 'anthropic', 'provider-idempotent-1', 'anthropic/claude-test', 'submitted', 1, ?)
      `).bind(jobId, Date.now()).run();

      // Create a request that's ALREADY completed (simulating previous dispatch)
      await env.DB.prepare(`
        INSERT INTO batch_api_requests (
          id, request_id, custom_id, batch_job_id, game_id, model_id, provider,
          request_body, context_json, status, response_body, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', '{"already": "processed"}', ?)
      `).bind(
        'idempotent-req-1',
        'idempotent-request-1',
        'idempotent-custom-1',
        jobId,
        'idempotent-game-1',
        'anthropic/claude-test',
        'anthropic',
        JSON.stringify({ systemPrompt: 'Test', userPrompt: 'Test' }),
        JSON.stringify({ round: 1, phase: 'test', playerId: 'player_1', actionType: 'test' }),
        Date.now()
      ).run();

      // Configure mock to return completed with results (as if provider still shows completed)
      mockProvider.setNextStatusResult({
        status: 'completed',
        completedCount: 1,
      });
      mockProvider.setNextResults([
        {
          customId: 'idempotent-custom-1',
          success: true,
          response: {
            content: '{"message": "New response"}',
            tokensUsed: { input: 100, output: 50, total: 150 },
            latencyMs: 100,
            modelId: 'anthropic/claude-test',
          },
        },
      ]);

      // Run polling
      const result = await batchService.pollAndDispatch();

      // Should poll but not dispatch (already processed)
      expect(result.jobsPolled).toBe(1);
      expect(result.resultsDispatched).toBe(0);

      // Original response should be preserved
      const request = await env.DB.prepare(`
        SELECT response_body FROM batch_api_requests WHERE id = ?
      `).bind('idempotent-req-1').first<{ response_body: string }>();
      expect(request!.response_body).toContain('already');
    });
  });
});

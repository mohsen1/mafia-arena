/**
 * BatchService - Orchestrates batch API operations across all providers.
 * 
 * Responsibilities:
 * 1. Store incoming discount pricing requests in D1
 * 2. Aggregate requests into batches by provider/model
 * 3. Submit batches to provider APIs
 * 4. Poll for job completion
 * 5. Dispatch results back to GameRunner DOs
 */

import type { Env } from '../types.js';
import type {
  BatchProvider,
  BatchProviderInterface,
  BatchRequest,
  BatchJob,
  BatchJobStatus,
  BatchServiceOptions,
  BatchStats,
} from './types.js';
import type { AIRequestMessage, CompletionResponse } from '../ai/types.js';
import { createLogger, logErrorWithStack, type Logger } from '../utils/logger.js';

// Default configuration
const DEFAULT_OPTIONS: BatchServiceOptions = {
  minBatchSize: 10,     // Minimum requests before submitting batch
  maxBatchSize: 100,    // Maximum requests per batch
  maxWaitTimeMs: 5 * 60 * 1000,  // 5 minutes max wait
  pollIntervalMs: 60 * 1000,      // Poll every minute
};

/**
 * Map model ID to its batch provider (if batch pricing is supported).
 * 
 * Providers with batch API support (40-50% discount):
 * - anthropic: Message Batches API
 * - openai: Batch API
 * - google: Batch Generation API
 * - cerebras: Batch API
 * - fireworks: Batch API (40% discount)
 * 
 * Providers WITHOUT batch support (returns null):
 * - openrouter: Aggregator, doesn't have native batch API
 * - minimax: No documented batch API
 */
function getProviderForModel(modelId: string): BatchProvider | null {
  const lowerModelId = modelId.toLowerCase();
  
  // Anthropic models (50% discount)
  if (
    lowerModelId.startsWith('anthropic/') ||
    lowerModelId.startsWith('claude-') ||
    lowerModelId.includes('claude')
  ) {
    return 'anthropic';
  }
  
  // OpenAI models (50% discount)
  if (
    lowerModelId.startsWith('openai/') ||
    lowerModelId.startsWith('gpt-') ||
    lowerModelId.includes('gpt-4') ||
    lowerModelId.includes('gpt-3')
  ) {
    return 'openai';
  }
  
  // Google/Gemini models (50% discount)
  if (
    lowerModelId.startsWith('google/') ||
    lowerModelId.startsWith('gemini-') ||
    lowerModelId.includes('gemini')
  ) {
    return 'google';
  }
  
  // Cerebras models (50% discount)
  if (lowerModelId.startsWith('cerebras/') || lowerModelId.includes('cerebras')) {
    return 'cerebras';
  }
  
  // Fireworks models (40% discount)
  if (
    lowerModelId.startsWith('fireworks/') || 
    lowerModelId.includes('fireworks')
  ) {
    return 'fireworks';
  }
  
  // OpenRouter and MiniMax don't have batch APIs - return null
  // These will be processed via immediate (non-batch) pathway
  return null;
}

/**
 * Main batch service class.
 */
export class BatchService {
  private readonly log: Logger;
  private readonly options: BatchServiceOptions;
  private readonly providers: Map<BatchProvider, BatchProviderInterface>;

  constructor(
    private readonly env: Env,
    options: Partial<BatchServiceOptions> = {}
  ) {
    this.log = createLogger('BatchService');
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.providers = new Map();
    
    this.log.info('BatchService initialized', { 
      minBatchSize: this.options.minBatchSize,
      maxBatchSize: this.options.maxBatchSize,
    });
  }

  /**
   * Register a batch provider implementation.
   */
  registerProvider(provider: BatchProviderInterface): void {
    this.providers.set(provider.name, provider);
    this.log.info('Registered batch provider', { provider: provider.name });
  }

  /**
   * Store a discount pricing request for batch processing.
   * Called when handleAIRequestMessage receives a discountPricing request.
   */
  async storeRequest(message: AIRequestMessage): Promise<void> {
    const provider = getProviderForModel(message.modelId);
    
    if (!provider) {
      this.log.warn('Model does not support batch pricing, will process immediately', {
        modelId: message.modelId,
      });
      // TODO: Should we throw or just log? For now, store anyway with null provider
      throw new Error(`Model ${message.modelId} does not support batch pricing`);
    }

    const id = crypto.randomUUID();
    // Use the original requestId as customId - it's deterministic based on full game state
    // including sub-round indices, ensuring uniqueness for multi-turn phases (discussion)
    const customId = message.requestId;
    const now = Date.now();

    await this.env.DB.prepare(`
      INSERT INTO batch_api_requests (
        id, request_id, custom_id, game_id, model_id, provider,
        request_body, context_json, status, retry_count, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)
    `).bind(
      id,
      message.requestId,
      customId,
      message.gameId,
      message.modelId,
      provider,
      JSON.stringify(message.request),
      JSON.stringify(message.context),
      now
    ).run();

    this.log.debug('Stored batch request', {
      id,
      requestId: message.requestId,
      gameId: message.gameId,
      provider,
      modelId: message.modelId,
    });
  }

  /**
   * Aggregate pending requests and submit batches.
   * Called by cron job every N minutes.
   */
  async aggregateAndSubmit(): Promise<{
    batchesCreated: number;
    requestsProcessed: number;
  }> {
    const startTime = Date.now();
    let batchesCreated = 0;
    let requestsProcessed = 0;

    // Get pending requests grouped by provider and model
    const pendingRequests = await this.getPendingRequestsByProviderModel();
    
    for (const [key, requests] of pendingRequests.entries()) {
      const [provider, modelId] = key.split('::') as [BatchProvider, string];
      
      // Check if we have enough requests or if oldest request is too old
      const oldestRequest = requests.reduce((oldest, r) => 
        r.createdAt < oldest.createdAt ? r : oldest
      );
      const waitTime = Date.now() - oldestRequest.createdAt;
      
      const shouldSubmit = 
        requests.length >= this.options.minBatchSize ||
        (requests.length > 0 && waitTime >= this.options.maxWaitTimeMs);

      if (!shouldSubmit) {
        this.log.debug('Not enough requests yet', {
          provider,
          modelId,
          count: requests.length,
          minRequired: this.options.minBatchSize,
          waitTimeMs: waitTime,
          maxWaitMs: this.options.maxWaitTimeMs,
        });
        continue;
      }

      // Take up to maxBatchSize requests
      const batchRequests = requests.slice(0, this.options.maxBatchSize);
      
      try {
        await this.submitBatch(provider, modelId, batchRequests);
        batchesCreated++;
        requestsProcessed += batchRequests.length;
      } catch (error) {
        logErrorWithStack(this.log, 'Failed to submit batch', error, {
          provider,
          modelId,
          requestCount: batchRequests.length,
        });
      }
    }

    this.log.info('Aggregation complete', {
      batchesCreated,
      requestsProcessed,
      durationMs: Date.now() - startTime,
    });

    return { batchesCreated, requestsProcessed };
  }

  /**
   * Poll active batch jobs for completion.
   * Called by cron job every minute.
   */
  async pollAndDispatch(): Promise<{
    jobsPolled: number;
    jobsCompleted: number;
    resultsDispatched: number;
  }> {
    const startTime = Date.now();
    let jobsPolled = 0;
    let jobsCompleted = 0;
    let resultsDispatched = 0;

    // Get active jobs (submitted or processing)
    const activeJobs = await this.getActiveJobs();
    
    for (const job of activeJobs) {
      jobsPolled++;
      
      const providerImpl = this.providers.get(job.provider);
      if (!providerImpl) {
        this.log.error('No provider implementation for job', { 
          jobId: job.id, 
          provider: job.provider 
        });
        continue;
      }

      try {
        // Check if job expired
        if (job.expiresAt && Date.now() > job.expiresAt) {
          this.log.warn('Batch job expired', { jobId: job.id, provider: job.provider });
          await this.markJobExpired(job.id);
          continue;
        }

        // Poll provider for status
        const status = await providerImpl.checkStatus(job.providerJobId!);
        
        if (status.status === 'completed') {
          jobsCompleted++;
          
          // Get results and dispatch to DOs
          const results = await providerImpl.getResults(
            job.providerJobId!,
            status.outputResourceId
          );
          
          for (const result of results) {
            const dispatched = await this.dispatchResult(job.id, result);
            if (dispatched) resultsDispatched++;
          }
          
          await this.markJobCompleted(job.id, results.length);
          
        } else if (status.status === 'failed') {
          this.log.error('Batch job failed', { 
            jobId: job.id, 
            error: status.error 
          });
          await this.markJobFailed(job.id, status.error ?? 'Unknown error');
          
        } else {
          // Still processing - update counts if available
          if (status.completedCount !== undefined) {
            await this.updateJobProgress(job.id, status.completedCount, status.failedCount ?? 0);
          }
        }
      } catch (error) {
        logErrorWithStack(this.log, 'Failed to poll job', error, {
          jobId: job.id,
          provider: job.provider,
        });
      }
    }

    this.log.info('Polling complete', {
      jobsPolled,
      jobsCompleted,
      resultsDispatched,
      durationMs: Date.now() - startTime,
    });

    return { jobsPolled, jobsCompleted, resultsDispatched };
  }

  /**
   * Get batch processing statistics.
   */
  async getStats(): Promise<BatchStats> {
    // Get pending requests by provider
    const pendingResult = await this.env.DB.prepare(`
      SELECT provider, COUNT(*) as count
      FROM batch_api_requests
      WHERE status = 'pending'
      GROUP BY provider
    `).all<{ provider: string; count: number }>();

    const pendingByProvider: Record<BatchProvider, number> = {
      anthropic: 0,
      openai: 0,
      google: 0,
      cerebras: 0,
      fireworks: 0,
    };
    for (const row of pendingResult.results ?? []) {
      pendingByProvider[row.provider as BatchProvider] = row.count;
    }

    // Get active jobs by provider
    const activeResult = await this.env.DB.prepare(`
      SELECT provider, COUNT(*) as count
      FROM batch_api_jobs
      WHERE status IN ('submitted', 'processing')
      GROUP BY provider
    `).all<{ provider: string; count: number }>();

    const activeJobsByProvider: Record<BatchProvider, number> = {
      anthropic: 0,
      openai: 0,
      google: 0,
      cerebras: 0,
      fireworks: 0,
    };
    for (const row of activeResult.results ?? []) {
      activeJobsByProvider[row.provider as BatchProvider] = row.count;
    }

    // Get completed/failed in last 24h
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const statsResult = await this.env.DB.prepare(`
      SELECT 
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        AVG(CASE WHEN completed_at IS NOT NULL THEN completed_at - created_at ELSE NULL END) as avg_time
      FROM batch_api_jobs
      WHERE created_at > ?
    `).bind(last24h).first<{ completed: number; failed: number; avg_time: number }>();

    return {
      pendingByProvider,
      activeJobsByProvider,
      completedLast24h: statsResult?.completed ?? 0,
      failedLast24h: statsResult?.failed ?? 0,
      avgCompletionTimeMs: statsResult?.avg_time ?? 0,
      totalSavingsUsd: 0, // TODO: Calculate actual savings
    };
  }

  // =========================================================================
  // Private helper methods
  // =========================================================================

  /**
   * Get pending requests grouped by provider and model.
   * 
   * NOTE: We limit to 500 requests at a time to avoid OOM issues when the queue
   * backs up. This is called by the aggregator cron which runs every 5 minutes,
   * so a large backlog will be processed over multiple cron invocations.
   */
  private async getPendingRequestsByProviderModel(): Promise<Map<string, BatchRequest[]>> {
    // First, get just the metadata to determine grouping (avoid loading all JSON bodies)
    const metaResult = await this.env.DB.prepare(`
      SELECT id, provider, model_id, created_at
      FROM batch_api_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 500
    `).all<{
      id: string;
      provider: string;
      model_id: string;
      created_at: number;
    }>();

    if (!metaResult.results || metaResult.results.length === 0) {
      return new Map();
    }

    // Group IDs by provider::model
    const idsByGroup = new Map<string, string[]>();
    for (const row of metaResult.results) {
      const key = `${row.provider}::${row.model_id}`;
      const ids = idsByGroup.get(key) ?? [];
      ids.push(row.id);
      idsByGroup.set(key, ids);
    }

    // Now fetch full data only for groups we'll process
    const grouped = new Map<string, BatchRequest[]>();
    
    for (const [key, ids] of idsByGroup.entries()) {
      // Only fetch up to maxBatchSize worth of full bodies per group
      const idsToFetch = ids.slice(0, this.options.maxBatchSize);
      const placeholders = idsToFetch.map(() => '?').join(',');
      
      const result = await this.env.DB.prepare(`
        SELECT 
          id, request_id, custom_id, game_id, model_id, provider,
          request_body, context_json, status, retry_count, created_at
        FROM batch_api_requests
        WHERE id IN (${placeholders})
        ORDER BY created_at ASC
      `).bind(...idsToFetch).all<{
        id: string;
        request_id: string;
        custom_id: string;
        game_id: string;
        model_id: string;
        provider: string;
        request_body: string;
        context_json: string;
        status: string;
        retry_count: number;
        created_at: number;
      }>();

      const requests: BatchRequest[] = (result.results ?? []).map(row => ({
        id: row.id,
        requestId: row.request_id,
        customId: row.custom_id,
        batchJobId: null,
        gameId: row.game_id,
        modelId: row.model_id,
        provider: row.provider as BatchProvider,
        request: JSON.parse(row.request_body),
        context: JSON.parse(row.context_json),
        status: row.status as 'pending',
        retryCount: row.retry_count,
        createdAt: row.created_at,
      }));

      grouped.set(key, requests);
    }

    return grouped;
  }

  private async submitBatch(
    provider: BatchProvider, 
    modelId: string, 
    requests: BatchRequest[]
  ): Promise<void> {
    const providerImpl = this.providers.get(provider);
    if (!providerImpl) {
      throw new Error(`No batch provider implementation for ${provider}`);
    }

    const jobId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24h from now

    this.log.info('Submitting batch', {
      jobId,
      provider,
      modelId,
      requestCount: requests.length,
    });

    // Create job record
    await this.env.DB.prepare(`
      INSERT INTO batch_api_jobs (
        id, provider, model_id, status, request_count, created_at, expires_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?)
    `).bind(jobId, provider, modelId, requests.length, now, expiresAt).run();

    // Update requests to bundled status
    const requestIds = requests.map(r => r.id);
    await this.env.DB.prepare(`
      UPDATE batch_api_requests
      SET status = 'bundled', batch_job_id = ?, updated_at = ?
      WHERE id IN (${requestIds.map(() => '?').join(',')})
    `).bind(jobId, now, ...requestIds).run();

    try {
      // Submit to provider
      const result = await providerImpl.createBatch(requests);
      
      // Update job with provider details
      await this.env.DB.prepare(`
        UPDATE batch_api_jobs
        SET provider_job_id = ?, input_resource_id = ?, 
            metadata = ?, status = 'submitted', submitted_at = ?
        WHERE id = ?
      `).bind(
        result.providerJobId,
        result.inputResourceId ?? null,
        result.metadata ? JSON.stringify(result.metadata) : null,
        Date.now(),
        jobId
      ).run();

      this.log.info('Batch submitted successfully', {
        jobId,
        providerJobId: result.providerJobId,
        provider,
        requestCount: requests.length,
      });

    } catch (error) {
      // Mark job as failed
      await this.env.DB.prepare(`
        UPDATE batch_api_jobs
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `).bind(
        error instanceof Error ? error.message : String(error),
        jobId
      ).run();

      // Revert requests to pending for retry
      await this.env.DB.prepare(`
        UPDATE batch_api_requests
        SET status = 'pending', batch_job_id = NULL, retry_count = retry_count + 1
        WHERE batch_job_id = ?
      `).bind(jobId).run();

      throw error;
    }
  }

  private async getActiveJobs(): Promise<BatchJob[]> {
    const result = await this.env.DB.prepare(`
      SELECT 
        id, provider, provider_job_id, model_id, status,
        request_count, completed_count, failed_count,
        input_resource_id, output_resource_id, metadata,
        created_at, submitted_at, expires_at
      FROM batch_api_jobs
      WHERE status IN ('submitted', 'processing')
      ORDER BY created_at ASC
    `).all<{
      id: string;
      provider: string;
      provider_job_id: string | null;
      model_id: string;
      status: string;
      request_count: number;
      completed_count: number;
      failed_count: number;
      input_resource_id: string | null;
      output_resource_id: string | null;
      metadata: string | null;
      created_at: number;
      submitted_at: number | null;
      expires_at: number | null;
    }>();

    return (result.results ?? []).map(row => {
      const job: BatchJob = {
        id: row.id,
        provider: row.provider as BatchProvider,
        providerJobId: row.provider_job_id,
        modelId: row.model_id,
        status: row.status as BatchJobStatus,
        requestCount: row.request_count,
        completedCount: row.completed_count,
        failedCount: row.failed_count,
        inputResourceId: row.input_resource_id,
        outputResourceId: row.output_resource_id,
        metadata: row.metadata ? JSON.parse(row.metadata) : {},
        createdAt: row.created_at,
      };
      if (row.submitted_at !== null) job.submittedAt = row.submitted_at;
      if (row.expires_at !== null) job.expiresAt = row.expires_at;
      return job;
    });
  }

  private async dispatchResult(
    jobId: string,
    result: { customId: string; success: boolean; response?: CompletionResponse; error?: { code: string; message: string }; inputTokens?: number; outputTokens?: number }
  ): Promise<boolean> {
    // Find the request by custom_id
    const request = await this.env.DB.prepare(`
      SELECT id, request_id, game_id, context_json
      FROM batch_api_requests
      WHERE batch_job_id = ? AND custom_id = ?
    `).bind(jobId, result.customId).first<{
      id: string;
      request_id: string;
      game_id: string;
      context_json: string;
    }>();

    if (!request) {
      this.log.warn('Request not found for batch result', { 
        jobId, 
        customId: result.customId 
      });
      return false;
    }

    const now = Date.now();

    if (result.success && result.response) {
      // Update request as completed
      await this.env.DB.prepare(`
        UPDATE batch_api_requests
        SET status = 'completed', response_body = ?,
            input_tokens = ?, output_tokens = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        JSON.stringify(result.response),
        result.inputTokens ?? result.response.tokensUsed.input,
        result.outputTokens ?? result.response.tokensUsed.output,
        now,
        request.id
      ).run();

      // Dispatch to GameRunner DO via callback
      try {
        const doId = this.env.GAME_RUNNER.idFromName(request.game_id);
        const stub = this.env.GAME_RUNNER.get(doId);
        
        const callbackResponse = await stub.fetch('http://internal/internal/ai-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: request.request_id,
            response: result.response,
          }),
        });

        if (!callbackResponse.ok) {
          this.log.error('DO callback failed', {
            gameId: request.game_id,
            requestId: request.request_id,
            status: callbackResponse.status,
          });
          return false;
        }

        this.log.debug('Result dispatched to DO', {
          gameId: request.game_id,
          requestId: request.request_id,
        });
        return true;

      } catch (error) {
        logErrorWithStack(this.log, 'Failed to dispatch result to DO', error, {
          gameId: request.game_id,
          requestId: request.request_id,
        });
        return false;
      }
    } else {
      // Update request as failed
      await this.env.DB.prepare(`
        UPDATE batch_api_requests
        SET status = 'failed', error_message = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        result.error?.message ?? 'Unknown error',
        now,
        request.id
      ).run();

      // TODO: Should we callback to DO with error? For now, let game timeout
      this.log.error('Batch request failed', {
        gameId: request.game_id,
        requestId: request.request_id,
        errorCode: result.error?.code ?? 'unknown',
        errorMessage: result.error?.message ?? 'Unknown error',
      });
      return false;
    }
  }

  private async markJobCompleted(jobId: string, completedCount: number): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE batch_api_jobs
      SET status = 'completed', completed_count = ?, completed_at = ?
      WHERE id = ?
    `).bind(completedCount, Date.now(), jobId).run();
  }

  private async markJobFailed(jobId: string, error: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE batch_api_jobs
      SET status = 'failed', error_message = ?, completed_at = ?
      WHERE id = ?
    `).bind(error, Date.now(), jobId).run();

    // Revert bundled requests to pending for potential retry via immediate processing
    await this.env.DB.prepare(`
      UPDATE batch_api_requests
      SET status = 'failed', error_message = ?
      WHERE batch_job_id = ? AND status = 'bundled'
    `).bind(error, jobId).run();
  }

  private async markJobExpired(jobId: string): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE batch_api_jobs
      SET status = 'expired', completed_at = ?
      WHERE id = ?
    `).bind(Date.now(), jobId).run();

    // Mark requests as failed due to expiration
    await this.env.DB.prepare(`
      UPDATE batch_api_requests
      SET status = 'failed', error_message = 'Batch job expired (24h timeout)'
      WHERE batch_job_id = ? AND status = 'bundled'
    `).bind(jobId).run();
  }

  private async updateJobProgress(
    jobId: string, 
    completedCount: number, 
    failedCount: number
  ): Promise<void> {
    await this.env.DB.prepare(`
      UPDATE batch_api_jobs
      SET status = 'processing', completed_count = ?, failed_count = ?
      WHERE id = ?
    `).bind(completedCount, failedCount, jobId).run();
  }
}

/**
 * Check if a model supports batch pricing.
 */
export function modelSupportsBatchPricing(modelId: string): boolean {
  return getProviderForModel(modelId) !== null;
}


/**
 * BatchService - Orchestrates batch API operations across all providers.
 * 
 * Responsibilities:
 * 1. Store incoming discount pricing requests in D1
 * 2. Aggregate requests into batches by provider/model
 * 3. Submit batches to provider APIs
 * 4. Poll for job completion
 * 5. Dispatch results back to GameRunner DOs
 * 
 * Uses ModelRegistry for database-driven batch provider detection.
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
import { ModelRegistry } from '../services/ModelRegistry.js';

// Default configuration
const DEFAULT_OPTIONS: BatchServiceOptions = {
  minBatchSize: 10,     // Minimum requests before submitting batch
  maxBatchSize: 100,    // Maximum requests per batch
  maxWaitTimeMs: 5 * 60 * 1000,  // 5 minutes max wait
  pollIntervalMs: 60 * 1000,      // Poll every minute
};

/**
 * Main batch service class.
 */
export class BatchService {
  private readonly log: Logger;
  private readonly options: BatchServiceOptions;
  private readonly providers: Map<BatchProvider, BatchProviderInterface>;
  private readonly modelRegistry: ModelRegistry;

  constructor(
    private readonly env: Env,
    options: Partial<BatchServiceOptions> = {}
  ) {
    this.log = createLogger('BatchService');
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.providers = new Map();
    this.modelRegistry = new ModelRegistry(env.DB);
    
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
    // Use ModelRegistry to get batch pricing info from database
    const modelContext = await this.modelRegistry.get(message.modelId);
    const { batchPricing, pricing } = modelContext;

    if (!batchPricing.supported || !batchPricing.batchProvider) {
      this.log.warn('Model does not support batch pricing, will process immediately', {
        modelId: message.modelId,
        apiProvider: modelContext.apiProvider,
      });
      throw new Error(`Model ${message.modelId} does not support batch pricing`);
    }

    const provider = batchPricing.batchProvider;
    const id = crypto.randomUUID();
    // Use the original requestId as customId - it's deterministic based on full game state
    // including sub-round indices, ensuring uniqueness for multi-turn phases (discussion)
    const customId = message.requestId;
    const now = Date.now();

    // Estimate costs for savings tracking
    // Use conservative token estimates (will be updated with actual tokens when completed)
    const estimatedInputTokens = message.request?.maxTokens ?? 4096;
    const estimatedOutputTokens = message.request?.maxTokens ?? 1024;
    const discountMultiplier = 1 - (batchPricing.discountPercent / 100);

    // Individual API cost (standard pricing)
    const individualCostUsd = (
      (estimatedInputTokens / 1000) * pricing.input +
      (estimatedOutputTokens / 1000) * pricing.output
    );

    // Batch API cost (discounted pricing)
    const batchCostUsd = individualCostUsd * discountMultiplier;

    await this.env.DB.prepare(`
      INSERT INTO batch_api_requests (
        id, request_id, custom_id, game_id, model_id, provider,
        request_body, context_json, status, retry_count, created_at, trace_id,
        individual_cost_usd, batch_cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
    `).bind(
      id,
      message.requestId,
      customId,
      message.gameId,
      message.modelId,
      provider,
      JSON.stringify(message.request),
      JSON.stringify(message.context),
      now,
      message.traceId ?? null,
      individualCostUsd,
      batchCostUsd
    ).run();

    this.log.debug('Stored batch request', {
      id,
      requestId: message.requestId,
      gameId: message.gameId,
      provider,
      modelId: message.modelId,
      batchDiscount: batchPricing.discountPercent,
      estimatedCostUsd: batchCostUsd,
      traceId: message.traceId,
    });
  }

  /**
   * Aggregate pending requests and submit batches.
   * Called by cron job every N minutes.
   * 
   * Uses atomic claim mechanism to prevent race conditions when multiple
   * cron workers run simultaneously (prevents double-billing).
   */
  async aggregateAndSubmit(): Promise<{
    batchesCreated: number;
    requestsProcessed: number;
  }> {
    const startTime = Date.now();
    let batchesCreated = 0;
    let requestsProcessed = 0;

    // Get pending requests grouped by provider and model
    // This atomically claims the requests to prevent double-processing
    const pendingRequests = await this.getPendingRequestsByProviderModel();
    
    // Track requests that weren't submitted (to release back to pending)
    const unsubmittedIds: string[] = [];
    
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
        // Track these for release back to pending
        unsubmittedIds.push(...requests.map(r => r.id));
        continue;
      }

      // Take up to maxBatchSize requests
      const batchRequests = requests.slice(0, this.options.maxBatchSize);
      // Any requests beyond maxBatchSize go back to pending
      if (requests.length > this.options.maxBatchSize) {
        unsubmittedIds.push(...requests.slice(this.options.maxBatchSize).map(r => r.id));
      }
      
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
        // Failed requests go back to pending for retry
        unsubmittedIds.push(...batchRequests.map(r => r.id));
      }
    }
    
    // Release any unsubmitted requests back to pending status
    if (unsubmittedIds.length > 0) {
      const placeholders = unsubmittedIds.map(() => '?').join(',');
      await this.env.DB.prepare(`
        UPDATE batch_api_requests
        SET status = 'pending', claim_id = NULL, claim_expires_at = NULL
        WHERE id IN (${placeholders}) AND status = 'claiming'
      `).bind(...unsubmittedIds).run();
      
      this.log.debug('Released unsubmitted requests back to pending', { 
        count: unsubmittedIds.length 
      });
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

    // Calculate total savings from completed batch requests
    const totalSavingsUsd = await this.calculateTotalSavings(last24h);

    return {
      pendingByProvider,
      activeJobsByProvider,
      completedLast24h: statsResult?.completed ?? 0,
      failedLast24h: statsResult?.failed ?? 0,
      avgCompletionTimeMs: statsResult?.avg_time ?? 0,
      totalSavingsUsd,
    };
  }

  // =========================================================================
  // Private helper methods
  // =========================================================================

  /**
   * Get pending requests grouped by provider and model.
   * 
   * IMPORTANT: Uses atomic claim to prevent race conditions when multiple cron
   * workers run simultaneously. Requests are marked as 'claiming' before being
   * returned, preventing double-submission and double-billing.
   * 
   * NOTE: We limit to 500 requests at a time to avoid OOM issues when the queue
   * backs up. This is called by the aggregator cron which runs every 5 minutes,
   * so a large backlog will be processed over multiple cron invocations.
   */
  private async getPendingRequestsByProviderModel(): Promise<Map<string, BatchRequest[]>> {
    // Generate a unique claim ID for this aggregation run
    const claimId = `claim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const claimExpiry = Date.now() + 5 * 60 * 1000; // 5 minute claim expiry
    
    // STEP 1: Atomically claim pending requests using UPDATE with subquery
    // This prevents race conditions when multiple workers run aggregation simultaneously.
    // D1/SQLite doesn't support UPDATE...LIMIT directly, so we use WHERE id IN (SELECT... LIMIT)
    await this.env.DB.prepare(`
      UPDATE batch_api_requests
      SET status = 'claiming', claim_id = ?, claim_expires_at = ?
      WHERE id IN (
        SELECT id FROM batch_api_requests
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 500
      )
    `).bind(claimId, claimExpiry).run();
    
    // Also reclaim any expired claims (from crashed workers)
    await this.env.DB.prepare(`
      UPDATE batch_api_requests
      SET status = 'claiming', claim_id = ?, claim_expires_at = ?
      WHERE status = 'claiming' AND claim_expires_at < ?
    `).bind(claimId, claimExpiry, Date.now()).run();

    // STEP 2: Select only our claimed requests
    const metaResult = await this.env.DB.prepare(`
      SELECT id, provider, model_id, created_at
      FROM batch_api_requests
      WHERE status = 'claiming' AND claim_id = ?
      ORDER BY created_at ASC
    `).bind(claimId).all<{
      id: string;
      provider: string;
      model_id: string;
      created_at: number;
    }>();

    if (!metaResult.results || metaResult.results.length === 0) {
      return new Map();
    }
    
    this.log.debug('Claimed requests for aggregation', { 
      claimId, 
      count: metaResult.results.length 
    });

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
        WHERE id IN (${placeholders}) AND claim_id = ?
        ORDER BY created_at ASC
      `).bind(...idsToFetch, claimId).all<{
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
        status: 'claiming' as const,
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

    // Update requests from claiming -> bundled status
    // Clear claim fields as they're now officially assigned to a job
    const requestIds = requests.map(r => r.id);
    await this.env.DB.prepare(`
      UPDATE batch_api_requests
      SET status = 'bundled', batch_job_id = ?, claim_id = NULL, claim_expires_at = NULL, updated_at = ?
      WHERE id IN (${requestIds.map(() => '?').join(',')})
    `).bind(jobId, now, ...requestIds).run();

    try {
      // Submit to provider with internal job ID for tracking/recovery
      const result = await providerImpl.createBatch(requests, { internalJobId: jobId });
      
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

      // Revert requests to pending for retry (clear claim fields too)
      await this.env.DB.prepare(`
        UPDATE batch_api_requests
        SET status = 'pending', batch_job_id = NULL, claim_id = NULL, 
            claim_expires_at = NULL, retry_count = retry_count + 1
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

  /**
   * Dispatch a single batch result to update the request status.
   * 
   * IDEMPOTENT: Only updates requests that are still in 'bundled' status.
   * If pollAndDispatch runs twice on the same completed batch, the second
   * run will be a no-op for already-completed requests.
   */
  private async dispatchResult(
    jobId: string,
    result: { customId: string; success: boolean; response?: CompletionResponse; error?: { code: string; message: string }; inputTokens?: number; outputTokens?: number }
  ): Promise<boolean> {
    // Find the request by custom_id, but ONLY if still bundled (not already processed)
    const request = await this.env.DB.prepare(`
      SELECT id, request_id, game_id, context_json, status
      FROM batch_api_requests
      WHERE batch_job_id = ? AND custom_id = ?
    `).bind(jobId, result.customId).first<{
      id: string;
      request_id: string;
      game_id: string;
      context_json: string;
      status: string;
    }>();

    if (!request) {
      this.log.warn('Request not found for batch result', { 
        jobId, 
        customId: result.customId 
      });
      return false;
    }

    // IDEMPOTENCY CHECK: Skip if already processed
    if (request.status === 'completed' || request.status === 'failed') {
      this.log.debug('Request already processed, skipping duplicate dispatch', {
        requestId: request.request_id,
        status: request.status,
        customId: result.customId,
      });
      return false;
    }

    const now = Date.now();

    if (result.success && result.response) {
      // Get request data to recalculate costs with actual token counts
      const requestData = await this.env.DB.prepare(`
        SELECT model_id, individual_cost_usd, batch_cost_usd
        FROM batch_api_requests
        WHERE id = ?
      `).bind(request.id).first<{
        model_id: string;
        individual_cost_usd: number | null;
        batch_cost_usd: number | null;
      }>();

      let actualIndividualCost = requestData?.individual_cost_usd ?? 0;
      let actualBatchCost = requestData?.batch_cost_usd ?? 0;

      // Recalculate costs with actual token counts if available
      const inputTokens = result.inputTokens ?? result.response.tokensUsed.input;
      const outputTokens = result.outputTokens ?? result.response.tokensUsed.output;

      if (requestData && inputTokens > 0 && outputTokens > 0) {
        try {
          const modelContext = await this.modelRegistry.get(requestData.model_id);
          const { pricing, batchPricing } = modelContext;
          const discountMultiplier = 1 - (batchPricing.discountPercent / 100);

          actualIndividualCost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
          actualBatchCost = actualIndividualCost * discountMultiplier;
        } catch (error) {
          this.log.warn('Failed to recalculate costs with actual tokens, using estimates', {
            requestId: request.request_id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Update request as completed in D1 - with idempotency guard
      // Workflow will poll D1 for completion using step.sleep()
      const updateResult = await this.env.DB.prepare(`
        UPDATE batch_api_requests
        SET status = 'completed', response_body = ?,
            input_tokens = ?, output_tokens = ?, updated_at = ?,
            individual_cost_usd = ?, batch_cost_usd = ?
        WHERE id = ? AND status = 'bundled'
      `).bind(
        JSON.stringify(result.response),
        inputTokens,
        outputTokens,
        now,
        actualIndividualCost,
        actualBatchCost,
        request.id
      ).run();

      if (updateResult.meta?.changes === 0) {
        this.log.debug('Request already processed (race condition avoided)', {
          requestId: request.request_id,
        });
        return false;
      }

      this.log.debug('Batch result stored in D1 (workflow will poll)', {
        gameId: request.game_id,
        requestId: request.request_id,
      });
      return true;
    } else {
      // Update request as failed - with idempotency guard
      const updateResult = await this.env.DB.prepare(`
        UPDATE batch_api_requests
        SET status = 'failed', error_message = ?, updated_at = ?
        WHERE id = ? AND status = 'bundled'
      `).bind(
        result.error?.message ?? 'Unknown error',
        now,
        request.id
      ).run();

      if (updateResult.meta?.changes === 0) {
        this.log.debug('Request already processed (race condition avoided)', {
          requestId: request.request_id,
        });
        return false;
      }

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

  /**
   * Calculate total savings from batch API pricing.
   * @param since - Timestamp to calculate savings since (e.g., last 24h)
   * @returns Total savings in USD
   */
  private async calculateTotalSavings(since: number): Promise<number> {
    const completedRequests = await this.env.DB.prepare(`
      SELECT individual_cost_usd, batch_cost_usd
      FROM batch_api_requests
      WHERE status = 'completed' AND created_at > ?
    `).bind(since).all<{
      individual_cost_usd: number | null;
      batch_cost_usd: number | null;
    }>();

    if (!completedRequests.results || completedRequests.results.length === 0) {
      return 0;
    }

    const totalSavings = completedRequests.results.reduce((sum, req) => {
      const individualCost = req.individual_cost_usd ?? 0;
      const batchCost = req.batch_cost_usd ?? 0;
      return sum + this.calculateSavings(individualCost, batchCost);
    }, 0);

    return totalSavings;
  }

  /**
   * Calculate savings for a single request.
   * @param individualCost - Cost at standard API pricing
   * @param batchCost - Cost at batch discount pricing
   * @returns Savings amount (never negative)
   */
  private calculateSavings(individualCost: number, batchCost: number): number {
    return Math.max(0, individualCost - batchCost);
  }
}

/**
 * Check if a model supports batch pricing using the ModelRegistry.
 * 
 * @param modelId - Model ID to check
 * @param db - D1 database instance
 * @returns Whether the model supports batch pricing
 */
export async function modelSupportsBatchPricing(modelId: string, db: D1Database): Promise<boolean> {
  const registry = new ModelRegistry(db);
  const context = await registry.get(modelId);
  return context.batchPricing.supported;
}

/**
 * Get batch pricing details for a model using the ModelRegistry.
 * 
 * @param modelId - Model ID to check
 * @param db - D1 database instance
 * @returns Batch pricing configuration
 */
export async function getBatchPricingForModel(
  modelId: string, 
  db: D1Database
): Promise<{ supported: boolean; discountPercent: number; batchProvider: BatchProvider | null }> {
  const registry = new ModelRegistry(db);
  const context = await registry.get(modelId);
  return context.batchPricing;
}


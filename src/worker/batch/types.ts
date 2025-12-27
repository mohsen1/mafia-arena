/**
 * Batch API types for multi-provider discount pricing (40-50% savings)
 * Supports: Anthropic, OpenAI, Google, Cerebras, Fireworks batch APIs
 */

import type { CompletionRequest, CompletionResponse } from '../ai/types.js';

/**
 * Providers that support batch APIs for discount pricing.
 */
export type BatchProvider = 'anthropic' | 'openai' | 'google' | 'cerebras' | 'fireworks';

/**
 * Status of a pending batch request in D1.
 */
export type BatchRequestStatus = 'pending' | 'bundled' | 'completed' | 'failed';

/**
 * Status of a batch job submitted to a provider.
 */
export type BatchJobStatus = 
  | 'pending'      // Created, not yet submitted
  | 'uploading'    // Uploading input file (for providers that require it)
  | 'submitted'    // Submitted to provider
  | 'processing'   // Provider is processing
  | 'completed'    // All requests completed
  | 'failed'       // Job failed
  | 'cancelled'    // Job was cancelled
  | 'expired';     // Job expired (24h timeout)

/**
 * A pending AI request waiting to be batched.
 * Stored in D1 `batch_api_requests` table.
 */
export interface BatchRequest {
  /** Internal request ID (UUID) */
  id: string;
  /** Original request ID from AIRequestMessage */
  requestId: string;
  /** Correlation ID sent to provider (gameId_round_phase_playerId) */
  customId: string;
  /** Reference to batch job when bundled */
  batchJobId: string | null;
  /** Game ID this request belongs to */
  gameId: string;
  /** Model ID for routing to correct provider */
  modelId: string;
  /** Provider name derived from modelId */
  provider: BatchProvider;
  /** The actual completion request */
  request: CompletionRequest;
  /** Context for DO callback routing */
  context: {
    round: number;
    phase: string;
    playerId: string;
    actionType: string;
  };
  /** Current status */
  status: BatchRequestStatus;
  /** Response when completed */
  response?: CompletionResponse;
  /** Token counts from provider */
  inputTokens?: number;
  outputTokens?: number;
  /** Cost in USD */
  costUsd?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Number of retry attempts */
  retryCount: number;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when last updated */
  updatedAt?: number;
}

/**
 * A batch job submitted to a provider API.
 * Stored in D1 `batch_api_jobs` table.
 */
export interface BatchJob {
  /** Internal job ID (UUID) */
  id: string;
  /** Provider name */
  provider: BatchProvider;
  /** Provider's job/batch identifier (assigned after submission) */
  providerJobId: string | null;
  /** Model ID for all requests in this batch */
  modelId: string;
  /** Current status */
  status: BatchJobStatus;
  /** Number of requests in this batch */
  requestCount: number;
  /** Number of completed requests */
  completedCount: number;
  /** Number of failed requests */
  failedCount: number;
  /** Provider file ID or URI for input (e.g., OpenAI file-xxx, Google gs://...) */
  inputResourceId: string | null;
  /** Provider file ID or URI for output */
  outputResourceId: string | null;
  /** Provider-specific metadata (JSON) */
  metadata: Record<string, unknown>;
  /** Error message if failed */
  errorMessage?: string;
  /** Timestamp when created */
  createdAt: number;
  /** Timestamp when submitted to provider */
  submittedAt?: number;
  /** Timestamp when completed */
  completedAt?: number;
  /** Timestamp when job expires (24h from submission) */
  expiresAt?: number;
}

/**
 * Result of a single request within a batch.
 */
export interface BatchRequestResult {
  /** The custom_id we sent with the request */
  customId: string;
  /** Whether the request succeeded */
  success: boolean;
  /** The completion response if successful */
  response?: CompletionResponse;
  /** Error details if failed */
  error?: {
    code: string;
    message: string;
  };
  /** Token counts */
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Interface for provider-specific batch implementations.
 * Each provider (Anthropic, OpenAI, Google, etc.) implements this interface.
 */
export interface BatchProviderInterface {
  /** Provider name */
  readonly name: BatchProvider;
  
  /**
   * Create and submit a batch job to the provider.
   * 
   * @param requests - Array of requests to batch together
   * @returns Provider's job ID and any metadata
   */
  createBatch(requests: BatchRequest[]): Promise<{
    providerJobId: string;
    inputResourceId?: string;
    metadata?: Record<string, unknown>;
  }>;
  
  /**
   * Check the status of a batch job.
   * 
   * @param providerJobId - The provider's job identifier
   * @returns Current status and any updates
   */
  checkStatus(providerJobId: string): Promise<{
    status: BatchJobStatus;
    completedCount?: number;
    failedCount?: number;
    outputResourceId?: string;
    error?: string;
  }>;
  
  /**
   * Retrieve results for a completed batch job.
   * 
   * @param providerJobId - The provider's job identifier
   * @param outputResourceId - Where to find the results (file ID or URI)
   * @returns Array of results keyed by custom_id
   */
  getResults(providerJobId: string, outputResourceId?: string): Promise<BatchRequestResult[]>;
  
  /**
   * Cancel a batch job if possible.
   * 
   * @param providerJobId - The provider's job identifier
   */
  cancelBatch(providerJobId: string): Promise<void>;
  
  /**
   * Convert our CompletionRequest to provider-specific format.
   * Used when building the batch input.
   * @param request - The completion request
   * @param customId - Unique identifier for correlation
   * @param modelId - The model ID from the original request (e.g., 'anthropic/claude-3-5-sonnet')
   */
  formatRequest(request: CompletionRequest, customId: string, modelId: string): unknown;
  
  /**
   * Parse provider response into our CompletionResponse format.
   * @param providerResponse - Raw response from the provider
   * @param modelId - Optional model ID for the response (some providers don't return it)
   */
  parseResponse(providerResponse: unknown, modelId?: string): CompletionResponse;
}

/**
 * Options for the BatchService orchestrator.
 */
export interface BatchServiceOptions {
  /** Minimum number of requests before cutting a batch */
  minBatchSize: number;
  /** Maximum number of requests in a batch */
  maxBatchSize: number;
  /** Maximum time to wait before cutting a batch (ms) */
  maxWaitTimeMs: number;
  /** How often to poll for job completion (ms) */
  pollIntervalMs: number;
}

/**
 * Statistics for batch processing.
 */
export interface BatchStats {
  /** Pending requests by provider */
  pendingByProvider: Record<BatchProvider, number>;
  /** Active jobs by provider */
  activeJobsByProvider: Record<BatchProvider, number>;
  /** Completed requests in last 24h */
  completedLast24h: number;
  /** Failed requests in last 24h */
  failedLast24h: number;
  /** Average job completion time (ms) */
  avgCompletionTimeMs: number;
  /** Total cost savings from batch pricing */
  totalSavingsUsd: number;
}


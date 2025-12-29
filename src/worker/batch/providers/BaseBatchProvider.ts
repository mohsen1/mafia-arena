/**
 * Abstract base class for batch API providers.
 * Provides common functionality shared across Anthropic, OpenAI, Google, etc.
 */

import type { Env } from '../../types.js';
import type { CompletionRequest, CompletionResponse } from '../../ai/types.js';
import type {
  BatchProvider,
  BatchProviderInterface,
  BatchRequest,
  BatchRequestResult,
  BatchJobStatus,
} from '../types.js';
import { createLogger, type Logger } from '../../utils/logger.js';

/**
 * Abstract base class for batch API providers.
 * 
 * Subclasses must implement:
 * - createBatch()
 * - checkStatus()
 * - getResults()
 * - cancelBatch()
 * - formatRequest()
 * - parseResponse()
 */
export abstract class BaseBatchProvider implements BatchProviderInterface {
  protected readonly log: Logger;
  protected readonly apiKey: string;

  constructor(
    public readonly name: BatchProvider,
    protected readonly env: Env,
    apiKeyEnvVar: string
  ) {
    this.log = createLogger(`BatchProvider:${name}`);
    
    // Get API key from environment
    const key = (env as unknown as Record<string, unknown>)[apiKeyEnvVar];
    if (!key || typeof key !== 'string') {
      throw new Error(`Missing API key for batch provider ${name}: ${apiKeyEnvVar}`);
    }
    this.apiKey = key;
  }

  /**
   * Create and submit a batch job to the provider.
   * Must be implemented by subclasses.
   * 
   * @param requests - Array of requests to batch together
   * @param options - Optional configuration including internal job ID for tracking
   */
  abstract createBatch(requests: BatchRequest[], options?: {
    /** Internal job ID for tracking/recovery (sent in provider metadata if supported) */
    internalJobId?: string;
  }): Promise<{
    providerJobId: string;
    inputResourceId?: string;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Check the status of a batch job.
   * Must be implemented by subclasses.
   */
  abstract checkStatus(providerJobId: string): Promise<{
    status: BatchJobStatus;
    completedCount?: number;
    failedCount?: number;
    outputResourceId?: string;
    error?: string;
  }>;

  /**
   * Retrieve results for a completed batch job.
   * Must be implemented by subclasses.
   */
  abstract getResults(providerJobId: string, outputResourceId?: string): Promise<BatchRequestResult[]>;

  /**
   * Cancel a batch job if possible.
   * Default implementation logs warning - override if provider supports cancellation.
   */
  async cancelBatch(providerJobId: string): Promise<void> {
    this.log.warn('Batch cancellation not implemented for this provider', { providerJobId });
  }

  /**
   * Convert our CompletionRequest to provider-specific format.
   * Must be implemented by subclasses.
   */
  abstract formatRequest(request: CompletionRequest, customId: string, modelId: string): unknown;

  /**
   * Parse provider response into our CompletionResponse format.
   * Must be implemented by subclasses.
   * @param providerResponse - Raw response from the provider
   * @param modelId - Optional model ID for the response (some providers don't return it)
   */
  abstract parseResponse(providerResponse: unknown, modelId?: string): CompletionResponse;

  /**
   * Build a JSONL string from an array of formatted requests.
   * Common format used by most batch APIs.
   */
  protected buildJsonl(requests: unknown[]): string {
    return requests.map(r => JSON.stringify(r)).join('\n');
  }

  /**
   * Parse a JSONL string into an array of objects.
   */
  protected parseJsonl<T>(jsonl: string): T[] {
    return jsonl
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as T);
  }

  /**
   * Generate a unique custom_id for a request.
   * Format: gameId_round_phase_playerId
   */
  protected generateCustomId(request: BatchRequest): string {
    const { gameId, context } = request;
    return `${gameId}_r${context.round}_${context.phase}_${context.playerId}`;
  }

  /**
   * Make an HTTP request with retries and error handling.
   */
  protected async httpRequest<T>(
    url: string,
    options: RequestInit & { retries?: number }
  ): Promise<T> {
    const maxRetries = options.retries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            ...this.getAuthHeaders(),
            ...options.headers,
          },
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          this.log.warn('Request failed, retrying', { 
            url, 
            attempt, 
            delay, 
            error: lastError.message 
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Request failed');
  }

  /**
   * Get authentication headers for API requests.
   * Override in subclasses if different format needed.
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Sleep for a given duration.
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate cost for a request based on token counts.
   * Override in subclasses with provider-specific pricing.
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // Default 50% discount pricing - override in subclasses with actual rates
    const inputPricePerMillion = 1.5; // $3/MTok standard → $1.5/MTok batch
    const outputPricePerMillion = 7.5; // $15/MTok standard → $7.5/MTok batch
    
    return (
      (inputTokens / 1_000_000) * inputPricePerMillion +
      (outputTokens / 1_000_000) * outputPricePerMillion
    );
  }
}


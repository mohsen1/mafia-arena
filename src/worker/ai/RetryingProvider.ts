/**
 * Retrying provider wrapper with exponential backoff.
 */

import type { AIProviderInterface, CompletionRequest, CompletionResponse } from './types.js';
import { AIErrors, isRetryableError } from './errors.js';

export interface RetryConfig {
  maxRetries: number;
  backoffMs: readonly number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000],
};

/**
 * Wraps an AI provider with retry logic and exponential backoff.
 */
export class RetryingProvider implements AIProviderInterface {
  readonly name: string;
  readonly modelId: string;

  private readonly provider: AIProviderInterface;
  private readonly config: RetryConfig;

  constructor(provider: AIProviderInterface, config: Partial<RetryConfig> = {}) {
    this.provider = provider;
    this.name = provider.name;
    this.modelId = provider.modelId;
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    let lastError: Error | undefined;
    let attempts = 0;

    while (attempts <= this.config.maxRetries) {
      try {
        return await this.provider.complete(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        attempts++;

        // Check if we should retry
        if (attempts > this.config.maxRetries || !isRetryableError(error)) {
          break;
        }

        // Wait before retrying with exponential backoff
        const delay = this.config.backoffMs[attempts - 1] ?? this.config.backoffMs.at(-1) ?? 4000;
        await this.sleep(delay);
      }
    }

    throw AIErrors.retryExhausted(this.modelId, attempts, lastError);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}


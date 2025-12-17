/**
 * AI-related error types.
 */

/**
 * Base error class for AI-related errors.
 */
export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AIError';
  }

  /**
   * Create error response for API.
   */
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
      },
    };
  }
}

/**
 * Error codes for AI operations.
 */
export type AIErrorCode =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'INVALID_RESPONSE'
  | 'AUTH_ERROR'
  | 'INVALID_REQUEST'
  | 'RETRY_EXHAUSTED'
  | 'PROVIDER_ERROR'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_MODEL';

/**
 * Factory functions for common errors.
 */
export const AIErrors = {
  timeout: (modelId: string, timeoutMs: number) =>
    new AIError('TIMEOUT', `Request to ${modelId} timed out after ${timeoutMs}ms`),

  rateLimited: (modelId: string, retryAfter?: number) =>
    new AIError(
      'RATE_LIMITED',
      `Rate limited by ${modelId}${retryAfter ? `, retry after ${retryAfter}s` : ''}`
    ),

  invalidResponse: (modelId: string, reason: string) =>
    new AIError('INVALID_RESPONSE', `Invalid response from ${modelId}: ${reason}`),

  authError: (provider: string) =>
    new AIError('AUTH_ERROR', `Authentication failed for ${provider}`),

  retryExhausted: (modelId: string, attempts: number, lastError?: Error) =>
    new AIError(
      'RETRY_EXHAUSTED',
      `Failed after ${attempts} attempts to ${modelId}`,
      lastError
    ),

  providerError: (provider: string, message: string, cause?: Error) =>
    new AIError('PROVIDER_ERROR', `${provider} error: ${message}`, cause),

  parseError: (reason: string) =>
    new AIError('PARSE_ERROR', `Failed to parse AI response: ${reason}`),

  unsupportedModel: (modelId: string) =>
    new AIError('UNSUPPORTED_MODEL', `Model not supported: ${modelId}`),
};

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AIError) {
    // Don't retry auth errors or invalid requests
    const nonRetryable: AIErrorCode[] = ['AUTH_ERROR', 'INVALID_REQUEST', 'UNSUPPORTED_MODEL'];
    return !nonRetryable.includes(error.code);
  }
  // Retry unknown errors
  return true;
}


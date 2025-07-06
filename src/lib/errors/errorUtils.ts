import { GameError, ErrorCode } from './GameError';

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof GameError) {
    return error.userMessage;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Log error with context information
 */
export async function logError(
  context: string,
  error: unknown,
  additionalInfo?: Record<string, unknown>
): Promise<void> {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context,
    additionalInfo,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...(error instanceof GameError
              ? {
                  code: error.code,
                  userMessage: error.userMessage,
                  retryable: error.retryable,
                  httpStatus: error.httpStatus,
                  context: error.context,
                }
              : {}),
          }
        : error,
  };

  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}] Error:`, errorInfo);
  } else {
    // In production, send to error tracking service
    console.error(`[${context}] ${getErrorMessage(error)}`);

    // Send to Sentry if available
    try {
      if (typeof window !== 'undefined' && window.Sentry) {
        // Client-side Sentry
        window.Sentry.captureException(error, {
          tags: { context },
          extra: additionalInfo,
        });
      } else {
        // Server-side Sentry - only load if DSN is configured
        if (process.env.SENTRY_DSN) {
          const { captureException } = await import('@sentry/nextjs');
          captureException(error, {
            tags: { context },
            extra: additionalInfo,
          });
        }
      }
    } catch (sentryError) {
      // Don't let Sentry errors break the application
      console.warn('Failed to send error to Sentry:', sentryError);
    }
  }
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2,
    shouldRetry = (error) => {
      if (error instanceof GameError) {
        return error.retryable;
      }
      return true;
    },
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      if (onRetry) {
        onRetry(error, attempt);
      }

      const delay = Math.min(
        initialDelay * Math.pow(backoffFactor, attempt),
        maxDelay
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: string,
  options: {
    fallbackValue?: any;
    transformError?: (error: unknown) => unknown;
    onError?: (error: unknown) => void;
  } = {}
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(context, error, { args });

      if (options.onError) {
        options.onError(error);
      }

      if (options.transformError) {
        throw options.transformError(error);
      }

      if (options.fallbackValue !== undefined) {
        return options.fallbackValue;
      }

      throw error;
    }
  }) as T;
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function timeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Validate required environment variables
 */
export function validateEnvVar(
  name: string,
  value: string | undefined,
  options: {
    required?: boolean;
    pattern?: RegExp;
    transform?: (value: string) => string;
  } = {}
): string | undefined {
  const { required = true, pattern, transform } = options;

  if (!value && required) {
    throw new GameError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `Missing required environment variable: ${name}`,
      userMessage: 'Application configuration error. Please contact support.',
      context: { variable: name },
    });
  }

  if (value && pattern && !pattern.test(value)) {
    throw new GameError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `Invalid format for environment variable: ${name}`,
      userMessage: 'Application configuration error. Please contact support.',
      context: { variable: name, pattern: pattern.toString() },
    });
  }

  if (value && transform) {
    return transform(value);
  }

  return value;
}

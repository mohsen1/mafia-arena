/**
 * Unified API Error handling.
 * Provides structured error responses for the API.
 */

export type ErrorCode =
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'UNAUTHORIZED'
  | 'GAME_IN_PROGRESS'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'AUTH_ERROR'
  | 'RETRY_EXHAUSTED'
  | 'PROVIDER_ERROR'
  | 'PARSE_ERROR'
  | 'UNSUPPORTED_MODEL';

export class APIError extends Error {
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }

  toResponse(): Response {
    return Response.json(
      {
        error: {
          code: this.code,
          message: this.message,
          details: this.details,
        },
      },
      { status: this.statusCode }
    );
  }

  toJSON() {
    const result: { error: { code: ErrorCode; message: string; details?: unknown } } = {
      error: {
        code: this.code,
        message: this.message,
      },
    };
    if (this.details !== undefined) {
      result.error.details = this.details;
    }
    return result;
  }
}

export const Errors = {
  NotFound: (resource: string) =>
    new APIError(404, 'NOT_FOUND', `${resource} not found`),

  BadRequest: (message: string, details?: unknown) =>
    new APIError(400, 'BAD_REQUEST', message, details),

  RateLimited: (retryAfter?: number) =>
    new APIError(429, 'RATE_LIMITED', 'Too many requests', { retryAfter }),

  Internal: (message = 'Internal server error') =>
    new APIError(500, 'INTERNAL_ERROR', message),

  Unauthorized: () =>
    new APIError(401, 'UNAUTHORIZED', 'Authentication required'),

  GameInProgress: (gameId: string) =>
    new APIError(409, 'GAME_IN_PROGRESS', `Game ${gameId} is already running`),
};

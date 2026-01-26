/**
 * Unified API Error handling.
 * Provides structured error responses for the API.
 */

/**
 * Standard error codes for API responses.
 * Each code maps to a specific error type and HTTP status.
 */
export enum ErrorCode {
  /** Resource not found (404) */
  NOT_FOUND = 'NOT_FOUND',
  /** Invalid request data (400) */
  BAD_REQUEST = 'BAD_REQUEST',
  /** Rate limit exceeded (429) */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Internal server error (500) */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** Authentication required (401) */
  UNAUTHORIZED = 'UNAUTHORIZED',
  /** Access forbidden (403) */
  FORBIDDEN = 'FORBIDDEN',
  /** Game already running (409) */
  GAME_IN_PROGRESS = 'GAME_IN_PROGRESS',
  /** Request timeout (503) */
  TIMEOUT = 'TIMEOUT',
  /** Invalid AI response (502) */
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  /** Authentication error (401) */
  AUTH_ERROR = 'AUTH_ERROR',
  /** Retry attempts exhausted (503) */
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  /** AI provider error (502) */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** Parse error (502) */
  PARSE_ERROR = 'PARSE_ERROR',
  /** Unsupported model (400) */
  UNSUPPORTED_MODEL = 'UNSUPPORTED_MODEL',
}

/**
 * Map error codes to HTTP status codes.
 */
export const ERROR_CODE_TO_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.GAME_IN_PROGRESS]: 409,
  [ErrorCode.TIMEOUT]: 503,
  [ErrorCode.INVALID_RESPONSE]: 502,
  [ErrorCode.AUTH_ERROR]: 401,
  [ErrorCode.RETRY_EXHAUSTED]: 503,
  [ErrorCode.PROVIDER_ERROR]: 502,
  [ErrorCode.PARSE_ERROR]: 502,
  [ErrorCode.UNSUPPORTED_MODEL]: 400,
};

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
    new APIError(404, ErrorCode.NOT_FOUND, `${resource} not found`),

  BadRequest: (message: string, details?: unknown) =>
    new APIError(400, ErrorCode.BAD_REQUEST, message, details),

  RateLimited: (retryAfter?: number) =>
    new APIError(429, ErrorCode.RATE_LIMITED, 'Too many requests', { retryAfter }),

  Internal: (message = 'Internal server error') =>
    new APIError(500, ErrorCode.INTERNAL_ERROR, message),

  Unauthorized: () =>
    new APIError(401, ErrorCode.UNAUTHORIZED, 'Authentication required'),

  Forbidden: (message: string) =>
    new APIError(403, ErrorCode.FORBIDDEN, message),

  GameInProgress: (gameId: string) =>
    new APIError(409, ErrorCode.GAME_IN_PROGRESS, `Game ${gameId} is already running`),
};

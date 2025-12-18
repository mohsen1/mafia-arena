/**
 * API Error handling utilities.
 * Provides structured error responses for the API.
 */

export class APIError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
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
}

export const Errors = {
  NotFound: (resource: string) =>
    new APIError(404, 'NOT_FOUND', `${resource} not found`),

  BadRequest: (message: string, details?: unknown) =>
    new APIError(400, 'BAD_REQUEST', message, details),

  RateLimited: (retryAfter?: number) =>
    new APIError(429, 'RATE_LIMITED', 'Too many requests', { retryAfter }),

  BudgetExceeded: () =>
    new APIError(503, 'BUDGET_EXCEEDED', 'Daily API budget exceeded. Try again tomorrow.'),

  Internal: (message = 'Internal server error') =>
    new APIError(500, 'INTERNAL_ERROR', message),

  Unauthorized: () =>
    new APIError(401, 'UNAUTHORIZED', 'Authentication required'),

  GameInProgress: (gameId: string) =>
    new APIError(409, 'GAME_IN_PROGRESS', `Game ${gameId} is already running`),
};


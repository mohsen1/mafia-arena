/**
 * Centralized error handling service for API routes and workflows.
 * Provides consistent error logging, formatting, and response generation.
 */

import type { Logger } from './logger.js';
import { createLogger } from './logger.js';
import { APIError, ErrorCode } from './errors.js';
import type { Env } from '../types.js';
import type { GameState } from '../../engine/index.js';

/**
 * Sanitize error messages to prevent XSS attacks.
 * Converts HTML special characters to their entity equivalents.
 *
 * @param message - Raw error message
 * @returns Sanitized message safe for HTML rendering
 */
export function sanitizeErrorMessage(message: string): string {
  return String(message).replace(/[&<>"']/g, (char) => {
    const escapeMap: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escapeMap[char]!;
  });
}

/**
 * Error context information for structured logging.
 */
export interface ErrorContext {
  /** API route or handler name */
  route?: string;
  /** Game ID if applicable */
  gameId?: string;
  /** Action being performed */
  action?: string;
  /** Additional context */
  [key: string]: unknown;
}

/**
 * Standard error response format.
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Error type classification.
 */
export enum ErrorType {
  /** API provider timeout */
  API_TIMEOUT = 'API_TIMEOUT',
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  /** Authentication/authorization error */
  AUTH_ERROR = 'AUTH_ERROR',
  /** Network connectivity issue */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Invalid request data */
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  /** Resource not found */
  NOT_FOUND = 'NOT_FOUND',
  /** Internal server error */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  /** AI provider error */
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  /** Database error */
  DATABASE_ERROR = 'DATABASE_ERROR',
  /** Unknown/unclassified error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Map of error messages to error types for classification.
 */
const ERROR_PATTERNS: Record<string, ErrorType> = {
  'timed out': ErrorType.API_TIMEOUT,
  'timeout': ErrorType.API_TIMEOUT,
  'AbortError': ErrorType.API_TIMEOUT,
  'Durable Object reset': ErrorType.API_TIMEOUT,
  'rate limit': ErrorType.RATE_LIMIT_EXCEEDED,
  '429': ErrorType.RATE_LIMIT_EXCEEDED,
  'unauthorized': ErrorType.AUTH_ERROR,
  '401': ErrorType.AUTH_ERROR,
  '403': ErrorType.AUTH_ERROR,
  'forbidden': ErrorType.AUTH_ERROR,
  'ECONNREFUSED': ErrorType.NETWORK_ERROR,
  'ENOTFOUND': ErrorType.NETWORK_ERROR,
  'network': ErrorType.NETWORK_ERROR,
  'fetch failed': ErrorType.NETWORK_ERROR,
  'validation': ErrorType.VALIDATION_ERROR,
  'invalid': ErrorType.VALIDATION_ERROR,
  'not found': ErrorType.NOT_FOUND,
  '404': ErrorType.NOT_FOUND,
  'database': ErrorType.DATABASE_ERROR,
  'SQL': ErrorType.DATABASE_ERROR,
  'D1_ERROR': ErrorType.DATABASE_ERROR,
};

/**
 * Map error types to HTTP status codes.
 */
const ERROR_TYPE_TO_STATUS: Record<ErrorType, number> = {
  [ErrorType.API_TIMEOUT]: 503,
  [ErrorType.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorType.AUTH_ERROR]: 401,
  [ErrorType.NETWORK_ERROR]: 503,
  [ErrorType.VALIDATION_ERROR]: 400,
  [ErrorType.NOT_FOUND]: 404,
  [ErrorType.INTERNAL_ERROR]: 500,
  [ErrorType.AI_PROVIDER_ERROR]: 502,
  [ErrorType.DATABASE_ERROR]: 500,
  [ErrorType.UNKNOWN_ERROR]: 500,
};

/**
 * Map error types to error codes.
 */
const ERROR_TYPE_TO_CODE: Record<ErrorType, ErrorCode> = {
  [ErrorType.API_TIMEOUT]: ErrorCode.TIMEOUT,
  [ErrorType.RATE_LIMIT_EXCEEDED]: ErrorCode.RATE_LIMITED,
  [ErrorType.AUTH_ERROR]: ErrorCode.UNAUTHORIZED,
  [ErrorType.NETWORK_ERROR]: ErrorCode.PROVIDER_ERROR,
  [ErrorType.VALIDATION_ERROR]: ErrorCode.BAD_REQUEST,
  [ErrorType.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [ErrorType.INTERNAL_ERROR]: ErrorCode.INTERNAL_ERROR,
  [ErrorType.AI_PROVIDER_ERROR]: ErrorCode.PROVIDER_ERROR,
  [ErrorType.DATABASE_ERROR]: ErrorCode.INTERNAL_ERROR,
  [ErrorType.UNKNOWN_ERROR]: ErrorCode.INTERNAL_ERROR,
};

/**
 * Centralized error handler class.
 */
export class ErrorHandler {
  private log: Logger;

  constructor(component: string = 'ErrorHandler') {
    this.log = createLogger(component);
  }

  /**
   * Handle API errors and return consistent Response.
   *
   * @param error - The error to handle
   * @param context - Additional context for logging
   * @param logger - Optional logger instance
   * @returns Response object with standardized error format
   */
  handleApiError(error: unknown, context: ErrorContext, logger?: Logger): Response {
    const effectiveLogger = logger || this.log;
    const requestId = this.generateRequestId();

    // Determine error type and details
    const { type, statusCode, code, message } = this.classifyError(error);

    // Log error with structured context
    effectiveLogger.error('API error', {
      ...context,
      errorType: type,
      errorCode: code,
      errorMessage: message,
      requestId,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Sanitize message to prevent XSS
    const sanitizedMessage = sanitizeErrorMessage(message);

    // Build response
    const response: ErrorResponse = {
      error: {
        code,
        message: sanitizedMessage,
        requestId,
      },
    };

    // Add details if available
    if (error instanceof APIError && error.details) {
      response.error.details = error.details as Record<string, unknown>;
    } else if (error instanceof Error) {
      response.error.details = {
        type: error.name,
      };
    }

    return Response.json(response, { status: statusCode });
  }

  /**
   * Handle workflow errors by saving state and updating database.
   *
   * @param error - The error to handle
   * @param gameId - Game ID
   * @param env - Environment with DB/KV access
   * @param currentState - Current game state (if available)
   * @param batchId - Optional batch ID
   * @returns Promise that resolves when error handling is complete
   */
  async handleWorkflowError(
    error: unknown,
    gameId: string,
    env: Env,
    currentState?: GameState,
    batchId?: string
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const { type, message: userFriendlyMessage } = this.classifyError(error);

    // Log with full stack trace
    this.log.error('Workflow error', {
      gameId,
      batchId,
      errorType: type,
      errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Create safe state for error saving
    const safeState = currentState || this.createMinimalState(gameId, env);

    // Save error state to KV
    await this.saveErrorStateToKV(env, gameId, userFriendlyMessage, safeState);

    // Update game status in D1
    await this.updateGameStatusInD1(env, gameId, userFriendlyMessage);

    // Update batch progress if applicable
    if (batchId) {
      await this.updateBatchProgress(env, batchId);
    }

    // Update daily stats
    await this.updateDailyStats(env);
  }

  /**
   * Classify an error into type, status code, and user-friendly message.
   *
   * @param error - The error to classify
   * @returns Classified error information
   */
  private classifyError(error: unknown): {
    type: ErrorType;
    statusCode: number;
    code: ErrorCode;
    message: string;
  } {
    // Handle APIError instances
    if (error instanceof APIError) {
      return {
        type: this.getErrorCodeType(error.code),
        statusCode: error.statusCode,
        code: error.code,
        message: error.message,
      };
    }

    // Handle standard Error instances
    if (error instanceof Error) {
      const type = this.classifyErrorType(error);
      return {
        type,
        statusCode: ERROR_TYPE_TO_STATUS[type],
        code: ERROR_TYPE_TO_CODE[type],
        message: this.getUserFriendlyMessage(error, type),
      };
    }

    // Handle unknown errors
    return {
      type: ErrorType.UNKNOWN_ERROR,
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unknown error occurred',
    };
  }

  /**
   * Classify error type based on error message patterns.
   *
   * @param error - Error to classify
   * @returns Error type
   */
  private classifyErrorType(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    // Check for known patterns
    for (const [pattern, type] of Object.entries(ERROR_PATTERNS)) {
      if (message.includes(pattern.toLowerCase())) {
        return type;
      }
    }

    // Check error name
    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      return ErrorType.INTERNAL_ERROR;
    }

    // Default to unknown
    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Map error code to error type.
   *
   * @param code - Error code
   * @returns Error type
   */
  private getErrorCodeType(code: ErrorCode): ErrorType {
    const codeToType: Record<ErrorCode, ErrorType> = {
      [ErrorCode.TIMEOUT]: ErrorType.API_TIMEOUT,
      [ErrorCode.RATE_LIMITED]: ErrorType.RATE_LIMIT_EXCEEDED,
      [ErrorCode.UNAUTHORIZED]: ErrorType.AUTH_ERROR,
      [ErrorCode.FORBIDDEN]: ErrorType.AUTH_ERROR,
      [ErrorCode.BAD_REQUEST]: ErrorType.VALIDATION_ERROR,
      [ErrorCode.NOT_FOUND]: ErrorType.NOT_FOUND,
      [ErrorCode.INTERNAL_ERROR]: ErrorType.INTERNAL_ERROR,
      [ErrorCode.PROVIDER_ERROR]: ErrorType.AI_PROVIDER_ERROR,
      [ErrorCode.GAME_IN_PROGRESS]: ErrorType.VALIDATION_ERROR,
      [ErrorCode.INVALID_RESPONSE]: ErrorType.AI_PROVIDER_ERROR,
      [ErrorCode.AUTH_ERROR]: ErrorType.AUTH_ERROR,
      [ErrorCode.RETRY_EXHAUSTED]: ErrorType.API_TIMEOUT,
      [ErrorCode.PARSE_ERROR]: ErrorType.AI_PROVIDER_ERROR,
      [ErrorCode.UNSUPPORTED_MODEL]: ErrorType.VALIDATION_ERROR,
    };

    return codeToType[code] || ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Generate user-friendly error message.
   *
   * @param error - Original error
   * @param type - Classified error type
   * @returns User-friendly message (not yet sanitized)
   */
  private getUserFriendlyMessage(error: Error, type: ErrorType): string {
    const errorMessage = error.message || 'An error occurred';

    // For timeout errors, provide more context
    if (type === ErrorType.API_TIMEOUT) {
      return `AI Provider timed out repeatedly. The model may be experiencing high load or network issues. Error: ${errorMessage}`;
    }

    // For rate limiting
    if (type === ErrorType.RATE_LIMIT_EXCEEDED) {
      return `Rate limit exceeded. Please wait before trying again. Error: ${errorMessage}`;
    }

    // For auth errors
    if (type === ErrorType.AUTH_ERROR) {
      return `Authentication failed. Please check your API keys. Error: ${errorMessage}`;
    }

    // For network errors
    if (type === ErrorType.NETWORK_ERROR) {
      return `Network error occurred. Please check your connection and try again. Error: ${errorMessage}`;
    }

    // Default: include original message
    return errorMessage;
  }

  /**
   * Save error state to KV for frontend visibility.
   *
   * @param env - Environment
   * @param gameId - Game ID
   * @param errorMessage - Error message
   * @param state - Game state
   */
  private async saveErrorStateToKV(
    env: Env,
    gameId: string,
    errorMessage: string,
    state: GameState
  ): Promise<void> {
    try {
      await env.RATE_LIMIT.put(
        `game-state:${gameId}`,
        JSON.stringify({
          state: {
            events: state.events,
            players: state.players,
          },
          status: 'failed',
          currentRound: state.round,
          error: errorMessage,
          updatedAt: Date.now(),
        }),
        { expirationTtl: 86400 }
      );
    } catch (kvError) {
      // Non-fatal - log but don't throw
      this.log.warn('Failed to save error state to KV', {
        gameId,
        error: kvError instanceof Error ? kvError.message : String(kvError),
      });
    }
  }

  /**
   * Update game status to failed in D1.
   *
   * @param env - Environment
   * @param gameId - Game ID
   * @param errorMessage - Error message
   */
  private async updateGameStatusInD1(
    env: Env,
    gameId: string,
    errorMessage: string
  ): Promise<void> {
    try {
      await env.DB.prepare(
        `UPDATE games SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`
      ).bind(errorMessage, Date.now(), gameId).run();
    } catch (dbError) {
      // Non-fatal - log but don't throw
      this.log.warn('Failed to update game status in D1', {
        gameId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  /**
   * Update batch progress after game failure.
   *
   * @param env - Environment
   * @param batchId - Batch ID
   */
  private async updateBatchProgress(env: Env, batchId: string): Promise<void> {
    try {
      // Increment failed_games counter
      await env.DB.prepare(
        `UPDATE batches SET failed_games = failed_games + 1 WHERE id = ?`
      ).bind(batchId).run();

      // Check if batch is now complete
      const batch = await env.DB.prepare(
        `SELECT total_games, completed_games, failed_games, status FROM batches WHERE id = ?`
      ).bind(batchId).first<{
        total_games: number;
        completed_games: number;
        failed_games: number;
        status: string;
      }>();

      if (batch && batch.status === 'processing') {
        const totalProcessed = batch.completed_games + batch.failed_games;
        if (totalProcessed >= batch.total_games) {
          await env.DB.prepare(
            `UPDATE batches SET status = 'completed', completed_at = ? WHERE id = ?`
          ).bind(Math.floor(Date.now() / 1000), batchId).run();

          this.log.info('Batch completed (after game failure)', { batchId, totalProcessed });
        }
      }
    } catch (dbError) {
      // Non-fatal - log but don't throw
      this.log.warn('Failed to update batch progress', {
        batchId,
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  /**
   * Update daily stats for failed game.
   *
   * @param env - Environment
   */
  private async updateDailyStats(env: Env): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0]!;
      await env.DB.prepare(
        `INSERT INTO daily_stats (date, games_failed) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET games_failed = games_failed + 1, updated_at = unixepoch()`
      ).bind(today).run();
    } catch (dbError) {
      // Non-fatal - log but don't throw
      this.log.warn('Failed to update daily stats', {
        error: dbError instanceof Error ? dbError.message : String(dbError),
      });
    }
  }

  /**
   * Create a minimal game state for error handling when state is unavailable.
   *
   * @param gameId - Game ID
   * @param _env - Environment (unused but kept for interface consistency)
   * @returns Minimal game state
   */
  private createMinimalState(gameId: string, _env: Env): GameState {
    // This is a fallback - in practice, state should always be available
    // We import GameState lazily to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GameState: GS } = require('../../engine/index.js');
    return GS.create(gameId, {
      playerCount: 5,
      mafiaCount: 2,
      teams: [],
      maxRounds: 10,
      discussionEnabled: true,
      personaConstraints: 'moderate',
      seed: Date.now(),
      contextLevel: 'full',
      contextWindowSize: 3,
      personaTheme: 'noir',
    }) as GameState;
  }

  /**
   * Generate a unique request ID for error tracking.
   *
   * @returns Request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Singleton error handler instance.
 */
export const errorHandler = new ErrorHandler();

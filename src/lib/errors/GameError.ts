/**
 * Custom error classes for the Werewolf AI game
 * Provides structured error handling with user-friendly messages
 */

export enum ErrorCode {
  // AI Provider Errors
  AI_AUTHENTICATION = 'AI_AUTHENTICATION',
  AI_RATE_LIMIT = 'AI_RATE_LIMIT',
  AI_TIMEOUT = 'AI_TIMEOUT',
  AI_CONNECTION = 'AI_CONNECTION',
  AI_MODEL_NOT_FOUND = 'AI_MODEL_NOT_FOUND',
  AI_CONTEXT_LENGTH = 'AI_CONTEXT_LENGTH',
  AI_SAFETY_FILTER = 'AI_SAFETY_FILTER',
  AI_INVALID_RESPONSE = 'AI_INVALID_RESPONSE',
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',
  
  // Game Engine Errors
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_INVALID_STATE = 'GAME_INVALID_STATE',
  GAME_INVALID_ACTION = 'GAME_INVALID_ACTION',
  GAME_PHASE_ERROR = 'GAME_PHASE_ERROR',
  GAME_SAVE_FAILED = 'GAME_SAVE_FAILED',
  GAME_LOAD_FAILED = 'GAME_LOAD_FAILED',
  GAME_CREATION_FAILED = 'GAME_CREATION_FAILED',
  
  // Character Generation Errors
  CHARACTER_GEN_FAILED = 'CHARACTER_GEN_FAILED',
  CHARACTER_NAME_DUPLICATE = 'CHARACTER_NAME_DUPLICATE',
  CHARACTER_INVALID_DATA = 'CHARACTER_INVALID_DATA',
  
  // Database Errors
  DB_CONNECTION_FAILED = 'DB_CONNECTION_FAILED',
  DB_QUERY_FAILED = 'DB_QUERY_FAILED',
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',
  
  // Authentication Errors
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
  
  // Validation Errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  
  // Network Errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  userMessage: string;
  originalError?: unknown;
  context?: Record<string, unknown>;
  retryable?: boolean;
  httpStatus?: number;
}

export class GameError extends Error {
  public readonly code: ErrorCode;
  public readonly userMessage: string;
  public readonly originalError?: unknown;
  public readonly context?: Record<string, unknown>;
  public readonly retryable: boolean;
  public readonly httpStatus: number;
  public readonly timestamp: Date;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = 'GameError';
    this.code = details.code;
    this.userMessage = details.userMessage;
    this.originalError = details.originalError;
    this.context = details.context;
    this.retryable = details.retryable ?? false;
    this.httpStatus = details.httpStatus ?? 500;
    this.timestamp = new Date();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GameError);
    }
  }

  /**
   * Convert to a serializable object for API responses
   */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      context: this.context,
      retryable: this.retryable,
      timestamp: this.timestamp,
    };
  }

  /**
   * Create error from unknown thrown value
   */
  static fromUnknown(error: unknown, defaultCode: ErrorCode = ErrorCode.UNKNOWN_ERROR): GameError {
    if (error instanceof GameError) {
      return error;
    }

    if (error instanceof Error) {
      // Try to detect specific error types
      const errorMessage = error.message.toLowerCase();
      
      // AI Provider errors
      if (errorMessage.includes('401') || errorMessage.includes('authentication')) {
        return new GameError({
          code: ErrorCode.AI_AUTHENTICATION,
          message: error.message,
          userMessage: 'Invalid API key. Please check your AI provider settings.',
          originalError: error,
          retryable: false,
          httpStatus: 401
        });
      }
      
      if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        return new GameError({
          code: ErrorCode.AI_RATE_LIMIT,
          message: error.message,
          userMessage: 'Too many requests. Please wait a moment and try again.',
          originalError: error,
          retryable: true,
          httpStatus: 429
        });
      }
      
      if (errorMessage.includes('timeout')) {
        return new GameError({
          code: ErrorCode.AI_TIMEOUT,
          message: error.message,
          userMessage: 'Request timed out. The AI service may be busy.',
          originalError: error,
          retryable: true,
          httpStatus: 504
        });
      }
      
      if (errorMessage.includes('econnrefused') || errorMessage.includes('network')) {
        return new GameError({
          code: ErrorCode.NETWORK_ERROR,
          message: error.message,
          userMessage: 'Network connection error. Please check your internet connection.',
          originalError: error,
          retryable: true,
          httpStatus: 503
        });
      }
      
      // Database errors
      if (errorMessage.includes('database') || errorMessage.includes('postgresql')) {
        return new GameError({
          code: ErrorCode.DB_CONNECTION_FAILED,
          message: error.message,
          userMessage: 'Database connection error. Please try again later.',
          originalError: error,
          retryable: true,
          httpStatus: 503
        });
      }
    }

    // Default error
    return new GameError({
      code: defaultCode,
      message: error instanceof Error ? error.message : String(error),
      userMessage: 'An unexpected error occurred. Please try again.',
      originalError: error,
      retryable: true
    });
  }
}

/**
 * Helper function to create common errors
 */
export const GameErrors = {
  aiAuthentication: (provider: string, originalError?: unknown) => new GameError({
    code: ErrorCode.AI_AUTHENTICATION,
    message: `Authentication failed for ${provider}`,
    userMessage: `Invalid API key for ${provider}. Please check your settings.`,
    originalError,
    retryable: false,
    httpStatus: 401
  }),

  aiRateLimit: (provider: string, originalError?: unknown) => new GameError({
    code: ErrorCode.AI_RATE_LIMIT,
    message: `Rate limit exceeded for ${provider}`,
    userMessage: 'Too many requests. Please wait a moment and try again.',
    originalError,
    retryable: true,
    httpStatus: 429
  }),

  aiTimeout: (provider: string, timeoutMs: number, originalError?: unknown) => new GameError({
    code: ErrorCode.AI_TIMEOUT,
    message: `Request to ${provider} timed out after ${timeoutMs}ms`,
    userMessage: 'Request timed out. The AI service may be busy.',
    originalError,
    retryable: true,
    httpStatus: 504
  }),

  aiModelNotFound: (model: string, provider: string, originalError?: unknown) => new GameError({
    code: ErrorCode.AI_MODEL_NOT_FOUND,
    message: `Model ${model} not found for ${provider}`,
    userMessage: `The AI model "${model}" is not available. Please select a different model.`,
    originalError,
    retryable: false,
    httpStatus: 404
  }),

  aiContextLength: (provider: string, originalError?: unknown) => new GameError({
    code: ErrorCode.AI_CONTEXT_LENGTH,
    message: `Context length exceeded for ${provider}`,
    userMessage: 'The conversation is too long. Please start a new game.',
    originalError,
    retryable: false,
    httpStatus: 413
  }),

  gameNotFound: (gameId: string) => new GameError({
    code: ErrorCode.GAME_NOT_FOUND,
    message: `Game ${gameId} not found`,
    userMessage: 'Game not found. It may have been deleted.',
    context: { gameId },
    retryable: false,
    httpStatus: 404
  }),

  invalidGameAction: (action: string, phase: string) => new GameError({
    code: ErrorCode.GAME_INVALID_ACTION,
    message: `Invalid action ${action} during ${phase} phase`,
    userMessage: `This action is not allowed during the ${phase} phase.`,
    context: { action, phase },
    retryable: false,
    httpStatus: 400
  }),

  characterGenerationFailed: (reason: string, originalError?: unknown) => new GameError({
    code: ErrorCode.CHARACTER_GEN_FAILED,
    message: `Character generation failed: ${reason}`,
    userMessage: 'Failed to generate character. Please try again.',
    originalError,
    retryable: true,
    httpStatus: 500
  }),

  databaseError: (operation: string, originalError?: unknown) => new GameError({
    code: ErrorCode.DB_QUERY_FAILED,
    message: `Database ${operation} failed`,
    userMessage: 'A database error occurred. Please try again.',
    originalError,
    context: { operation },
    retryable: true,
    httpStatus: 503
  }),

  unauthorized: (action: string) => new GameError({
    code: ErrorCode.AUTH_UNAUTHORIZED,
    message: `Unauthorized to perform ${action}`,
    userMessage: 'You are not authorized to perform this action.',
    context: { action },
    retryable: false,
    httpStatus: 403
  }),

  validationError: (field: string, reason: string) => new GameError({
    code: ErrorCode.VALIDATION_FAILED,
    message: `Validation failed for ${field}: ${reason}`,
    userMessage: reason,
    context: { field },
    retryable: false,
    httpStatus: 400
  })
}; 
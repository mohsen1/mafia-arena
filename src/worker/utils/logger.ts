/**
 * Structured logging utility for Mafia Arena.
 * Outputs JSON logs compatible with Cloudflare's log aggregation and wrangler tail.
 * 
 * Usage:
 *   const log = createLogger('GameRunner', { gameId: 'xyz' });
 *   log.info('Game started', { playerCount: 7 });
 *   log.error('AI call failed', { error: err.message, modelId: 'gpt-4' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

interface LogEntry {
  level: LogLevel;
  component: string;
  message: string;
  timestamp: string;
  context?: LogContext;
}

export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (additionalContext: LogContext) => Logger;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Minimum log level (can be configured via env)
let minLevel: LogLevel = 'debug';

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

function formatLog(entry: LogEntry): string {
  // Output as JSON for structured logging
  return JSON.stringify(entry);
}

function createLogFunction(
  level: LogLevel,
  component: string,
  baseContext: LogContext
): (message: string, context?: LogContext) => void {
  return (message: string, context?: LogContext) => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      component,
      message,
      timestamp: new Date().toISOString(),
      context: { ...baseContext, ...context },
    };

    const formatted = formatLog(entry);

    switch (level) {
      case 'debug':
        console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        break;
    }
  };
}

/**
 * Create a logger instance for a specific component.
 * 
 * @param component - Name of the component (e.g., 'GameRunner', 'AnthropicProvider')
 * @param baseContext - Base context included in all log entries
 */
export function createLogger(component: string, baseContext: LogContext = {}): Logger {
  return {
    debug: createLogFunction('debug', component, baseContext),
    info: createLogFunction('info', component, baseContext),
    warn: createLogFunction('warn', component, baseContext),
    error: createLogFunction('error', component, baseContext),
    child: (additionalContext: LogContext) => 
      createLogger(component, { ...baseContext, ...additionalContext }),
  };
}

/**
 * Log an error with full context including stack trace.
 */
export function logErrorWithStack(
  logger: Logger,
  message: string,
  error: unknown,
  context?: LogContext
): void {
  const errorInfo: LogContext = {
    ...context,
  };

  if (error instanceof Error) {
    errorInfo.errorName = error.name;
    errorInfo.errorMessage = error.message;
    errorInfo.stack = error.stack?.split('\n').slice(0, 5).join(' | ');
  } else {
    errorInfo.errorMessage = String(error);
  }

  logger.error(message, errorInfo);
}

/**
 * Create a timer for measuring operation duration.
 */
export function createTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}

/**
 * Log helper for AI operations with timing.
 */
export function logAIOperation(
  logger: Logger,
  operation: string,
  modelId: string,
  fn: () => Promise<unknown>
): Promise<unknown> {
  const timer = createTimer();
  
  logger.info(`${operation} started`, { modelId });
  
  return fn()
    .then((result) => {
      logger.info(`${operation} completed`, { 
        modelId, 
        durationMs: timer(),
      });
      return result;
    })
    .catch((error) => {
      logErrorWithStack(logger, `${operation} failed`, error, { 
        modelId, 
        durationMs: timer(),
      });
      throw error;
    });
}


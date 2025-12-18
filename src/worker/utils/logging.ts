/**
 * Error logging utilities.
 * Logs errors to D1 for debugging and monitoring.
 */

/**
 * Log an error to the database.
 */
export async function logError(
  db: D1Database,
  error: Error,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const id = `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    await db
      .prepare(
        `INSERT INTO error_log (id, level, message, stack, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        'error',
        error.message,
        error.stack || null,
        JSON.stringify(context),
        Date.now()
      )
      .run();
  } catch (logErr) {
    // Don't throw if logging fails - just console log
    console.error('Failed to log error to D1:', logErr);
    console.error('Original error:', error);
  }
}

/**
 * Log a warning to the database.
 */
export async function logWarning(
  db: D1Database,
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const id = `warn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    await db
      .prepare(
        `INSERT INTO error_log (id, level, message, stack, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, 'warn', message, null, JSON.stringify(context), Date.now())
      .run();
  } catch (logErr) {
    console.error('Failed to log warning to D1:', logErr);
  }
}

/**
 * Log info to the database.
 */
export async function logInfo(
  db: D1Database,
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    const id = `info_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    await db
      .prepare(
        `INSERT INTO error_log (id, level, message, stack, context, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, 'info', message, null, JSON.stringify(context), Date.now())
      .run();
  } catch (logErr) {
    console.error('Failed to log info to D1:', logErr);
  }
}


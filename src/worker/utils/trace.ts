/**
 * Distributed tracing utilities.
 * Generates unique trace IDs for tracking requests across the system.
 */

/**
 * Generate a unique trace ID.
 * Format: tr_{timestamp}_{random} (e.g., tr_m5abc123_x7z9q2)
 */
export function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `tr_${timestamp}_${random}`;
}

/**
 * Extract trace ID from headers or generate a new one.
 */
export function getOrCreateTraceId(headers: Headers): string {
  const existing = headers.get('x-trace-id');
  return existing || generateTraceId();
}


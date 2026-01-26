/**
 * Rate limiting utilities using KV-based token bucket.
 */

import { RATE_LIMITS } from '../config/constants.js';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request is rate limited using a sliding window counter.
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowKey = `ratelimit:${key}:${Math.floor(now / config.windowMs)}`;
  const resetAt = (Math.floor(now / config.windowMs) + 1) * config.windowMs;

  const current = parseInt((await kv.get(windowKey)) || '0', 10);

  if (current >= config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  await kv.put(windowKey, String(current + 1), {
    expirationTtl: Math.ceil(config.windowMs / 1000) + 60, // Add buffer
  });

  return {
    allowed: true,
    remaining: config.maxRequests - current - 1,
    resetAt,
  };
}

/**
 * Rate limit configurations for different endpoints.
 */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  'POST:/api/games/run': { maxRequests: 10, windowMs: 60_000 }, // 10 per minute
  'GET:/api/games': { maxRequests: RATE_LIMITS.ADMIN_REQUESTS_PER_MINUTE, windowMs: 60_000 }, // 100 per minute
  'GET:/api/leaderboard': { maxRequests: RATE_LIMITS.ADMIN_REQUESTS_PER_MINUTE, windowMs: 60_000 },
  'GET:/api/models': { maxRequests: RATE_LIMITS.ADMIN_REQUESTS_PER_MINUTE, windowMs: 60_000 },
  default: { maxRequests: RATE_LIMITS.DEFAULT_REQUESTS_PER_MINUTE, windowMs: 60_000 }, // 60 per minute fallback
};

/**
 * Get the rate limit key for a request.
 */
export function getRateLimitKey(request: Request, url: URL): string {
  // Use CF-Connecting-IP if available, otherwise use a hash of headers
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const method = request.method;
  
  // Normalize path (remove IDs)
  const path = url.pathname
    .replace(/\/api\/games\/[a-zA-Z0-9_-]+\/transcript$/, '/api/games/:id/transcript')
    .replace(/\/api\/games\/[a-zA-Z0-9_-]+$/, '/api/games/:id');

  return `${ip}:${method}:${path}`;
}

/**
 * Get rate limit config for a request.
 */
export function getRateLimitConfig(method: string, path: string): RateLimitConfig {
  const normalizedPath = path
    .replace(/\/api\/games\/[a-zA-Z0-9_-]+\/transcript$/, '/api/games/:id/transcript')
    .replace(/\/api\/games\/[a-zA-Z0-9_-]+$/, '/api/games/:id');

  const key = `${method}:${normalizedPath}`;
  return RATE_LIMIT_CONFIGS[key] ?? RATE_LIMIT_CONFIGS.default!;
}


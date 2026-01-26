/**
 * Rate limiting middleware for Mafia Arena API.
 */

import type { Context, Next } from 'hono';
import type { Env } from '../types.js';
import { checkRateLimit, getRateLimitKey, getRateLimitConfig } from '../utils/rateLimit.js';
import { RATE_LIMITS } from '../config/constants.js';

export async function rateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  // Skip rate limiting if KV not configured
  if (!c.env.RATE_LIMIT) {
    return next();
  }

  // Skip rate limiting for WebSocket upgrades
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() === 'websocket') {
    return next();
  }

  const url = new URL(c.req.url);
  const key = getRateLimitKey(c.req.raw, url);
  const config = getRateLimitConfig(c.req.method, url.pathname);
  const result = await checkRateLimit(c.env.RATE_LIMIT, key, config);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return c.json(
      { error: 'Rate limit exceeded', retryAfter },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  return next();
}

/**
 * Stricter rate limit specifically for batch creation.
 * Limits to 1 batch per 5 minutes per IP to prevent DoS.
 */
export async function batchRateLimitMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (!c.env.RATE_LIMIT) {
    return next();
  }

  const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
  const key = `batch_create:${ip}`;
  
  const result = await checkRateLimit(c.env.RATE_LIMIT, key, {
    maxRequests: 1,
    windowMs: RATE_LIMITS.BATCH_CREATION_WINDOW_MS,
  });

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return c.json(
      {
        error: 'Batch creation rate limit exceeded',
        message: `You can only create one batch every ${RATE_LIMITS.BATCH_CREATION_WINDOW_MS / 60_000} minutes`,
        retryAfter,
      },
      { status: 429 }
    );
  }

  return next();
}


import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

// In-memory store for rate limiting (for development)
// In production, use Redis or similar
const requestCounts = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple rate limiting middleware
 * @param config Rate limit configuration
 * @returns Middleware function
 */
export async function rateLimit(config: RateLimitConfig) {
  const { windowMs, maxRequests } = config;

  // Get client identifier (IP address or user ID)
  const headersList = await headers();
  const forwarded = headersList.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';

  const now = Date.now();

  // Clean up old entries
  for (const [key, value] of requestCounts.entries()) {
    if (value.resetTime < now) {
      requestCounts.delete(key);
    }
  }

  // Get or create rate limit data for this client
  const clientData = requestCounts.get(ip) || {
    count: 0,
    resetTime: now + windowMs,
  };

  // Check if window has expired
  if (clientData.resetTime < now) {
    clientData.count = 0;
    clientData.resetTime = now + windowMs;
  }

  // Increment request count
  clientData.count++;
  requestCounts.set(ip, clientData);

  // Check if limit exceeded
  if (clientData.count > maxRequests) {
    const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);

    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': new Date(clientData.resetTime).toISOString(),
        },
      }
    );
  }

  // Add rate limit headers to response
  const remaining = maxRequests - clientData.count;
  return {
    headers: {
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': new Date(clientData.resetTime).toISOString(),
    },
  };
}

// Preset configurations
export const rateLimitPresets = {
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
  },
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
  },
  ai: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 AI requests per minute
  },
};

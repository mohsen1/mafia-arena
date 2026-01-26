/**
 * Unit tests for rate limiting middleware.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rateLimitMiddleware, batchRateLimitMiddleware } from '../rateLimit.js';
import { checkRateLimit } from '../../utils/rateLimit.js';

// Mock the rate limit utility
vi.mock('../../utils/rateLimit.js', () => ({
  checkRateLimit: vi.fn(),
  getRateLimitKey: vi.fn((req, url) => `rate_limit:${url.pathname}`),
  getRateLimitConfig: vi.fn((method, path) => ({
    maxRequests: 100,
    windowMs: 60000,
  })),
}));

describe('Rate Limit Middleware', () => {
  let mockContext: any;
  let mockNext: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    mockNext = vi.fn().mockResolvedValue(undefined);
    mockContext = {
      req: {
        url: 'http://test.com/api/games',
        method: 'POST',
        header: vi.fn((name: string) => {
          const headers: Record<string, string> = {
            'cf-connecting-ip': '192.168.1.1',
          };
          return headers[name.toLowerCase()] || null;
        }),
        raw: {
          headers: new Headers([
            ['cf-connecting-ip', '192.168.1.1'],
          ]),
        },
      },
      env: {
        RATE_LIMIT: {
          get: vi.fn(),
          put: vi.fn(),
        },
      },
      json: vi.fn((body: any, init?: any) => ({
        status: init?.status || 200,
        body,
      })),
    };
  });

  describe('rateLimitMiddleware', () => {
    it('should allow requests when under rate limit', async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        resetAt: Date.now() + 60000,
      });

      await rateLimitMiddleware(mockContext, mockNext);

      expect(checkRateLimit).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

  it('should block requests when rate limit exceeded', async () => {
      const resetAt = Date.now() + 60000;
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: false,
        resetAt,
      });

      const result = await rateLimitMiddleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        { error: 'Rate limit exceeded', retryAfter: expect.any(Number) },
        expect.objectContaining({
          status: 429,
          headers: expect.objectContaining({
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
            'Retry-After': expect.any(String),
          }),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip rate limiting when RATE_LIMIT is not configured', async () => {
      // Create a new context without RATE_LIMIT
      const contextWithoutRateLimit = {
        ...mockContext,
        env: {
          RATE_LIMIT: undefined,
        },
      };

      await rateLimitMiddleware(contextWithoutRateLimit, mockNext);

      // checkRateLimit should not be called since RATE_LIMIT is undefined
      expect(checkRateLimit).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip rate limiting for WebSocket upgrades', async () => {
      // Create a new context with WebSocket upgrade header
      const contextWithWebSocket = {
        ...mockContext,
        req: {
          ...mockContext.req,
          header: vi.fn((name: string) => {
            if (name.toLowerCase() === 'upgrade') return 'websocket';
            if (name.toLowerCase() === 'cf-connecting-ip') return '192.168.1.1';
            return null;
          }),
        },
      };

      await rateLimitMiddleware(contextWithWebSocket, mockNext);

      expect(checkRateLimit).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should calculate retry-after header correctly', async () => {
      const resetAt = Date.now() + 35000; // 35 seconds from now
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: false,
        resetAt,
      });

      await rateLimitMiddleware(mockContext, mockNext);

      const callArgs = vi.mocked(mockContext.json).mock.calls[0];
      const headers = callArgs[1]?.headers;
      expect(headers).toBeDefined();
      expect(parseInt(headers['Retry-After'])).toBeGreaterThan(30);
      expect(parseInt(headers['Retry-After'])).toBeLessThan(40);
    });

    it('should handle different request methods', async () => {
      mockContext.req.method = 'GET';
      mockContext.req.url = 'http://test.com/api/games';

      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        resetAt: Date.now() + 60000,
      });

      await rateLimitMiddleware(mockContext, mockNext);

      expect(checkRateLimit).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle different paths with different limits', async () => {
      mockContext.req.url = 'http://test.com/api/batch';

      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        resetAt: Date.now() + 60000,
      });

      await rateLimitMiddleware(mockContext, mockNext);

      expect(checkRateLimit).toHaveBeenCalled();
    });
  });

  describe('batchRateLimitMiddleware', () => {
    it('should allow first batch creation request', async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        resetAt: Date.now() + 300000,
      });

      await batchRateLimitMiddleware(mockContext, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith(
        mockContext.env.RATE_LIMIT,
        'batch_create:192.168.1.1',
        {
          maxRequests: 1,
          windowMs: 300000,
        }
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should block subsequent batch creation requests within window', async () => {
      const resetAt = Date.now() + 300000;
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: false,
        resetAt,
      });

      const result = await batchRateLimitMiddleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Batch creation rate limit exceeded',
          message: 'You can only create one batch every 5 minutes',
          retryAfter: expect.any(Number),
        },
        { status: 429 }
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should skip rate limiting when RATE_LIMIT is not configured', async () => {
      // Create a new context without RATE_LIMIT
      const contextWithoutRateLimit = {
        ...mockContext,
        env: {
          RATE_LIMIT: undefined,
        },
      };

      await batchRateLimitMiddleware(contextWithoutRateLimit, mockNext);

      expect(checkRateLimit).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should use correct IP header for key generation', async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        resetAt: Date.now() + 300000,
      });

      await batchRateLimitMiddleware(mockContext, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith(
        mockContext.env.RATE_LIMIT,
        'batch_create:192.168.1.1',
        expect.any(Object)
      );
    });

    it('should handle missing CF-Connecting-IP header', async () => {
      mockContext.req.header = vi.fn(() => null);
      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        resetAt: Date.now() + 300000,
      });

      await batchRateLimitMiddleware(mockContext, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith(
        mockContext.env.RATE_LIMIT,
        'batch_create:unknown',
        expect.any(Object)
      );
    });

    it('should use X-Forwarded-For as fallback', async () => {
      mockContext.req.header = vi.fn((name: string) => {
        if (name.toLowerCase() === 'cf-connecting-ip') return null;
        if (name.toLowerCase() === 'x-forwarded-for') return '10.0.0.1';
        return null;
      });

      vi.mocked(checkRateLimit).mockResolvedValue({
        allowed: true,
        resetAt: Date.now() + 300000,
      });

      await batchRateLimitMiddleware(mockContext, mockNext);

      expect(checkRateLimit).toHaveBeenCalledWith(
        mockContext.env.RATE_LIMIT,
        'batch_create:10.0.0.1',
        expect.any(Object)
      );
    });
  });
});

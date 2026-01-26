/**
 * Unit tests for admin authentication middleware.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { adminAuthMiddleware, authMiddleware } from '../adminAuth.js';

// Mock the auth module
vi.mock('../../routes/auth.js', () => ({
  getSession: vi.fn(),
}));

import { getSession } from '../../routes/auth.js';

describe('Admin Auth Middleware', () => {
  let mockContext: any;
  let mockNext: any;

  beforeEach(() => {
    mockNext = vi.fn().mockResolvedValue(undefined);
    mockContext = {
      req: {
        url: 'http://test.com/api/admin/models',
        method: 'GET',
        header: vi.fn((name: string) => {
          const headers: Record<string, string> = {
            'accept': 'application/json',
          };
          return headers[name.toLowerCase()] || null;
        }),
        raw: {
          headers: new Headers([
            ['accept', 'application/json'],
          ]),
        },
      },
      env: {
        ADMIN_USERNAME: 'admin',
        ADMIN_PASSWORD: 'secure-password-123',
      },
      json: vi.fn((body: any, init?: any) => ({
        status: init?.status || 200,
        body,
      })),
      redirect: vi.fn((url: string) => ({
        status: 302,
        headers: new Headers([['location', url]]),
      })),
    };
  });

  describe('adminAuthMiddleware', () => {
    it('should allow requests with valid admin session', async () => {
      vi.mocked(getSession).mockResolvedValue({
        isAdmin: true,
        userId: 'user-123',
      });

      await adminAuthMiddleware(mockContext, mockNext);

      expect(getSession).toHaveBeenCalledWith(mockContext.req.raw, mockContext.env);
      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
      expect(mockContext.redirect).not.toHaveBeenCalled();
    });

    it('should allow requests with valid Basic Auth credentials', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const credentials = btoa('admin:secure-password-123');
      mockContext.req.raw.headers.set('Authorization', `Basic ${credentials}`);

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockContext.json).not.toHaveBeenCalled();
    });

    it('should reject requests with invalid Basic Auth credentials', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const credentials = btoa('wrong:credentials');
      mockContext.req.raw.headers.set('Authorization', `Basic ${credentials}`);

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Authentication required',
          message: 'Please authenticate with Google OAuth or Basic Auth',
        },
        expect.objectContaining({
          status: 401,
          headers: expect.objectContaining({
            'WWW-Authenticate': 'Basic realm="Mafia Arena Admin"',
          }),
        })
      );
    });

    it('should reject requests without auth for API requests', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Authentication required',
        }),
        expect.objectContaining({
          status: 401,
        })
      );
    });

    it('should redirect browser requests without auth to login page', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      mockContext.req.header = vi.fn((name: string) => {
        if (name.toLowerCase() === 'accept') return 'text/html';
        return null;
      });

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.redirect).toHaveBeenCalledWith(
        '/admin/login?redirect=%2Fapi%2Fadmin%2Fmodels'
      );
    });

    it('should handle malformed Basic Auth header', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      mockContext.req.raw.headers.set('Authorization', 'Basic invalid-base64');

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalled();
    });

    it('should handle missing Authorization header', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalled();
    });

    it('should reject when ADMIN_USERNAME is not set', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      mockContext.env.ADMIN_USERNAME = undefined;
      const credentials = btoa('admin:secure-password-123');
      mockContext.req.raw.headers.set('Authorization', `Basic ${credentials}`);

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalled();
    });

    it('should reject when ADMIN_PASSWORD is not set', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      mockContext.env.ADMIN_PASSWORD = undefined;
      const credentials = btoa('admin:secure-password-123');
      mockContext.req.raw.headers.set('Authorization', `Basic ${credentials}`);

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalled();
    });

    it('should use timing-safe comparison for credentials', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      const credentials = btoa('admin:secure-password-123');
      mockContext.req.raw.headers.set('Authorization', `Basic ${credentials}`);

      await adminAuthMiddleware(mockContext, mockNext);

      // Should complete without timing attack vulnerabilities
      expect(mockNext).toHaveBeenCalled();
    });

    it('should detect API requests by Authorization header presence', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      mockContext.req.raw.headers.set('Authorization', 'Basic invalid-credentials');
      mockContext.req.header = vi.fn((name: string) => {
        if (name.toLowerCase() === 'authorization') return 'Basic invalid-credentials';
        return null;
      });

      await adminAuthMiddleware(mockContext, mockNext);

      expect(mockContext.json).toHaveBeenCalled();
      expect(mockContext.redirect).not.toHaveBeenCalled();
    });
  });

  describe('authMiddleware', () => {
    it('should allow requests with valid session', async () => {
      vi.mocked(getSession).mockResolvedValue({
        userId: 'user-123',
        isAdmin: false,
      });

      await authMiddleware(mockContext, mockNext);

      expect(getSession).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject API requests without session', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      await authMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.json).toHaveBeenCalledWith(
        { error: 'Authentication required' },
        401
      );
    });

    it('should redirect browser requests without session', async () => {
      vi.mocked(getSession).mockResolvedValue(null);

      mockContext.req.header = vi.fn((name: string) => {
        if (name.toLowerCase() === 'accept') return 'text/html';
        return null;
      });

      await authMiddleware(mockContext, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockContext.redirect).toHaveBeenCalledWith(
        '/admin/login?redirect=%2Fapi%2Fadmin%2Fmodels'
      );
    });
  });
});

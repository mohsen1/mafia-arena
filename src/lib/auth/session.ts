/**
 * Unified Session Management
 * Supports both NextAuth and Melody with session synchronization
 * Cloudflare Workers Compatible
 * Phase 2 Migration: NextAuth to Melody
 */

import { z } from 'zod';
import { authConfig, authFeatureFlags, unifiedAuth } from '@/lib/auth/config';
import { NextRequest, NextResponse } from 'next/server';

// Session schemas
const sessionDataSchema = z.object({
  id: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().nullable(),
    image: z.string().url().nullable(),
    provider: z.enum(['nextauth', 'melody']),
  }),
  expires: z.date(),
  createdAt: z.date(),
  lastRefresh: z.date(),
});

const sessionRefreshSchema = z.object({
  refreshToken: z.string().optional(),
  forceRefresh: z.boolean().default(false),
});

// Session interface
export interface SessionData {
  id: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    provider: 'nextauth' | 'melody';
  };
  expires: Date;
  createdAt: Date;
  lastRefresh: Date;
  metadata?: Record<string, any>;
}

// Session management options
export interface SessionOptions {
  maxAge: number;
  updateAge: number;
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  path: string;
  domain?: string;
}

/**
 * Unified Session Manager
 */
export class UnifiedSessionManager {
  private config: SessionOptions;
  private activeProvider: 'nextauth' | 'melody';

  constructor() {
    // Determine active provider
    this.activeProvider = authFeatureFlags.enableMelody ? 'melody' : 'nextauth';
    
    // Session configuration
    this.config = {
      maxAge: authConfig.melody.sessionMaxAge,
      updateAge: authConfig.melody.sessionUpdateAge,
      secure: authConfig.melody.sessionStrategy === 'jwt',
      sameSite: 'lax',
      path: '/',
    };

    if (authFeatureFlags.logAuthActivity) {
      console.log(`🎵 Session manager initialized with ${this.activeProvider}`);
    }
  }

  /**
   * Get current session from request
   */
  async getSession(request: NextRequest): Promise<SessionData | null> {
    try {
      // Use unified auth to get session
      const session = await unifiedAuth.getProvider().getSession?.(request);
      
      if (!session) {
        return null;
      }

      // Normalize session data
      const normalizedSession: SessionData = {
        id: session.sessionToken || session.accessToken || 'unknown',
        user: {
          id: session.user?.id || session.id,
          email: session.user?.email || session.email,
          name: session.user?.name || session.name,
          image: session.user?.image || session.image,
          provider: this.activeProvider,
        },
        expires: new Date(session.expires || Date.now() + this.config.maxAge * 1000),
        createdAt: new Date(session.createdAt || Date.now()),
        lastRefresh: new Date(),
        metadata: {
          provider: this.activeProvider,
          originalProvider: session.provider,
        },
      };

      if (authFeatureFlags.logAuthActivity) {
        console.log(`✅ Session retrieved for user: ${normalizedSession.user.email}`);
      }

      return normalizedSession;
    } catch (error) {
      console.error('Session retrieval error:', error);
      return null;
    }
  }

  /**
   * Refresh session if needed
   */
  async refreshSession(request: NextRequest, session: SessionData): Promise<SessionData | null> {
    try {
      const now = Date.now();
      const expiresAt = session.expires.getTime();
      const refreshAt = expiresAt - (this.config.updateAge * 1000);

      // Check if session needs refresh
      if (now < refreshAt && !session.metadata?.forceRefresh) {
        return session;
      }

      if (authFeatureFlags.logAuthActivity) {
        console.log('🔄 Refreshing session...');
      }

      // Refresh with appropriate provider
      let refreshedSession: SessionData | null = null;

      if (this.activeProvider === 'melody') {
        refreshedSession = await this.refreshMelodySession(request, session);
      } else {
        refreshedSession = await this.refreshNextAuthSession(request, session);
      }

      if (refreshedSession) {
        refreshedSession.lastRefresh = new Date();
        if (authFeatureFlags.logAuthActivity) {
          console.log('✅ Session refreshed successfully');
        }
      } else {
        console.warn('⚠️ Session refresh failed');
      }

      return refreshedSession;
    } catch (error) {
      console.error('Session refresh error:', error);
      return null;
    }
  }

  /**
   * Refresh Melody session
   */
  private async refreshMelodySession(request: NextRequest, session: SessionData): Promise<SessionData | null> {
    try {
      const refreshToken = request.cookies.get('melody-refresh')?.value;
      
      if (!refreshToken) {
        console.warn('No refresh token available for Melody');
        return null;
      }

      const refreshResponse = await fetch(`${authConfig.melody.serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!refreshResponse.ok) {
        console.warn('Melody refresh failed:', await refreshResponse.text());
        return null;
      }

      const refreshData = await refreshResponse.json();
      
      return {
        ...session,
        expires: new Date(refreshData.expires || Date.now() + this.config.maxAge * 1000),
        metadata: {
          ...session.metadata,
          refreshed: true,
        },
      };
    } catch (error) {
      console.error('Melody session refresh error:', error);
      return null;
    }
  }

  /**
   * Refresh NextAuth session
   */
  private async refreshNextAuthSession(request: NextRequest, session: SessionData): Promise<SessionData | null> {
    try {
      // For NextAuth, we'll trigger a session validation
      const sessionData = await unifiedAuth.getProvider().getSession?.(request);
      
      if (!sessionData) {
        return null;
      }

      return {
        ...session,
        expires: new Date(sessionData.expires || Date.now() + this.config.maxAge * 1000),
        metadata: {
          ...session.metadata,
          refreshed: true,
        },
      };
    } catch (error) {
      console.error('NextAuth session refresh error:', error);
      return null;
    }
  }

  /**
   * Invalidate session
   */
  async invalidateSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
    try {
      // Invalidate with active provider
      if (this.activeProvider === 'melody') {
        await this.invalidateMelodySession(request, response);
      } else {
        await this.invalidateNextAuthSession(request, response);
      }

      // Clear cookies
      response.cookies.set('melody-session', '', {
        ...this.config,
        expires: new Date(0),
      });
      
      response.cookies.set('melody-refresh', '', {
        ...this.config,
        expires: new Date(0),
      });

      // Clear NextAuth cookies if they exist
      response.cookies.set('next-auth.session-token', '', {
        ...this.config,
        expires: new Date(0),
      });

      if (authFeatureFlags.logAuthActivity) {
        console.log('🔓 Session invalidated');
      }

      return response;
    } catch (error) {
      console.error('Session invalidation error:', error);
      return response;
    }
  }

  /**
   * Invalidate Melody session
   */
  private async invalidateMelodySession(request: NextRequest, response: NextResponse): Promise<void> {
    try {
      const sessionToken = request.cookies.get('melody-session')?.value;
      const refreshToken = request.cookies.get('melody-refresh')?.value;

      // Call Melody server to invalidate
      if (sessionToken) {
        await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
          },
        });
      }

      if (refreshToken) {
        await fetch(`${authConfig.melody.serverUrl}/api/auth/refresh`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${refreshToken}`,
          },
        });
      }
    } catch (error) {
      console.error('Melody session invalidation error:', error);
    }
  }

  /**
   * Invalidate NextAuth session
   */
  private async invalidateNextAuthSession(request: NextRequest, response: NextResponse): Promise<void> {
    try {
      // NextAuth handles cookie clearing through its signOut method
      await unifiedAuth.getProvider().signOut?.(response);
    } catch (error) {
      console.error('NextAuth session invalidation error:', error);
    }
  }

  /**
   * Create session response
   */
  createSessionResponse(session: SessionData, user: any = null): NextResponse {
    const response = NextResponse.json({
      session,
      authenticated: true,
    });

    // Set session cookie based on active provider
    if (this.activeProvider === 'melody') {
      response.cookies.set('melody-session', session.id, {
        ...this.config,
        httpOnly: true,
      });
      
      // Set refresh cookie if provided
      if (user?.refreshToken) {
        response.cookies.set('melody-refresh', user.refreshToken, {
          ...this.config,
          httpOnly: true,
          maxAge: this.config.maxAge * 24, // 24x longer than session
        });
      }
    } else {
      // NextAuth cookies are handled by NextAuth itself
    }

    return response;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    activeProvider: string;
    sessionConfig: SessionOptions;
    isMelodyEnabled: boolean;
    isNextAuthEnabled: boolean;
  }> {
    return {
      activeProvider: this.activeProvider,
      sessionConfig: this.config,
      isMelodyEnabled: authFeatureFlags.enableMelody,
      isNextAuthEnabled: authFeatureFlags.nextAuthFallback && !authFeatureFlags.enableMelody,
    };
  }
}

/**
 * Session utilities
 */
export const sessionUtils = {
  /**
   * Check if session is expired
   */
  isExpired(session: SessionData): boolean {
    return Date.now() > session.expires.getTime();
  },

  /**
   * Check if session needs refresh
   */
  needsRefresh(session: SessionData): boolean {
    const now = Date.now();
    const refreshAt = session.expires.getTime() - (authConfig.melody.sessionUpdateAge * 1000);
    return now >= refreshAt;
  },

  /**
   * Get remaining session time in seconds
   */
  getRemainingTime(session: SessionData): number {
    const remaining = session.expires.getTime() - Date.now();
    return Math.max(0, Math.floor(remaining / 1000));
  },

  /**
   * Validate session data
   */
  validateSession(data: any): data is SessionData {
    try {
      sessionDataSchema.parse(data);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Create session from user data
   */
  createSessionFromUser(
    user: { id: string; email: string; name?: string; image?: string },
    provider: 'nextauth' | 'melody',
    maxAge: number = authConfig.melody.sessionMaxAge
  ): SessionData {
    const now = Date.now();
    const expires = new Date(now + maxAge * 1000);

    return {
      id: `${provider}-${user.id}-${now}`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        provider,
      },
      expires,
      createdAt: new Date(now),
      lastRefresh: new Date(now),
      metadata: {
        provider,
        version: '2.0',
      },
    };
  },
};

/**
 * Middleware integration helpers
 */
export const sessionMiddleware = {
  /**
   * Extract session from request for middleware
   */
  async extractSession(request: NextRequest): Promise<SessionData | null> {
    const sessionManager = new UnifiedSessionManager();
    return sessionManager.getSession(request);
  },

  /**
   * Check if request requires authentication
   */
  requiresAuth(pathname: string): boolean {
    const protectedPaths = [
      '/games',
      '/profile',
      '/character-setup',
      '/admin',
      '/api/protected',
      '/api/game',
    ];

    return protectedPaths.some(pattern => 
      pathname.startsWith(pattern) || 
      pathname.match(new RegExp(`^${pattern}/`))
    );
  },

  /**
   * Check if path is public (no auth required)
   */
  isPublicPath(pathname: string): boolean {
    const publicPaths = [
      '/',
      '/games/public',
      '/help',
      '/auth/signin',
      '/auth/signup',
      '/auth/forgot',
      '/auth/reset',
      '/auth/error',
      '/api/auth',
      '/api/auth/melody',
      '/api/auth/melody/callback',
    ];

    return publicPaths.some(pattern => 
      pathname.startsWith(pattern) ||
      pathname.match(new RegExp(`^${pattern}/`))
    );
  },
};

// Note: UnifiedSessionManager is already exported above
// The class was exported using 'export class' syntax above

// Global session manager instance
export const sessionManager = new UnifiedSessionManager();
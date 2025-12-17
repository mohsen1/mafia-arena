/**
 * Authentication Middleware
 * Supports both NextAuth and Melody with feature flags
 * Cloudflare Workers Compatible
 * Phase 2 Migration: NextAuth to Melody
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { authConfig, authFeatureFlags, unifiedAuth } from '@/lib/auth/config';

// Protected route patterns
const PROTECTED_PATHS = [
  '/games',
  '/profile',
  '/character-setup',
  '/admin',
  '/api/protected',
  '/api/game',
];

const AUTH_PATHS = [
  '/auth/signin',
  '/auth/signup',
  '/auth/forgot',
  '/auth/reset',
  '/auth/error',
  '/api/auth',
];

// Public routes that don't require authentication
const PUBLIC_PATHS = [
  '/',
  '/games/public',
  '/help',
  '/api/auth/melody',
  '/api/auth/melody/callback',
  '/api/auth/melody/session',
  '/api/auth/melody/setup',
];

// Helper function to check if path is protected
function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(pattern => 
    pathname.startsWith(pattern) || 
    pathname.match(new RegExp(`^${pattern}/`))
  );
}

// Helper function to check if path is public
function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(pattern => 
    pathname.startsWith(pattern) ||
    pathname.match(new RegExp(`^${pattern}/`))
  );
}

// Helper function to check if Melody is enabled
function isMelodyEnabled(): boolean {
  return authFeatureFlags.enableMelody && !!authConfig.melody.serverUrl;
}

// Helper function to check if NextAuth is enabled
function isNextAuthEnabled(): boolean {
  return authFeatureFlags.nextAuthFallback && !authFeatureFlags.enableMelody;
}

// Helper function to extract session from NextAuth
async function getNextAuthSession(request: NextRequest) {
  try {
    // Use require to avoid TypeScript import issues
    let nextAuthModule: any;
    
    try {
      nextAuthModule = require('next-auth');
    } catch (requireError) {
      console.warn('NextAuth module not available:', requireError);
      return null;
    }
    
    if (!nextAuthModule?.auth) {
      console.warn('NextAuth auth function not available');
      return null;
    }
    
    // Create a mock request object for NextAuth
    const session = await nextAuthModule.auth({
      headers: Object.fromEntries(request.headers.entries()),
    } as any);
    
    return session;
  } catch (error) {
    console.warn('NextAuth session check failed:', error);
    return null;
  }
}

// Helper function to extract session from Melody
async function getMelodySession(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('melody-session')?.value;
    
    if (!sessionToken) {
      return null;
    }

    // Validate session with Melody server
    const response = await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': `melody-session=${sessionToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('Melody session check failed:', error);
    return null;
  }
}

// Helper function to get current session from any provider
async function getCurrentSession(request: NextRequest) {
  try {
    // Use the unified auth system
    const session = await unifiedAuth.getSession?.(request);
    
    if (session) {
      const provider = isMelodyEnabled() ? 'melody' : 'nextauth';
      if (authFeatureFlags.logAuthActivity) {
        console.log(`✅ Valid ${provider} session found`);
      }
      return { session, provider };
    }
    
    return null;
  } catch (error) {
    console.warn('Session check failed:', error);
    return null;
  }
}

// Helper function to redirect to sign-in
function createSignInRedirect(request: NextRequest) {
  const currentUrl = new URL(request.url);
  const callbackUrl = encodeURIComponent(currentUrl.pathname + currentUrl.search);
  
  // Use Melody auth server if enabled, otherwise use local sign-in
  const signInPath = isMelodyEnabled() 
    ? `${authConfig.melody.serverUrl}/auth/signin?redirect=${callbackUrl}`
    : `/auth/signin?callbackUrl=${callbackUrl}`;
  
  return NextResponse.redirect(signInPath);
}

// Main middleware function
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Log activity in development
  if (authFeatureFlags.logAuthActivity) {
    console.log(`🔐 Middleware: ${request.method} ${pathname}`);
  }

  // Skip middleware for non-HTTP requests
  if (pathname.startsWith('/_next/') || 
      pathname.startsWith('/favicon.ico') || 
      pathname.startsWith('/_vercel') ||
      pathname.startsWith('/static/')) {
    return NextResponse.next();
  }

  // Check if path is public (no authentication required)
  if (isPublicPath(pathname)) {
    if (authFeatureFlags.logAuthActivity) {
      console.log(`🔓 Public path: ${pathname}`);
    }
    return NextResponse.next();
  }

  // Check if path is protected
  const isProtected = isProtectedPath(pathname);

  if (isProtected) {
    if (authFeatureFlags.logAuthActivity) {
      console.log(`🔒 Protected path: ${pathname}`);
    }

    // Get current session
    const currentSession = await getCurrentSession(request);

    if (!currentSession) {
      if (authFeatureFlags.logAuthActivity) {
        console.log(`❌ No valid session for protected path: ${pathname}`);
      }
      return createSignInRedirect(request);
    }

    // Validate session data
    const session = currentSession.session;
    
    // Check if session has required user data
    if (!session?.user || !session.user.id) {
      if (authFeatureFlags.logAuthActivity) {
        console.log(`⚠️ Invalid session data for path: ${pathname}`);
      }
      return createSignInRedirect(request);
    }

    // Session is valid, allow access
    if (authFeatureFlags.logAuthActivity) {
      console.log(`✅ Valid ${currentSession.provider} session for path: ${pathname}`);
    }

    // Add session info to headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-session-provider', currentSession.provider);
    requestHeaders.set('x-user-id', session.user.id);
    requestHeaders.set('x-user-email', session.user.email || '');
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // For auth-related paths, check if user is already authenticated
  if (AUTH_PATHS.some(pattern => pathname.startsWith(pattern))) {
    const currentSession = await getCurrentSession(request);
    
    if (currentSession && currentSession.session?.user) {
      // User is already authenticated, redirect to dashboard
      if (authFeatureFlags.logAuthActivity) {
        console.log(`🔄 Authenticated user accessing auth path: ${pathname}`);
      }
      return NextResponse.redirect(new URL('/games', request.url));
    }
  }

  // Allow all other paths
  return NextResponse.next();
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};

// Enhanced middleware for specific scenarios
export function withAuthValidation(
  handler: (request: NextRequest, session: any) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const currentSession = await getCurrentSession(request);
    
    if (!currentSession) {
      return createSignInRedirect(request);
    }
    
    return handler(request, currentSession.session);
  };
}

// Session management utilities
export const authUtils = {
  // Check if user has required role/permission
  hasPermission(session: any, permission: string): boolean {
    // Implement role-based permissions
    // This is a placeholder - implement based on your needs
    return session?.user?.permissions?.includes(permission) || false;
  },
  
  // Check if user is admin
  isAdmin(session: any): boolean {
    return session?.user?.role === 'admin' || session?.user?.isAdmin === true;
  },
  
  // Get user info from session
  getUserInfo(session: any) {
    return {
      id: session?.user?.id,
      email: session?.user?.email,
      name: session?.user?.name,
      image: session?.user?.image,
      role: session?.user?.role,
      permissions: session?.user?.permissions || [],
    };
  },
  
  // Check if session is from Melody or NextAuth
  getProvider(session: any): 'melody' | 'nextauth' {
    return session?.provider || 'nextauth';
  },
};

// Export types for use in other files
export type AuthSession = {
  user: {
    id: string;
    email?: string;
    name?: string;
    image?: string;
    role?: string;
    permissions?: string[];
  };
  provider: 'melody' | 'nextauth';
  expires?: string;
};

export type MiddlewareContext = {
  request: NextRequest;
  session?: AuthSession;
  provider?: 'melody' | 'nextauth';
};

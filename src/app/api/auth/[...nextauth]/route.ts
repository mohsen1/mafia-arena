/**
 * Unified Authentication Route
 * Supports both NextAuth and Melody with feature flags
 * Phase 2 Migration: NextAuth to Melody
 */

import { NextRequest, NextResponse } from 'next/server';
import { authConfig, authFeatureFlags, unifiedAuth, nextAuthProvider } from '@/lib/auth/config';
import { z } from 'zod';

// Authentication request validation schema
const authRequestSchema = z.object({
  provider: z.string().optional(),
  callbackUrl: z.string().url().optional(),
  redirect: z.boolean().optional(),
});

// Helper function to check if Melody is enabled
function isMelodyEnabled() {
  return authFeatureFlags.enableMelody && !!authConfig.melody.serverUrl;
}

// Helper function to check if NextAuth is enabled
function isNextAuthEnabled() {
  return authFeatureFlags.nextAuthFallback && !authFeatureFlags.enableMelody;
}

// Helper function to create JSON response
function jsonResponse(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// Helper function to create redirect response
function redirectResponse(url: string, status = 302) {
  return NextResponse.redirect(url, { status });
}

// Helper function to handle authentication errors
function handleAuthError(error: any, provider: 'nextauth' | 'melody') {
  console.error(`${provider} auth error:`, error);
  
  // Log activity if enabled
  if (authFeatureFlags.logAuthActivity) {
    console.log(`🔐 Auth error with ${provider}:`, error.message || error);
  }

  // Return appropriate error response
  return jsonResponse({
    error: 'Authentication failed',
    provider,
    message: error.message || 'Unknown error',
  }, 401);
}

// GET /api/auth/[...nextauth] - Handle authentication requests
export async function GET(request: NextRequest, { params }: { params: { nextauth: string[] } }) {
  try {
    const { searchParams } = new URL(request.url);
    const nextauthPath = params.nextauth || [];
    const action = nextauthPath[0]; // e.g., 'session', 'token', 'signin', etc.
    
    // Determine which authentication system to use
    const useMelody = isMelodyEnabled();
    const useNextAuth = isNextAuthEnabled();

    if (authFeatureFlags.logAuthActivity) {
      console.log(`🔐 Auth GET request:`, {
        action,
        path: nextauthPath.join('/'),
        useMelody,
        useNextAuth,
        url: request.url,
      });
    }

    // Handle Melody authentication
    if (useMelody) {
      try {
        const melodyResponse = await handleMelodyRequest(request, action, searchParams);
        if (melodyResponse) {
          return melodyResponse;
        }
      } catch (error) {
        // If Melody fails and NextAuth fallback is enabled, try NextAuth
        if (useNextAuth) {
          console.warn('Melody failed, falling back to NextAuth:', error);
        } else {
          return handleAuthError(error, 'melody');
        }
      }
    }

    // Handle NextAuth authentication (primary or fallback)
    if (useNextAuth || nextAuthProvider.enabled) {
      try {
        const nextAuthHandlers = nextAuthProvider.handlers;
        if (nextAuthHandlers && nextAuthHandlers.GET) {
          return await nextAuthHandlers.GET(request);
        }
      } catch (error) {
        return handleAuthError(error, 'nextauth');
      }
    }

    // No authentication system available
    return jsonResponse({
      error: 'No authentication system available',
      enabled: {
        melody: useMelody,
        nextauth: useNextAuth,
      },
    }, 503);

  } catch (error) {
    console.error('Auth GET error:', error);
    return handleAuthError(error, 'nextauth');
  }
}

// POST /api/auth/[...nextauth] - Handle authentication actions
export async function POST(request: NextRequest, { params }: { params: { nextauth: string[] } }) {
  try {
    const nextauthPath = params.nextauth || [];
    const action = nextauthPath[0];

    // Determine which authentication system to use
    const useMelody = isMelodyEnabled();
    const useNextAuth = isNextAuthEnabled();

    if (authFeatureFlags.logAuthActivity) {
      console.log(`🔐 Auth POST request:`, {
        action,
        path: nextauthPath.join('/'),
        useMelody,
        useNextAuth,
      });
    }

    // Handle Melody authentication
    if (useMelody) {
      try {
        const melodyResponse = await handleMelodyPostRequest(request, action);
        if (melodyResponse) {
          return melodyResponse;
        }
      } catch (error) {
        // If Melody fails and NextAuth fallback is enabled, try NextAuth
        if (useNextAuth) {
          console.warn('Melody POST failed, falling back to NextAuth:', error);
        } else {
          return handleAuthError(error, 'melody');
        }
      }
    }

    // Handle NextAuth authentication (primary or fallback)
    if (useNextAuth || nextAuthProvider.enabled) {
      try {
        const nextAuthHandlers = nextAuthProvider.handlers;
        if (nextAuthHandlers && nextAuthHandlers.POST) {
          return await nextAuthHandlers.POST(request);
        }
      } catch (error) {
        return handleAuthError(error, 'nextauth');
      }
    }

    // No authentication system available
    return jsonResponse({
      error: 'No authentication system available',
      enabled: {
        melody: useMelody,
        nextauth: useNextAuth,
      },
    }, 503);

  } catch (error) {
    console.error('Auth POST error:', error);
    return handleAuthError(error, 'nextauth');
  }
}

// PUT /api/auth/[...nextauth] - Handle authentication updates
export async function PUT(request: NextRequest, { params }: { params: { nextauth: string[] } }) {
  try {
    const nextauthPath = params.nextauth || [];
    const action = nextauthPath[0];

    // For now, only NextAuth supports PUT operations
    if (nextAuthProvider.enabled) {
      try {
        const nextAuthHandlers = nextAuthProvider.handlers;
        if (nextAuthHandlers && nextAuthHandlers.PUT) {
          return await nextAuthHandlers.PUT(request);
        }
      } catch (error) {
        return handleAuthError(error, 'nextauth');
      }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Auth PUT error:', error);
    return handleAuthError(error, 'nextauth');
  }
}

// DELETE /api/auth/[...nextauth] - Handle authentication deletion
export async function DELETE(request: NextRequest, { params }: { params: { nextauth: string[] } }) {
  try {
    const nextauthPath = params.nextauth || [];
    const action = nextauthPath[0];

    // Handle Melody authentication
    if (isMelodyEnabled()) {
      try {
        const melodyResponse = await handleMelodyDeleteRequest(request, action);
        if (melodyResponse) {
          return melodyResponse;
        }
      } catch (error) {
        console.warn('Melody DELETE failed:', error);
      }
    }

    // Handle NextAuth authentication
    if (nextAuthProvider.enabled) {
      try {
        const nextAuthHandlers = nextAuthProvider.handlers;
        if (nextAuthHandlers && nextAuthHandlers.DELETE) {
          return await nextAuthHandlers.DELETE(request);
        }
      } catch (error) {
        return handleAuthError(error, 'nextauth');
      }
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('Auth DELETE error:', error);
    return handleAuthError(error, 'nextauth');
  }
}

// Helper function to handle Melody GET requests
async function handleMelodyRequest(request: NextRequest, action: string, searchParams: URLSearchParams) {
  switch (action) {
    case 'session': {
      const session = await unifiedAuth.getProvider().getSession?.(request);
      return jsonResponse({ session });
    }
    
    case 'providers': {
      return jsonResponse({
        providers: {
          google: authConfig.providers.google.enabled,
          github: authConfig.providers.github.enabled,
          credentials: authConfig.providers.credentials.enabled,
        },
      });
    }
    
    default: {
      // Redirect to Melody auth server for unknown actions
      if (isMelodyEnabled()) {
        const redirectUrl = `${authConfig.melody.serverUrl}/auth/${action || 'signin'}`;
        return redirectResponse(redirectUrl);
      }
      return null;
    }
  }
}

// Helper function to handle Melody POST requests
async function handleMelodyPostRequest(request: NextRequest, action: string) {
  switch (action) {
    case 'signin': {
      const body = await request.json().catch(() => ({}));
      const { provider, redirect = true } = authRequestSchema.parse(body);
      
      if (provider) {
        const signInUrl = `${authConfig.melody.serverUrl}/auth/signin/${provider}`;
        return redirect ? redirectResponse(signInUrl) : jsonResponse({ url: signInUrl });
      }
      break;
    }
    
    case 'signout': {
      return unifiedAuth.getProvider().signOut({ redirect: true });
    }
  }
  
  return null;
}

// Helper function to handle Melody DELETE requests
async function handleMelodyDeleteRequest(request: NextRequest, action: string) {
  switch (action) {
    case 'session': {
      return unifiedAuth.getProvider().signOut();
    }
  }
  
  return null;
}

// Feature flag management endpoints (for development/admin)
export async function PATCH(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  try {
    const body = await request.json();
    const { enableMelody, logAuthActivity } = body;

    // Update feature flags (temporary, for development only)
    if (typeof enableMelody === 'boolean') {
      process.env.AUTH_ENABLE_MELODY = enableMelody.toString();
    }
    
    if (typeof logAuthActivity === 'boolean') {
      process.env.AUTH_LOG_ACTIVITY = logAuthActivity.toString();
    }

    return jsonResponse({
      success: true,
      featureFlags: {
        enableMelody: process.env.AUTH_ENABLE_MELODY === 'true',
        logAuthActivity: process.env.AUTH_LOG_ACTIVITY === 'true',
        nextAuthFallback: process.env.AUTH_NEXTAUTH_FALLBACK !== 'false',
      },
    });
  } catch (error) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
}

// Health check endpoint
export async function OPTIONS() {
  return jsonResponse({
    status: 'healthy',
    enabled: {
      melody: isMelodyEnabled(),
      nextauth: isNextAuthEnabled(),
      fallback: authFeatureFlags.nextAuthFallback,
    },
    providers: {
      google: authConfig.providers.google.enabled,
      github: authConfig.providers.github.enabled,
      credentials: authConfig.providers.credentials.enabled,
    },
    server: {
      url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      melodyUrl: authConfig.melody.serverUrl,
    },
  });
}

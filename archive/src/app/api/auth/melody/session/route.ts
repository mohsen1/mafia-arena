/**
 * Melody Session Management Route
 * Handles session validation, refresh, and management
 * Cloudflare Workers Compatible
 */

import { NextRequest, NextResponse } from 'next/server';
import { authConfig, authFeatureFlags } from '@/lib/auth/config';
import { z } from 'zod';

// Session management validation schemas
const sessionUpdateSchema = z.object({
  user: z.object({
    name: z.string().optional(),
    image: z.string().url().optional(),
  }).optional(),
  preferences: z.record(z.any()).optional(),
});

const sessionRefreshSchema = z.object({
  refreshToken: z.string().optional(),
});

// Helper function to check if Melody is enabled
function isMelodyEnabled() {
  return authFeatureFlags.enableMelody && !!authConfig.melody.serverUrl;
}

// Helper function to extract session token from request
function extractSessionToken(request: NextRequest): string | null {
  return request.headers.get('cookie')
    ?.split(';')
    .find(c => c.trim().startsWith('melody-session='))
    ?.split('=')[1] || null;
}

// Helper function to extract refresh token from request
function extractRefreshToken(request: NextRequest): string | null {
  return request.headers.get('cookie')
    ?.split(';')
    .find(c => c.trim().startsWith('melody-refresh='))
    ?.split('=')[1] || null;
}

// Helper function to create JSON response
function jsonResponse(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// Helper function to create unauthorized response
function unauthorizedResponse(message = 'Not authenticated') {
  return jsonResponse({ error: message }, 401);
}

// Helper function to create forbidden response
function forbiddenResponse(message = 'Forbidden') {
  return jsonResponse({ error: message }, 403);
}

// GET /api/auth/melody/session - Get current session
export async function GET(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const sessionToken = extractSessionToken(request);
    
    if (!sessionToken) {
      return jsonResponse({ session: null, authenticated: false });
    }

    // Validate session with Melody server
    const sessionResponse = await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Cookie': `melody-session=${sessionToken}`,
      },
    });

    if (!sessionResponse.ok) {
      // Session is invalid, clear cookie and return null session
      const response = jsonResponse({ session: null, authenticated: false });
      response.cookies.set('melody-session', '', {
        httpOnly: true,
        secure: authConfig.melody.sessionStrategy === 'jwt',
        expires: new Date(0),
        sameSite: 'lax',
        path: '/',
      });
      
      return response;
    }

    const sessionData = await sessionResponse.json();
    
    // Return session data with additional metadata
    return jsonResponse({
      session: {
        ...sessionData,
        provider: 'melody',
        authenticated: true,
      },
      authenticated: true,
    });
  } catch (error) {
    console.error('Melody session GET error:', error);
    return jsonResponse({ session: null, authenticated: false }, 500);
  }
}

// POST /api/auth/melody/session - Refresh session
export async function POST(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { refreshToken } = sessionRefreshSchema.parse(body);

    const currentRefreshToken = refreshToken || extractRefreshToken(request);
    
    if (!currentRefreshToken) {
      return unauthorizedResponse('No refresh token provided');
    }

    // Refresh session with Melody server
    const refreshResponse = await fetch(`${authConfig.melody.serverUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refreshToken: currentRefreshToken,
      }),
    });

    const refreshData = await refreshResponse.json();

    if (!refreshResponse.ok) {
      return unauthorizedResponse(refreshData.error || 'Token refresh failed');
    }

    // Create response with new session token
    const response = jsonResponse({
      success: true,
      session: refreshData.session,
      authenticated: true,
    });

    // Set new session cookie
    if (refreshData.sessionToken) {
      response.cookies.set('melody-session', refreshData.sessionToken, {
        httpOnly: true,
        secure: authConfig.melody.sessionStrategy === 'jwt',
        maxAge: authConfig.melody.sessionMaxAge,
        sameSite: 'lax',
        path: '/',
      });
    }

    // Set new refresh token if provided
    if (refreshData.refreshToken) {
      response.cookies.set('melody-refresh', refreshData.refreshToken, {
        httpOnly: true,
        secure: authConfig.melody.sessionStrategy === 'jwt',
        maxAge: authConfig.melody.sessionMaxAge * 24,
        sameSite: 'lax',
        path: '/',
      });
    }

    return response;
  } catch (error) {
    console.error('Melody session POST error:', error);
    
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: 'Invalid refresh request', details: error.errors }, 400);
    }
    
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// PUT /api/auth/melody/session - Update session
export async function PUT(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const sessionToken = extractSessionToken(request);
    
    if (!sessionToken) {
      return unauthorizedResponse('Not authenticated');
    }

    const body = await request.json();
    const updateData = sessionUpdateSchema.parse(body);

    // Update session with Melody server
    const updateResponse = await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updateData),
    });

    const updateResult = await updateResponse.json();

    if (!updateResponse.ok) {
      return forbiddenResponse(updateResult.error || 'Session update failed');
    }

    return jsonResponse({
      success: true,
      session: updateResult.session,
    });
  } catch (error) {
    console.error('Melody session PUT error:', error);
    
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: 'Invalid update data', details: error.errors }, 400);
    }
    
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// DELETE /api/auth/melody/session - Invalidate session
export async function DELETE(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const sessionToken = extractSessionToken(request);
    const refreshToken = extractRefreshToken(request);

    // Invalidate session with Melody server
    if (sessionToken) {
      await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        },
      });
    }

    // Also invalidate refresh token if present
    if (refreshToken) {
      await fetch(`${authConfig.melody.serverUrl}/api/auth/refresh`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${refreshToken}`,
        },
      });
    }

    // Create response and clear all auth cookies
    const response = jsonResponse({ success: true });

    // Clear session cookie
    response.cookies.set('melody-session', '', {
      httpOnly: true,
      secure: authConfig.melody.sessionStrategy === 'jwt',
      expires: new Date(0),
      sameSite: 'lax',
      path: '/',
    });

    // Clear refresh cookie
    response.cookies.set('melody-refresh', '', {
      httpOnly: true,
      secure: authConfig.melody.sessionStrategy === 'jwt',
      expires: new Date(0),
      sameSite: 'lax',
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Melody session DELETE error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
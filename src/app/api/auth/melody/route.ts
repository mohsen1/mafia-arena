/**
 * Melody Auth Main Route
 * Handles primary authentication endpoints for Melody
 * Cloudflare Workers Compatible
 */

import { NextRequest, NextResponse } from 'next/server';
import { authConfig, authFeatureFlags } from '@/lib/auth/config';
import { z } from 'zod';

// Melody API validation schemas
const signInSchema = z.object({
  provider: z.enum(['google', 'github', 'credentials']),
  redirect: z.boolean().optional(),
  email: z.string().email().optional(),
  password: z.string().optional(),
});

const signOutSchema = z.object({
  redirect: z.boolean().optional(),
});

// Helper function to check if Melody is enabled
function isMelodyEnabled() {
  return authFeatureFlags.enableMelody && !!authConfig.melody.serverUrl;
}

// Helper function to create JSON response
function jsonResponse(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

// Helper function to create redirect response
function redirectResponse(url: string, status = 302) {
  return NextResponse.redirect(url, { status });
}

// GET /api/auth/melody - List available providers or redirect to auth server
export async function GET(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    switch (action) {
      case 'providers': {
        // Return available providers
        const providers = {
          google: {
            enabled: authConfig.providers.google.enabled,
            name: 'Google',
            url: `${authConfig.melody.serverUrl}/auth/signin/google`,
          },
          github: {
            enabled: authConfig.providers.github.enabled,
            name: 'GitHub',
            url: `${authConfig.melody.serverUrl}/auth/signin/github`,
          },
          credentials: {
            enabled: authConfig.providers.credentials.enabled,
            name: 'Email & Password',
            url: `${authConfig.melody.serverUrl}/auth/signin/credentials`,
          },
        };

        return jsonResponse({ providers });
      }

      case 'session': {
        // Get current session
        const sessionToken = request.headers.get('cookie')
          ?.split(';')
          .find(c => c.trim().startsWith('melody-session='))
          ?.split('=')[1];

        if (!sessionToken) {
          return jsonResponse({ session: null });
        }

        // Validate session with Melody server
        const sessionResponse = await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Cookie': `melody-session=${sessionToken}`,
          },
        });

        if (!sessionResponse.ok) {
          return jsonResponse({ session: null });
        }

        const session = await sessionResponse.json();
        return jsonResponse({ session });
      }

      case 'status': {
        // Return authentication status
        return jsonResponse({
          enabled: isMelodyEnabled(),
          serverUrl: authConfig.melody.serverUrl,
          providers: {
            google: authConfig.providers.google.enabled,
            github: authConfig.providers.github.enabled,
            credentials: authConfig.providers.credentials.enabled,
          },
          featureFlags: authFeatureFlags,
        });
      }

      default: {
        // Default: redirect to Melody auth server
        const redirectTo = searchParams.get('redirect') || '/auth/signin';
        const authServerUrl = `${authConfig.melody.serverUrl}/auth/signin?redirect=${encodeURIComponent(redirectTo)}`;
        
        return redirectResponse(authServerUrl);
      }
    }
  } catch (error) {
    console.error('Melody auth GET error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// POST /api/auth/melody - Handle authentication actions
export async function POST(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const body = await request.json();
    const { provider, redirect = true, email, password } = signInSchema.parse(body);

    switch (provider) {
      case 'google':
      case 'github': {
        // OAuth provider - redirect to auth server
        const authUrl = `${authConfig.melody.serverUrl}/auth/signin/${provider}?redirect=${encodeURIComponent(
          authConfig.melody.serverUrl
        )}/auth/callback`;
        
        return redirect ? redirectResponse(authUrl) : jsonResponse({ url: authUrl });
      }

      case 'credentials': {
        // Credentials provider - handle login
        if (!email || !password) {
          return jsonResponse({ error: 'Email and password required' }, 400);
        }

        // Forward credentials to Melody server for validation
        const loginResponse = await fetch(`${authConfig.melody.serverUrl}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
            redirect: redirect ? authConfig.melody.serverUrl : undefined,
          }),
        });

        const loginData = await loginResponse.json();

        if (!loginResponse.ok) {
          return jsonResponse({ error: loginData.error || 'Login failed' }, loginResponse.status);
        }

        // Set session cookie if login successful
        const response = jsonResponse({ success: true, user: loginData.user });
        
        if (loginData.sessionToken) {
          response.cookies.set('melody-session', loginData.sessionToken, {
            httpOnly: true,
            secure: authConfig.melody.sessionStrategy === 'jwt',
            maxAge: authConfig.melody.sessionMaxAge,
            sameSite: 'lax',
          });
        }

        return response;
      }

      default: {
        return jsonResponse({ error: 'Unsupported provider' }, 400);
      }
    }
  } catch (error) {
    console.error('Melody auth POST error:', error);
    
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: 'Invalid request data', details: error.errors }, 400);
    }
    
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// PUT /api/auth/melody - Update session or account
export async function PUT(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const body = await request.json();
    
    // Get current session
    const sessionToken = request.headers.get('cookie')
      ?.split(';')
      .find(c => c.trim().startsWith('melody-session='))
      ?.split('=')[1];

    if (!sessionToken) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    // Update session with Melody server
    const updateResponse = await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const updateData = await updateResponse.json();
    
    if (!updateResponse.ok) {
      return jsonResponse({ error: updateData.error || 'Update failed' }, updateResponse.status);
    }

    return jsonResponse({ success: true, user: updateData.user });
  } catch (error) {
    console.error('Melody auth PUT error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// DELETE /api/auth/melody - Sign out
export async function DELETE(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { redirect = true } = signOutSchema.parse(body);

    // Get current session
    const sessionToken = request.headers.get('cookie')
      ?.split(';')
      ?.find(c => c.trim().startsWith('melody-session='))
      ?.split('=')[1];

    // Clear session on Melody server
    if (sessionToken) {
      await fetch(`${authConfig.melody.serverUrl}/auth/signout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
        },
      });
    }

    // Create response
    const response = jsonResponse({ success: true });
    
    // Clear session cookie
    response.cookies.set('melody-session', '', {
      httpOnly: true,
      secure: authConfig.melody.sessionStrategy === 'jwt',
      expires: new Date(0),
      sameSite: 'lax',
    });

    return response;
  } catch (error) {
    console.error('Melody auth DELETE error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
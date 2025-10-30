/**
 * Melody Auth Callback Route
 * Handles OAuth callbacks from providers (Google, GitHub)
 * Cloudflare Workers Compatible
 */

import { NextRequest, NextResponse } from 'next/server';
import { authConfig, authFeatureFlags } from '@/lib/auth/config';
import { z } from 'zod';

// Callback validation schema
const callbackSchema = z.object({
  provider: z.enum(['google', 'github']),
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
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

// GET /api/auth/melody/callback - Handle OAuth callback
export async function GET(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const { searchParams } = new URL(request.url);
    const callbackData = {
      provider: searchParams.get('provider') || '',
      code: searchParams.get('code') || undefined,
      state: searchParams.get('state') || undefined,
      error: searchParams.get('error') || undefined,
      error_description: searchParams.get('error_description') || undefined,
    };

    const { provider, code, state, error, error_description } = callbackSchema.parse(callbackData);

    // Handle OAuth errors
    if (error) {
      console.error(`OAuth error from ${provider}:`, error, error_description);
      
      // Redirect to error page with error details
      const errorUrl = new URL('/auth/error', authConfig.melody.serverUrl);
      errorUrl.searchParams.set('error', error);
      if (error_description) {
        errorUrl.searchParams.set('error_description', error_description);
      }
      errorUrl.searchParams.set('provider', provider);
      
      return redirectResponse(errorUrl.toString());
    }

    // Validate required OAuth data
    if (!code) {
      const errorUrl = new URL('/auth/error', authConfig.melody.serverUrl);
      errorUrl.searchParams.set('error', 'missing_code');
      errorUrl.searchParams.set('provider', provider);
      
      return redirectResponse(errorUrl.toString());
    }

    try {
      // Exchange authorization code for tokens with Melody auth server
      const tokenResponse = await fetch(`${authConfig.melody.serverUrl}/auth/callback/${provider}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          state,
          redirect_uri: authConfig.providers[provider as 'google' | 'github'].redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error(`Token exchange failed for ${provider}:`, tokenData);
        
        const errorUrl = new URL('/auth/error', authConfig.melody.serverUrl);
        errorUrl.searchParams.set('error', 'token_exchange_failed');
        errorUrl.searchParams.set('provider', provider);
        errorUrl.searchParams.set('error_description', tokenData.error || 'Unknown error');
        
        return redirectResponse(errorUrl.toString());
      }

      // Create response with session cookie
      const response = NextResponse.redirect(authConfig.melody.serverUrl);
      
      // Set session cookie
      if (tokenData.sessionToken) {
        response.cookies.set('melody-session', tokenData.sessionToken, {
          httpOnly: true,
          secure: authConfig.melody.sessionStrategy === 'jwt',
          maxAge: authConfig.melody.sessionMaxAge,
          sameSite: 'lax',
          path: '/',
        });
      }

      // Set any additional tokens/cookies from Melody server
      if (tokenData.refreshToken) {
        response.cookies.set('melody-refresh', tokenData.refreshToken, {
          httpOnly: true,
          secure: authConfig.melody.sessionStrategy === 'jwt',
          maxAge: authConfig.melody.sessionMaxAge * 24, // 24x longer than session
          sameSite: 'lax',
          path: '/',
        });
      }

      // Redirect to the intended destination or home page
      const redirectTo = searchParams.get('redirect') || '/';
      return NextResponse.redirect(redirectTo);
      
    } catch (tokenError) {
      console.error(`Token exchange error for ${provider}:`, tokenError);
      
      const errorUrl = new URL('/auth/error', authConfig.melody.serverUrl);
      errorUrl.searchParams.set('error', 'token_exchange_error');
      errorUrl.searchParams.set('provider', provider);
      errorUrl.searchParams.set('error_description', 'Failed to exchange authorization code');
      
      return redirectResponse(errorUrl.toString());
    }
  } catch (error) {
    console.error('Melody callback GET error:', error);
    
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: 'Invalid callback parameters', details: error.errors }, 400);
    }
    
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}

// POST /api/auth/melody/callback - Handle callback from mobile apps or API clients
export async function POST(request: NextRequest) {
  if (!isMelodyEnabled()) {
    return jsonResponse({ error: 'Melody authentication not enabled' }, 503);
  }

  try {
    const body = await request.json();
    const { provider, code, state } = callbackSchema.parse(body);

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(`${authConfig.melody.serverUrl}/auth/callback/${provider}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        state,
        redirect_uri: authConfig.providers[provider as 'google' | 'github'].redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return jsonResponse({ 
        error: 'Token exchange failed', 
        details: tokenData 
      }, tokenResponse.status);
    }

    // Return token data for API clients
    return jsonResponse({
      success: true,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresIn: tokenData.expiresIn,
      user: tokenData.user,
      provider,
    });
  } catch (error) {
    console.error('Melody callback POST error:', error);
    
    if (error instanceof z.ZodError) {
      return jsonResponse({ error: 'Invalid callback data', details: error.errors }, 400);
    }
    
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
}
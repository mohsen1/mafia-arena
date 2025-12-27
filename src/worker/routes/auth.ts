/**
 * Google OAuth authentication routes.
 * 
 * Flow:
 * 1. GET /api/auth/google - Redirects to Google OAuth consent screen
 * 2. GET /api/auth/callback - Handles OAuth callback, creates session
 * 3. GET /api/auth/me - Returns current user info
 * 4. POST /api/auth/logout - Clears session
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';

const auth = new Hono<{ Bindings: Env }>();

/** Session expiry time (7 days) */
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Cookie name for session token */
const SESSION_COOKIE = 'mafia_session';

/**
 * Session data stored in KV.
 */
export interface SessionData {
  email: string;
  name: string;
  picture: string | undefined;
  isAdmin: boolean;
  createdAt: number;
  expiresAt: number;
}

/**
 * Google token response.
 */
interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Google user info response.
 */
interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name?: string;
  picture?: string;
}

/**
 * Generate a random session ID.
 */
function generateSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get the base URL for OAuth callbacks.
 */
function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  // In production, use the origin. In development, might need to override.
  return `${url.protocol}//${url.host}`;
}

/**
 * Parse cookies from request headers.
 */
function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies: Record<string, string> = {};
  
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name) {
      cookies[name] = valueParts.join('=');
    }
  }
  
  return cookies;
}

/**
 * Create a session cookie header.
 */
function createSessionCookie(sessionId: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Create a cookie to clear the session.
 */
function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/**
 * GET /api/auth/google - Initiate Google OAuth flow.
 * Redirects user to Google consent screen.
 */
auth.get('/google', async (c) => {
  const { GOOGLE_CLIENT_ID } = c.env;
  
  if (!GOOGLE_CLIENT_ID) {
    return c.json({ error: 'Google OAuth not configured' }, 500);
  }
  
  const baseUrl = getBaseUrl(c.req.raw);
  const redirectUri = `${baseUrl}/api/auth/callback`;
  
  // Optional: Get redirect URL from query param to return user after auth
  const returnTo = c.req.query('redirect') || '/admin';
  
  // Generate state parameter to prevent CSRF
  const state = btoa(JSON.stringify({ returnTo, nonce: generateSessionId().slice(0, 16) }));
  
  // Store state temporarily in KV for validation (5 min TTL)
  await c.env.RATE_LIMIT.put(`oauth_state:${state}`, 'valid', { expirationTtl: 300 });
  
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  
  return c.redirect(authUrl);
});

/**
 * GET /api/auth/callback - Handle Google OAuth callback.
 * Exchanges code for tokens, creates session.
 */
auth.get('/callback', async (c) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAIL, RATE_LIMIT } = c.env;
  
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return c.json({ error: 'Google OAuth not configured' }, 500);
  }
  
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  
  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return c.redirect('/admin/login?error=oauth_denied');
  }
  
  if (!code || !state) {
    return c.redirect('/admin/login?error=invalid_callback');
  }
  
  // Validate state to prevent CSRF
  const storedState = await RATE_LIMIT.get(`oauth_state:${state}`);
  if (!storedState) {
    console.error('Invalid or expired OAuth state');
    return c.redirect('/admin/login?error=invalid_state');
  }
  
  // Clean up state
  await RATE_LIMIT.delete(`oauth_state:${state}`);
  
  // Parse state to get return URL
  let returnTo = '/admin';
  try {
    const stateData = JSON.parse(atob(state));
    returnTo = stateData.returnTo || '/admin';
  } catch {
    // Ignore parse errors, use default
  }
  
  const baseUrl = getBaseUrl(c.req.raw);
  const redirectUri = `${baseUrl}/api/auth/callback`;
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return c.redirect('/admin/login?error=token_exchange_failed');
    }
    
    const tokens = await tokenResponse.json() as GoogleTokenResponse;
    
    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    
    if (!userInfoResponse.ok) {
      console.error('Failed to get user info');
      return c.redirect('/admin/login?error=user_info_failed');
    }
    
    const userInfo = await userInfoResponse.json() as GoogleUserInfo;
    
    if (!userInfo.verified_email) {
      return c.redirect('/admin/login?error=email_not_verified');
    }
    
    // Check if user is admin
    const isAdmin = ADMIN_EMAIL 
      ? userInfo.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      : false;
    
    // Create session
    const sessionId = generateSessionId();
    const now = Date.now();
    const sessionData: SessionData = {
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      isAdmin,
      createdAt: now,
      expiresAt: now + (SESSION_TTL_SECONDS * 1000),
    };
    
    // Store session in KV
    await RATE_LIMIT.put(
      `session:${sessionId}`,
      JSON.stringify(sessionData),
      { expirationTtl: SESSION_TTL_SECONDS }
    );
    
    console.log(`Created session for ${userInfo.email} (admin: ${isAdmin})`);
    
    // Set cookie and redirect
    const cookie = createSessionCookie(sessionId, SESSION_TTL_SECONDS);
    
    // Redirect to frontend with session info in URL for client-side handling
    const redirectUrl = new URL(returnTo, baseUrl);
    redirectUrl.searchParams.set('auth', 'success');
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl.toString(),
        'Set-Cookie': cookie,
      },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.redirect('/admin/login?error=internal_error');
  }
});

/**
 * GET /api/auth/me - Get current user info.
 * Returns user data if authenticated, 401 otherwise.
 */
auth.get('/me', async (c) => {
  const cookies = parseCookies(c.req.raw);
  const sessionId = cookies[SESSION_COOKIE];
  
  if (!sessionId) {
    return c.json({ authenticated: false }, 401);
  }
  
  const sessionJson = await c.env.RATE_LIMIT.get(`session:${sessionId}`);
  
  if (!sessionJson) {
    return c.json({ authenticated: false }, 401);
  }
  
  try {
    const session = JSON.parse(sessionJson) as SessionData;
    
    // Check if session has expired
    if (Date.now() > session.expiresAt) {
      await c.env.RATE_LIMIT.delete(`session:${sessionId}`);
      return c.json({ authenticated: false }, 401);
    }
    
    return c.json({
      authenticated: true,
      user: {
        email: session.email,
        name: session.name,
        picture: session.picture,
        isAdmin: session.isAdmin,
      },
    });
  } catch {
    return c.json({ authenticated: false }, 401);
  }
});

/**
 * POST /api/auth/logout - Clear session.
 */
auth.post('/logout', async (c) => {
  const cookies = parseCookies(c.req.raw);
  const sessionId = cookies[SESSION_COOKIE];
  
  if (sessionId) {
    await c.env.RATE_LIMIT.delete(`session:${sessionId}`);
  }
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
});

/**
 * Helper function to get session from request.
 * Used by middleware to validate authentication.
 */
export async function getSession(request: Request, env: Env): Promise<SessionData | null> {
  const cookies = parseCookies(request);
  const sessionId = cookies[SESSION_COOKIE];
  
  if (!sessionId) {
    return null;
  }
  
  const sessionJson = await env.RATE_LIMIT.get(`session:${sessionId}`);
  
  if (!sessionJson) {
    return null;
  }
  
  try {
    const session = JSON.parse(sessionJson) as SessionData;
    
    if (Date.now() > session.expiresAt) {
      await env.RATE_LIMIT.delete(`session:${sessionId}`);
      return null;
    }
    
    return session;
  } catch {
    return null;
  }
}

/**
 * Check if a user is admin based on session.
 */
export async function isAdminSession(request: Request, env: Env): Promise<boolean> {
  const session = await getSession(request, env);
  return session?.isAdmin ?? false;
}

export default auth;


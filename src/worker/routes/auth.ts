/**
 * Google OAuth authentication routes.
 * 
 * Flow:
 * 1. GET /api/auth/google - Redirects to Google OAuth consent screen
 * 2. GET /api/auth/callback - Handles OAuth callback, creates session, syncs user to D1
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
  /** User ID from Google OAuth (stable identifier) */
  userId: string;
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
 * Get the OAuth callback URL.
 * Uses OAUTH_CALLBACK_URL env var if set (needed when wrangler rewrites the host),
 * otherwise derives it from the request URL.
 */
function getOAuthCallbackUrl(env: Env, request: Request): string {
  // Use explicit callback URL if configured (needed in dev due to wrangler host rewriting)
  if (env.OAUTH_CALLBACK_URL) {
    return env.OAUTH_CALLBACK_URL;
  }
  
  // Fall back to deriving from request URL
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}/api/auth/callback`;
}

/**
 * Get the frontend URL for redirects.
 * Uses FRONTEND_URL env var if set, otherwise assumes same-origin (production).
 */
function getFrontendUrl(env: Env, request: Request): string {
  // Use explicit FRONTEND_URL if configured
  if (env.FRONTEND_URL) {
    return env.FRONTEND_URL.replace(/\/$/, ''); // Remove trailing slash
  }
  
  // In production without FRONTEND_URL, assume frontend is served from same origin
  // This handles the case where a reverse proxy serves both frontend and API
  const url = new URL(request.url);
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
 * Check if we're in a secure context (HTTPS or production).
 */
function isSecureContext(request: Request): boolean {
  const url = new URL(request.url);
  // In production, always use Secure flag
  // In development (localhost), don't use Secure flag
  return url.protocol === 'https:' || (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1'));
}

/**
 * Create a session cookie header.
 */
function createSessionCookie(sessionId: string, maxAge: number, request: Request): string {
  const secureFlag = isSecureContext(request) ? 'Secure;' : '';
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; ${secureFlag} SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Create a cookie to clear the session.
 */
function clearSessionCookie(request: Request): string {
  const secureFlag = isSecureContext(request) ? 'Secure;' : '';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; ${secureFlag} SameSite=Lax; Max-Age=0`;
}

/**
 * Validate that a return path is safe (relative, no open redirect).
 */
function isValidReturnPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  // Must start with / (relative path)
  if (!path.startsWith('/')) return false;
  // Must NOT start with // (protocol-relative URL)
  if (path.startsWith('//')) return false;
  // Must NOT contain backslash (obfuscation attempt)
  if (path.includes('\\')) return false;
  // Must NOT contain newlines (header injection)
  if (path.includes('\n') || path.includes('\r')) return false;
  return true;
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
  
  const redirectUri = getOAuthCallbackUrl(c.env, c.req.raw);
  
  // Log for debugging redirect_uri_mismatch issues
  console.log('OAuth initiation - redirect_uri:', redirectUri);
  
  // Get redirect URL from query param, validate it's a safe relative path
  const requestedRedirect = c.req.query('redirect') || '/admin';
  const returnTo = isValidReturnPath(requestedRedirect) ? requestedRedirect : '/admin';
  
  // Generate state parameter to prevent CSRF
  // Use encodeURIComponent for Unicode safety in btoa
  const stateData = JSON.stringify({ returnTo, nonce: generateSessionId().slice(0, 16) });
  const state = btoa(unescape(encodeURIComponent(stateData)));
  
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
  
  // Get frontend URL for redirects (may be different port in development)
  const frontendUrl = getFrontendUrl(c.env, c.req.raw);
  
  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return c.redirect(`${frontendUrl}/admin/login?error=oauth_denied`);
  }
  
  if (!code || !state) {
    return c.redirect(`${frontendUrl}/admin/login?error=invalid_callback`);
  }
  
  // Validate state to prevent CSRF
  const storedState = await RATE_LIMIT.get(`oauth_state:${state}`);
  if (!storedState) {
    console.error('Invalid or expired OAuth state');
    return c.redirect(`${frontendUrl}/admin/login?error=invalid_state`);
  }
  
  // Clean up state
  await RATE_LIMIT.delete(`oauth_state:${state}`);
  
  // Parse state to get return URL (with validation to prevent open redirect)
  let returnTo = '/admin';
  try {
    const stateData = JSON.parse(decodeURIComponent(escape(atob(state))));
    const requestedPath = stateData.returnTo;
    
    // Validate: Must be a safe relative path
    if (isValidReturnPath(requestedPath)) {
      returnTo = requestedPath;
    }
  } catch {
    // Ignore parse errors, use default
  }
  
  // Use same callback URL for the token exchange (must match what was sent to Google)
  const redirectUri = getOAuthCallbackUrl(c.env, c.req.raw);
  
  // Log for debugging redirect_uri_mismatch issues
  console.log('OAuth callback - redirect_uri for token exchange:', redirectUri);
  
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
      console.error('Used redirect_uri:', redirectUri);
      return c.redirect(`${frontendUrl}/admin/login?error=token_exchange_failed`);
    }
    
    const tokens = await tokenResponse.json() as GoogleTokenResponse;
    
    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    
    if (!userInfoResponse.ok) {
      console.error('Failed to get user info');
      return c.redirect(`${frontendUrl}/admin/login?error=user_info_failed`);
    }
    
    const userInfo = await userInfoResponse.json() as GoogleUserInfo;
    
    if (!userInfo.verified_email) {
      return c.redirect(`${frontendUrl}/admin/login?error=email_not_verified`);
    }
    
    // Check if user is admin
    const isAdmin = ADMIN_EMAIL 
      ? userInfo.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
      : false;
    
    // Sync user to D1 database (upsert)
    try {
      await c.env.DB.prepare(
        `INSERT INTO users (id, email, name, picture, is_admin, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET
           name = excluded.name,
           picture = excluded.picture,
           is_admin = excluded.is_admin,
           updated_at = excluded.updated_at`
      ).bind(
        userInfo.id,
        userInfo.email,
        userInfo.name,
        userInfo.picture ?? null,
        isAdmin ? 1 : 0,
        Date.now(),
        Date.now()
      ).run();
      console.log(`Synced user to D1: ${userInfo.email} (id: ${userInfo.id}, admin: ${isAdmin})`);
    } catch (dbError) {
      // Log but don't fail - user can still authenticate
      console.error('Failed to sync user to D1:', dbError);
    }
    
    // Create session
    const sessionId = generateSessionId();
    const now = Date.now();
    const sessionData: SessionData = {
      userId: userInfo.id,
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
    const cookie = createSessionCookie(sessionId, SESSION_TTL_SECONDS, c.req.raw);
    
    // Redirect to frontend with session info in URL for client-side handling
    const redirectUrl = new URL(returnTo, frontendUrl);
    redirectUrl.searchParams.set('auth', 'success');
    
    console.log(`OAuth success - redirecting to: ${redirectUrl.toString()}`);
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl.toString(),
        'Set-Cookie': cookie,
      },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.redirect(`${frontendUrl}/admin/login?error=internal_error`);
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
        id: session.userId,
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
      'Set-Cookie': clearSessionCookie(c.req.raw),
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


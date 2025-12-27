/**
 * Admin authentication middleware.
 * 
 * Supports two authentication methods:
 * 1. Google OAuth sessions (preferred) - checks session cookie
 * 2. Basic Auth (legacy) - username/password in Authorization header
 * 
 * During migration, both methods are supported. Once fully migrated,
 * Basic Auth can be removed.
 */

import type { Context, Next } from 'hono';
import type { Env } from '../types.js';
import { getSession } from '../routes/auth.js';

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  
  // XOR all bytes and accumulate - constant time regardless of content
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    // TypeScript: Array bounds already checked via length comparison
    result |= (aBytes[i] as number) ^ (bBytes[i] as number);
  }
  
  return result === 0;
}

/**
 * Verify Basic Auth credentials for admin routes (legacy).
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifyBasicAuth(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');

    // Ensure env vars are set
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
      return false;
    }
    
    // Use timing-safe comparison to prevent timing attacks
    const usernameMatch = timingSafeEqual(username || '', env.ADMIN_USERNAME);
    const passwordMatch = timingSafeEqual(password || '', env.ADMIN_PASSWORD);
    
    return usernameMatch && passwordMatch;
  } catch {
    return false;
  }
}

/**
 * Middleware that requires admin authentication.
 * 
 * Checks in order:
 * 1. Session cookie (Google OAuth) - if valid admin session, allow
 * 2. Basic Auth header (legacy) - if valid credentials, allow
 * 3. Otherwise, reject with 401
 */
export async function adminAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  // First, try session-based auth (Google OAuth)
  const session = await getSession(c.req.raw, c.env);
  if (session?.isAdmin) {
    return next();
  }

  // Fallback to Basic Auth (legacy)
  if (verifyBasicAuth(c.req.raw, c.env)) {
    return next();
  }

  // Neither auth method succeeded
  // Return appropriate error based on request type
  const acceptHeader = c.req.header('Accept') || '';
  const isApiRequest = acceptHeader.includes('application/json') || 
                       c.req.header('Authorization')?.startsWith('Basic ');

  if (isApiRequest) {
    // API request - return JSON error with WWW-Authenticate for Basic Auth clients
    return c.json(
      { 
        error: 'Authentication required',
        message: 'Please authenticate with Google OAuth or Basic Auth',
      },
      { 
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Mafia Arena Admin"',
        },
      }
    );
  }

  // Browser request - redirect to login page
  const returnTo = new URL(c.req.url).pathname;
  return c.redirect(`/admin/login?redirect=${encodeURIComponent(returnTo)}`);
}

/**
 * Middleware that requires authenticated user (not necessarily admin).
 * Useful for future per-user API key management.
 */
export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const session = await getSession(c.req.raw, c.env);
  
  if (!session) {
    const acceptHeader = c.req.header('Accept') || '';
    const isApiRequest = acceptHeader.includes('application/json');

    if (isApiRequest) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const returnTo = new URL(c.req.url).pathname;
    return c.redirect(`/admin/login?redirect=${encodeURIComponent(returnTo)}`);
  }

  return next();
}

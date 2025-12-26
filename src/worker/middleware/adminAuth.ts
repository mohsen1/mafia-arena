/**
 * Admin authentication middleware using Basic Auth.
 */

import type { Context, Next } from 'hono';
import type { Env } from '../types.js';

/**
 * Verify Basic Auth credentials for admin routes.
 */
function verifyAdminAuth(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');

    return username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

/**
 * Middleware that requires admin authentication.
 */
export async function adminAuthMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  if (!verifyAdminAuth(c.req.raw, c.env)) {
    return c.text('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Mafia Arena Admin"',
      },
    });
  }

  return next();
}




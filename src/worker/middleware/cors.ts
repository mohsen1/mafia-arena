/**
 * CORS middleware for Mafia Arena API.
 */

import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';

const honoCorsMw = cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Upgrade', 'Connection'],
});

/**
 * CORS middleware that skips WebSocket upgrade requests.
 * WebSocket connections don't use CORS - the browser handles the handshake differently.
 */
export async function corsMiddleware(c: Context, next: Next) {
  // Skip CORS for WebSocket upgrades
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader?.toLowerCase() === 'websocket') {
    return next();
  }
  
  return honoCorsMw(c, next);
}


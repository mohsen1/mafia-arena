/**
 * CORS middleware for Mafia Arena API.
 */

import type { Context, Next } from 'hono';
import { cors } from 'hono/cors';

/**
 * Allowed origins for CORS.
 * Must be specific origins (not '*') to allow credentials.
 */
const ALLOWED_ORIGINS = [
  'http://localhost:4321',   // Frontend dev server
  'http://localhost:4322',   // Alternate frontend dev port
  'http://localhost:8787',   // Worker dev (same-origin)
  'https://mafia-arena.com', // Production frontend
  'https://www.mafia-arena.com',
];

const honoCorsMw = cors({
  origin: (origin) => {
    // Allow requests with no origin (same-origin, curl, etc.)
    if (!origin) return '*';
    // Check if origin is allowed
    if (ALLOWED_ORIGINS.includes(origin)) {
      return origin;
    }
    // Fallback for other origins (no credentials)
    return '*';
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Upgrade', 'Connection'],
  credentials: true, // Required for cookies to work cross-origin
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


/**
 * External Worker management routes.
 *
 * Allows authenticated users to register and manage their external Workers
 * for API key isolation. External Workers hold user API keys and proxy
 * AI requests, providing cryptographic isolation from the main system.
 *
 * Routes:
 * - GET /api/auth/external-workers - List user's external workers
 * - POST /api/auth/external-workers - Register a new external worker
 * - POST /api/auth/external-workers/:id/verify - Re-verify worker health
 * - DELETE /api/auth/external-workers/:id - Remove an external worker
 */

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { Env } from '../types.js';
import { getSession, type SessionData } from './auth.js';
import { Errors } from '../utils/errors.js';
import { ExternalWorkerProvider } from '../ai/providers/ExternalWorkerProvider.js';
import {
  createVerificationService,
  verifyChallengeResponse,
} from '../ai/verification/index.js';

/** Extended bindings with session data */
interface ExternalWorkersBindings {
  Bindings: Env;
  Variables: {
    session: SessionData;
  };
}

const externalWorkers = new Hono<ExternalWorkersBindings>();

/**
 * Allowed domains for external workers (SSRF prevention).
 * Only Cloudflare-hosted workers are allowed for verification.
 */
const ALLOWED_DOMAINS = ['.workers.dev', '.pages.dev', '.cloudflare.dev'] as const;

/**
 * Check whether a hostname is allowed for use as an external worker.
 *
 * This enforces that the hostname either exactly matches the apex domain
 * (e.g. "workers.dev") or ends with one of the allowed suffixes
 * (e.g. "*.workers.dev"), preventing matches on hostnames like
 * "badsite.com.workers.dev.malicious.com".
 */
function isAllowedExternalWorkerHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  return ALLOWED_DOMAINS.some((domain) => {
    const suffix = domain.toLowerCase(); // e.g. ".workers.dev"
    const apex = suffix.slice(1); // "workers.dev"

    if (normalized === apex) {
      return true;
    }

    return normalized.endsWith(suffix);
  });
}

/**
 * Blocked URL patterns (RFC1918, localhost, etc.)
 */
const BLOCKED_PATTERNS = [
  /^https?:\/\/localhost/i,
  /^https?:\/\/127\./,
  /^https?:\/\/0\./,
  /^https?:\/\/192\.168\./,
  /^https?:\/\/10\./,
  /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^https?:\/\/\[::1\]/,
  /^https?:\/\/\[::\]/,
];

/**
 * External worker response for API.
 */
interface ExternalWorkerResponse {
  id: string;
  name: string;
  workerUrl: string;
  authTokenFingerprint: string;
  status: 'pending' | 'verified' | 'failed';
  supportedProviders: string[];
  lastHealthCheck: number | null;
  lastError: string | null;
  createdAt: number;
}

/**
 * Middleware to ensure user is authenticated.
 */
async function requireAuth(c: Context<ExternalWorkersBindings>, next: Next) {
  const session = await getSession(c.req.raw, c.env);
  if (!session) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  c.set('session', session);
  return next();
}

// Apply authentication middleware to all routes
externalWorkers.use('*', requireAuth);

/**
 * Validate that a URL is allowed for external workers.
 * Enforces HTTPS and Cloudflare domains only.
 */
function validateWorkerUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Errors.BadRequest('Invalid worker URL format');
  }

  // Enforce HTTPS
  if (parsed.protocol !== 'https:') {
    throw Errors.BadRequest('Worker URL must use HTTPS');
  }

  // Block credentials in URL
  if (parsed.username || parsed.password) {
    throw Errors.BadRequest('Worker URL must not contain credentials');
  }

  // Block non-standard ports
  if (parsed.port && parsed.port !== '443') {
    throw Errors.BadRequest('Worker URL must use standard HTTPS port');
  }

  // Block internal/private IPs (SSRF protection)
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(url)) {
      throw Errors.BadRequest('Internal/private addresses are not allowed');
    }
  }

  // Verify domain is in allowlist using secure hostname check
  if (!isAllowedExternalWorkerHostname(parsed.hostname)) {
    throw Errors.BadRequest(
      `Worker must be hosted on Cloudflare (${ALLOWED_DOMAINS.join(', ')})`
    );
  }

  // Normalize URL - use origin + pathname only (exclude query params and hash)
  return parsed;
}

/**
 * Hash a token using SHA-256.
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a fingerprint for display (last 4 characters).
 */
function createTokenFingerprint(token: string): string {
  if (token.length < 4) return '****';
  return `****${token.slice(-4)}`;
}

/**
 * Verify worker health by calling its /health and /v1/models endpoints.
 */
async function verifyWorkerHealth(
  workerUrl: string,
  authToken: string
): Promise<{
  status: 'verified' | 'failed';
  providers: string[];
  error?: string | undefined;
  version?: string | undefined;
}> {
  const provider = new ExternalWorkerProvider({
    workerUrl,
    authToken,
    modelId: 'health-check',
  });

  const result = await provider.healthCheck();

  if (result.healthy) {
    return {
      status: 'verified',
      providers: result.providers ?? [],
      version: result.version,
    };
  }

  return {
    status: 'failed',
    providers: [],
    error: result.error ?? 'Health check failed',
  };
}

/**
 * GET /api/auth/external-workers - List user's external workers.
 */
externalWorkers.get('/', async (c) => {
  const session = c.get('session');
  const userId = session.userId;

  try {
    const result = await c.env.DB.prepare(
      `SELECT id, name, worker_url, auth_token_fingerprint, status,
              supported_providers, last_health_check, last_error, created_at
       FROM user_external_workers
       WHERE user_id = ?
       ORDER BY created_at DESC`
    ).bind(userId).all<{
      id: string;
      name: string;
      worker_url: string;
      auth_token_fingerprint: string;
      status: 'pending' | 'verified' | 'failed';
      supported_providers: string | null;
      last_health_check: number | null;
      last_error: string | null;
      created_at: number;
    }>();

    const workers: ExternalWorkerResponse[] = (result.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      workerUrl: row.worker_url,
      authTokenFingerprint: row.auth_token_fingerprint,
      status: row.status,
      supportedProviders: row.supported_providers
        ? JSON.parse(row.supported_providers)
        : [],
      lastHealthCheck: row.last_health_check,
      lastError: row.last_error,
      createdAt: row.created_at,
    }));

    return c.json({ workers });
  } catch (error) {
    console.error('Failed to fetch external workers:', error);
    throw Errors.Internal('Failed to fetch external workers');
  }
});

/**
 * POST /api/auth/external-workers - Register a new external worker.
 *
 * Body:
 * - name: Optional friendly name for the worker
 * - workerUrl: The HTTPS URL of the external worker
 * - authToken: The authentication token for the worker (32+ chars)
 */
externalWorkers.post('/', async (c) => {
  const session = c.get('session');
  const userId = session.userId;

  interface RegisterRequest {
    name?: string;
    workerUrl: string;
    authToken: string;
  }

  let body: RegisterRequest;
  try {
    body = await c.req.json<RegisterRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  const { workerUrl, authToken, name = 'My Worker' } = body;

  // Validate URL
  const validatedUrl = validateWorkerUrl(workerUrl);
  const normalizedUrl = validatedUrl.origin + validatedUrl.pathname.replace(/\/$/, '');

  // Validate auth token
  if (!authToken || authToken.length < 32) {
    throw Errors.BadRequest('Auth token must be at least 32 characters');
  }

  // Validate name
  if (name.length > 100) {
    throw Errors.BadRequest('Worker name must be 100 characters or less');
  }

  // Hash the auth token for storage
  const authTokenHash = await hashToken(authToken);
  const authTokenFingerprint = createTokenFingerprint(authToken);

  // Verify worker is reachable and healthy
  const healthResult = await verifyWorkerHealth(normalizedUrl, authToken);

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    // Upsert - update if URL already exists for this user
    await c.env.DB.prepare(
      `INSERT INTO user_external_workers
        (id, user_id, name, worker_url, auth_token_hash, auth_token_fingerprint,
         status, supported_providers, last_health_check, last_error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, worker_url) DO UPDATE SET
        name = excluded.name,
        auth_token_hash = excluded.auth_token_hash,
        auth_token_fingerprint = excluded.auth_token_fingerprint,
        status = excluded.status,
        supported_providers = excluded.supported_providers,
        last_health_check = excluded.last_health_check,
        last_error = excluded.last_error,
        updated_at = excluded.created_at`
    )
      .bind(
        id,
        userId,
        name,
        normalizedUrl,
        authTokenHash,
        authTokenFingerprint,
        healthResult.status,
        healthResult.providers.length > 0
          ? JSON.stringify(healthResult.providers)
          : null,
        now,
        healthResult.error ?? null,
        now
      )
      .run();

    return c.json({
      success: true,
      worker: {
        id,
        name,
        workerUrl: normalizedUrl,
        authTokenFingerprint,
        status: healthResult.status,
        supportedProviders: healthResult.providers,
        version: healthResult.version,
        message:
          healthResult.status === 'verified'
            ? 'Worker connected successfully!'
            : `Worker registered but health check failed: ${healthResult.error}`,
      },
    });
  } catch (error) {
    console.error('Failed to register external worker:', error);
    throw Errors.Internal('Failed to register external worker');
  }
});

/**
 * POST /api/auth/external-workers/:id/verify - Re-verify worker health.
 */
externalWorkers.post('/:id/verify', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const workerId = c.req.param('id');

  try {
    // Fetch the worker to get URL (we need the auth token from client for verification)
    const worker = await c.env.DB.prepare(
      `SELECT worker_url FROM user_external_workers
       WHERE id = ? AND user_id = ?`
    )
      .bind(workerId, userId)
      .first<{ worker_url: string }>();

    if (!worker) {
      throw Errors.NotFound('External worker not found');
    }

    // Get auth token from request body (user must provide it for re-verification)
    interface VerifyRequest {
      authToken: string;
    }

    let body: VerifyRequest;
    try {
      body = await c.req.json<VerifyRequest>();
    } catch {
      throw Errors.BadRequest('Auth token required for verification');
    }

    if (!body.authToken || body.authToken.length < 32) {
      throw Errors.BadRequest('Valid auth token required');
    }

    // Verify health
    const healthResult = await verifyWorkerHealth(worker.worker_url, body.authToken);
    const now = Date.now();

    // Update status
    await c.env.DB.prepare(
      `UPDATE user_external_workers
       SET status = ?, supported_providers = ?, last_health_check = ?,
           last_error = ?, auth_token_hash = ?, auth_token_fingerprint = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ?`
    )
      .bind(
        healthResult.status,
        healthResult.providers.length > 0
          ? JSON.stringify(healthResult.providers)
          : null,
        now,
        healthResult.error ?? null,
        await hashToken(body.authToken),
        createTokenFingerprint(body.authToken),
        now,
        workerId,
        userId
      )
      .run();

    return c.json({
      success: true,
      status: healthResult.status,
      supportedProviders: healthResult.providers,
      version: healthResult.version,
      error: healthResult.error,
    });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      throw error;
    }
    console.error('Failed to verify external worker:', error);
    throw Errors.Internal('Failed to verify external worker');
  }
});

/**
 * DELETE /api/auth/external-workers/:id - Remove an external worker.
 */
externalWorkers.delete('/:id', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const workerId = c.req.param('id');

  try {
    const result = await c.env.DB.prepare(
      `DELETE FROM user_external_workers
       WHERE id = ? AND user_id = ?`
    )
      .bind(workerId, userId)
      .run();

    if (!result.meta.changes || result.meta.changes === 0) {
      throw Errors.NotFound('External worker not found');
    }

    return c.json({ success: true });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      throw error;
    }
    console.error('Failed to delete external worker:', error);
    throw Errors.Internal('Failed to delete external worker');
  }
});

/**
 * GET /api/auth/external-workers/verification/stats - Get user's verification stats.
 */
externalWorkers.get('/verification/stats', async (c) => {
  const session = c.get('session');
  const userId = session.userId;

  try {
    const verificationService = createVerificationService(c.env);
    const stats = await verificationService.getVerificationStats(userId);

    return c.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Failed to get verification stats:', error);
    throw Errors.Internal('Failed to get verification stats');
  }
});

/**
 * POST /api/auth/external-workers/:id/challenge - Send a verification challenge.
 * This allows users to manually test their worker's challenge-response.
 */
externalWorkers.post('/:id/challenge', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const workerId = c.req.param('id');

  try {
    // Get worker details
    const worker = await c.env.DB.prepare(
      `SELECT worker_url FROM user_external_workers
       WHERE id = ? AND user_id = ?`
    )
      .bind(workerId, userId)
      .first<{ worker_url: string }>();

    if (!worker) {
      throw Errors.NotFound('External worker not found');
    }

    // Get auth token from request body
    interface ChallengeRequest {
      authToken: string;
    }

    let body: ChallengeRequest;
    try {
      body = await c.req.json<ChallengeRequest>();
    } catch {
      throw Errors.BadRequest('Auth token required for challenge');
    }

    if (!body.authToken || body.authToken.length < 32) {
      throw Errors.BadRequest('Valid auth token required');
    }

    // Send challenge
    const result = await verifyChallengeResponse({
      gameId: 'manual-test',
      userId,
      workerId,
      workerUrl: worker.worker_url,
      authToken: body.authToken,
    });

    return c.json({
      success: true,
      challenge: {
        passed: result.passed,
        templateVersion: result.templateVersion,
        error: result.error,
      },
    });
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      throw error;
    }
    console.error('Failed to send challenge:', error);
    throw Errors.Internal('Failed to send challenge');
  }
});

/**
 * Helper function to get a user's active external worker configuration.
 * Used by the AI factory to route requests through external workers.
 */
export async function getUserExternalWorker(
  userId: string,
  env: Env
): Promise<{
  workerUrl: string;
  authTokenHash: string;
  supportedProviders: string[];
} | null> {
  const result = await env.DB.prepare(
    `SELECT worker_url, auth_token_hash, supported_providers
     FROM user_external_workers
     WHERE user_id = ? AND status = 'verified'
     ORDER BY created_at DESC
     LIMIT 1`
  )
    .bind(userId)
    .first<{
      worker_url: string;
      auth_token_hash: string;
      supported_providers: string | null;
    }>();

  if (!result) {
    return null;
  }

  return {
    workerUrl: result.worker_url,
    authTokenHash: result.auth_token_hash,
    supportedProviders: result.supported_providers
      ? JSON.parse(result.supported_providers)
      : [],
  };
}

export default externalWorkers;

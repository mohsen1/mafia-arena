/**
 * User Batch API routes.
 * 
 * Allows authenticated users to create and manage batch game runs
 * using their own API keys. More restrictive than admin routes.
 * 
 * Routes:
 * - POST /api/batches - Create a new batch (requires API keys)
 * - GET /api/batches - List user's batches
 * - GET /api/batches/:id - Get batch details
 * - POST /api/batches/:id/cancel - Cancel a batch
 * - POST /api/batches/estimate - Get cost estimate
 */

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import type { Env, BatchConfig, EncryptedUserKeys } from '../types.js';
import { Errors } from '../utils/index.js';
import { getRandomTheme } from '../utils/random-config.js';
import { getSession, type SessionData } from './auth.js';
import { getUserApiKeys } from './keys.js';
import { encryptKey } from '../utils/crypto.js';
import {
  createBatch,
  getBatch,
  cancelBatch,
  estimateCost,
} from '../batch/index.js';
import { checkRateLimit } from '../utils/rateLimit.js';
import { createDb } from '../db/drizzle.js';
import * as schema from '../db/schema.js';

// =============================================================================
// USER LIMITS (stricter than admin)
// =============================================================================

/** Maximum games per batch for users */
const USER_MAX_BATCH_SIZE = 50;

/** Maximum active (queued/processing) batches per user */
const USER_MAX_ACTIVE_BATCHES = 3;

/** Rate limit: 1 batch per 10 minutes per user */
const USER_RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

// =============================================================================
// TYPES
// =============================================================================

interface BatchesBindings {
  Bindings: Env;
  Variables: {
    session: SessionData;
  };
}

const batches = new Hono<BatchesBindings>();

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Require authenticated user session.
 */
async function requireAuth(c: Context<BatchesBindings>, next: Next) {
  const session = await getSession(c.req.raw, c.env);
  if (!session) {
    throw Errors.Unauthorized();
  }
  c.set('session', session);
  return next();
}

/**
 * User-specific rate limiting for batch creation.
 * Limits to 1 batch per 10 minutes per user.
 */
async function userBatchRateLimitMiddleware(c: Context<BatchesBindings>, next: Next) {
  if (!c.env.RATE_LIMIT) {
    return next();
  }

  const session = c.get('session');
  const key = `user_batch_create:${session.userId}`;
  
  const result = await checkRateLimit(c.env.RATE_LIMIT, key, {
    maxRequests: 1,
    windowMs: USER_RATE_LIMIT_MS,
  });

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    throw Errors.RateLimited(retryAfter);
  }

  return next();
}

// Apply auth middleware to all routes
batches.use('*', requireAuth);

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get required providers from model IDs.
 * Extracts the provider prefix from model IDs like "anthropic/claude-3".
 */
function getRequiredProviders(modelIds: string[]): Set<string> {
  const providers = new Set<string>();
  for (const modelId of modelIds) {
    const provider = modelId.split('/')[0];
    if (provider) {
      providers.add(provider);
    }
  }
  return providers;
}

/**
 * Validate user has API keys for all required providers.
 */
async function validateUserKeysForModels(
  userId: string,
  teams: Array<{ modelId: string }>,
  env: Env
): Promise<Map<string, string>> {
  const modelIds = teams.map(t => t.modelId);
  const requiredProviders = getRequiredProviders(modelIds);
  
  // Get user's keys
  const userKeys = await getUserApiKeys(userId, [...requiredProviders], env);
  
  // Check for missing providers
  const missing = [...requiredProviders].filter(p => !userKeys.has(p));
  
  if (missing.length > 0) {
    throw Errors.BadRequest(
      `Missing API keys for: ${missing.join(', ')}. Please add them in Account → API Keys before creating batches.`
    );
  }
  
  return userKeys;
}

/**
 * Encrypt user keys for queue transport.
 * Keys need to be encrypted before passing through the queue.
 */
async function encryptUserKeysForQueue(
  userKeys: Map<string, string>,
  env: Env
): Promise<EncryptedUserKeys> {
  const encryptedKeys: EncryptedUserKeys = {};
  
  for (const [provider, apiKey] of userKeys) {
    const encrypted = await encryptKey(apiKey, env.ENCRYPTION_SECRET!);
    encryptedKeys[provider] = {
      encrypted: encrypted.encrypted,
      iv: encrypted.iv,
    };
  }
  
  return encryptedKeys;
}

/**
 * Check if user has too many active batches.
 */
async function checkActiveBatchLimit(userId: string, env: Env): Promise<void> {
  const db = createDb(env.DB);
  
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.createdBy, userId),
        inArray(schema.batches.status, ['queued', 'processing'])
      )
    );
  
  const count = result[0]?.count ?? 0;
  
  if (count >= USER_MAX_ACTIVE_BATCHES) {
    throw Errors.BadRequest(
      `You have ${count} active batches. Please wait for them to complete before creating more (max ${USER_MAX_ACTIVE_BATCHES}).`
    );
  }
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/batches - Create a new user batch.
 * 
 * Requires:
 * - User to be authenticated
 * - User to have API keys for all providers used by selected models
 * - User to be under the active batch limit
 * - User to not have hit the rate limit
 */
batches.post('/', userBatchRateLimitMiddleware, async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const env = c.env;

  interface CreateBatchRequest {
    name?: string;
    totalGames: number;
    config: {
      playerCount: number;
      mafiaCount: number;
      teams: Array<{
        modelId: string;
        team: 'mafia' | 'town';
        count: number;
      }>;
      maxRounds?: number;
      discussionEnabled?: boolean;
      personaConstraints?: 'strict' | 'moderate' | 'free';
      contextLevel?: 'full' | 'windowed' | 'summary';
      contextWindowSize?: number;
      personaTheme?: 'noir' | 'victorian' | 'modern' | 'fantasy';
    };
  }

  let body: CreateBatchRequest;
  try {
    body = await c.req.json<CreateBatchRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Validate batch size (user limit)
  if (!body.totalGames || body.totalGames < 1 || body.totalGames > USER_MAX_BATCH_SIZE) {
    throw Errors.BadRequest(`Total games must be between 1 and ${USER_MAX_BATCH_SIZE}`);
  }

  // Validate config
  if (!body.config || !body.config.teams || body.config.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  // Check active batch limit
  await checkActiveBatchLimit(userId, env);

  // Validate user has required API keys
  const userKeys = await validateUserKeysForModels(userId, body.config.teams, env);
  
  if (userKeys.size === 0) {
    throw Errors.BadRequest(
      'You must add API keys before creating batches. Go to Account → API Keys.'
    );
  }

  // Encrypt keys for queue transport
  const encryptedUserKeys = await encryptUserKeysForQueue(userKeys, env);

  // Build batch config with user context
  const batchConfig: BatchConfig = {
    name: body.name ?? `${session.name}'s Batch`,
    totalGames: body.totalGames,
    gameConfig: {
      playerCount: body.config.playerCount,
      mafiaCount: body.config.mafiaCount,
      teams: body.config.teams,
      maxRounds: body.config.maxRounds ?? 10,
      discussionEnabled: body.config.discussionEnabled ?? true,
      personaConstraints: body.config.personaConstraints ?? 'moderate',
      contextLevel: body.config.contextLevel ?? 'windowed',
      contextWindowSize: body.config.contextWindowSize ?? 3,
      personaTheme: body.config.personaTheme ?? getRandomTheme(),
    },
    createdBy: userId,
    userId,
    encryptedUserKeys,
    useBatchAPI: false, // Users don't get batch API discount (simpler UX)
  };

  const result = await createBatch(env, batchConfig);

  return c.json({
    success: true,
    batchId: result.batchId,
    estimatedCostUsd: result.estimatedCost,
    totalGames: body.totalGames,
    message: `Batch created! ${body.totalGames} games will be run using your API keys.`,
  });
});

/**
 * GET /api/batches - List user's batches.
 * Only shows batches created by the authenticated user.
 */
batches.get('/', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const db = createDb(c.env.DB);

  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const statusParam = url.searchParams.get('status');

  // Build where conditions
  const conditions = [eq(schema.batches.createdBy, userId)];
  
  if (statusParam && ['queued', 'processing', 'completed', 'cancelled', 'paused'].includes(statusParam)) {
    conditions.push(eq(schema.batches.status, statusParam as 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused'));
  }

  // Get batches
  const userBatches = await db
    .select()
    .from(schema.batches)
    .where(and(...conditions))
    .orderBy(desc(schema.batches.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.batches)
    .where(and(...conditions));

  const total = countResult[0]?.count ?? 0;

  return c.json({
    batches: userBatches.map(b => ({
      id: b.id,
      name: b.name,
      status: b.status,
      totalGames: b.totalGames,
      completedGames: b.completedGames,
      failedGames: b.failedGames,
      estimatedCostUsd: b.estimatedCostUsd,
      actualCostUsd: b.actualCostUsd,
      createdAt: b.createdAt,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
      progress: b.totalGames > 0
        ? (((b.completedGames ?? 0) + (b.failedGames ?? 0)) / b.totalGames * 100).toFixed(1)
        : '0',
    })),
    total,
    hasMore: offset + limit < total,
    limits: {
      maxBatchSize: USER_MAX_BATCH_SIZE,
      maxActiveBatches: USER_MAX_ACTIVE_BATCHES,
      rateLimitMinutes: USER_RATE_LIMIT_MS / 60000,
    },
  });
});

/**
 * GET /api/batches/:id - Get user's batch details.
 * Only returns batch if owned by authenticated user.
 */
batches.get('/:id', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const batchId = c.req.param('id');
  const db = createDb(c.env.DB);

  const batch = await getBatch(c.env, batchId);

  if (!batch) {
    throw Errors.NotFound('Batch');
  }

  // Ensure user owns this batch
  if (batch.created_by !== userId) {
    throw Errors.Forbidden('You do not have permission to view this batch');
  }

  // Get recent games from this batch
  const recentGames = await db
    .select({
      id: schema.games.id,
      status: schema.games.status,
      winner: schema.games.winner,
      rounds: schema.games.rounds,
      durationMs: schema.games.durationMs,
      createdAt: schema.games.createdAt,
    })
    .from(schema.games)
    .where(eq(schema.games.batchId, batchId))
    .orderBy(desc(schema.games.createdAt))
    .limit(20);

  return c.json({
    id: batch.id,
    name: batch.name,
    status: batch.status,
    totalGames: batch.total_games,
    completedGames: batch.completed_games,
    failedGames: batch.failed_games,
    estimatedCostUsd: batch.estimated_cost_usd,
    actualCostUsd: batch.actual_cost_usd,
    createdAt: batch.created_at,
    startedAt: batch.started_at,
    completedAt: batch.completed_at,
    errorMessage: batch.error_message,
    progress: batch.total_games > 0
      ? ((batch.completed_games + batch.failed_games) / batch.total_games * 100).toFixed(1)
      : '0',
    recentGames,
  });
});

/**
 * POST /api/batches/:id/cancel - Cancel user's batch.
 * Only allows cancelling batches owned by authenticated user.
 */
batches.post('/:id/cancel', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const batchId = c.req.param('id');

  const batch = await getBatch(c.env, batchId);

  if (!batch) {
    throw Errors.NotFound('Batch');
  }

  // Ensure user owns this batch
  if (batch.created_by !== userId) {
    throw Errors.Forbidden('You do not have permission to cancel this batch');
  }

  if (batch.status === 'completed' || batch.status === 'cancelled') {
    throw Errors.BadRequest(`Batch is already ${batch.status}`);
  }

  await cancelBatch(c.env, batchId);

  return c.json({
    success: true,
    message: `Batch ${batchId} cancelled. Games already started will complete, but no new games will be queued.`,
  });
});

/**
 * POST /api/batches/estimate - Get cost estimate for a batch.
 * Does not require API keys (informational only).
 */
batches.post('/estimate', async (c) => {
  interface EstimateRequest {
    totalGames: number;
    config: {
      playerCount: number;
      mafiaCount: number;
      teams: Array<{
        modelId: string;
        team: 'mafia' | 'town';
        count: number;
      }>;
      discussionEnabled?: boolean;
      contextLevel?: 'full' | 'windowed' | 'summary';
    };
  }

  let body: EstimateRequest;
  try {
    body = await c.req.json<EstimateRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Cap at user limit for accurate estimate
  const totalGames = Math.min(body.totalGames, USER_MAX_BATCH_SIZE);

  const estimate = estimateCost({
    totalGames,
    gameConfig: {
      playerCount: body.config.playerCount,
      mafiaCount: body.config.mafiaCount,
      teams: body.config.teams,
      maxRounds: 10,
      discussionEnabled: body.config.discussionEnabled ?? true,
      personaConstraints: 'moderate',
      contextLevel: body.config.contextLevel ?? 'windowed',
      contextWindowSize: 3,
    },
    useBatchAPI: false,
  });

  return c.json({
    ...estimate,
    userLimit: USER_MAX_BATCH_SIZE,
    note: totalGames < body.totalGames 
      ? `Capped at user limit of ${USER_MAX_BATCH_SIZE} games`
      : undefined,
  });
});

export default batches;


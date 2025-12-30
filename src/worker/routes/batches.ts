/**
 * Batch API routes (unified for all authenticated users).
 * 
 * Allows authenticated users to create and manage batch game runs.
 * - Regular users: Use their own API keys, stricter limits
 * - Admin users: Can use system keys OR their own keys, higher limits
 * 
 * Routes:
 * - POST /api/batches - Create a new batch
 * - GET /api/batches - List user's batches (admin sees all)
 * - GET /api/batches/:id - Get batch details
 * - POST /api/batches/:id/cancel - Cancel a batch
 * - POST /api/batches/estimate - Get cost estimate
 */

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import type { Env, BatchConfig, EncryptedUserKeys, ApiProvider } from '../types.js';
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
  MAX_BATCH_SIZE,
} from '../batch/index.js';
import { checkRateLimit } from '../utils/rateLimit.js';
import { createDb } from '../db/drizzle.js';
import * as schema from '../db/schema.js';
import { inferProviderFromModelId } from '../ai/factory.js';

// =============================================================================
// LIMITS
// =============================================================================

/** Maximum games per batch for regular users */
const USER_MAX_BATCH_SIZE = 50;

/** Maximum games per batch for admin users */
const ADMIN_MAX_BATCH_SIZE = MAX_BATCH_SIZE; // 10,000

/** Maximum active (queued/processing) batches per user */
const USER_MAX_ACTIVE_BATCHES = 3;

/** Rate limit: 1 batch per 10 minutes per regular user */
const USER_RATE_LIMIT_MS = 10 * 60 * 1000; // 10 minutes

/** Map of providers to their env key names for system key validation */
const PROVIDER_ENV_KEYS: Record<ApiProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  together: 'TOGETHER_API_KEY',
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  hyperbolic: 'HYPERBOLIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  ai21: 'AI21_API_KEY',
};

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
 * Require authenticated user session with valid userId.
 */
async function requireAuth(c: Context<BatchesBindings>, next: Next) {
  const session = await getSession(c.req.raw, c.env);
  if (!session) {
    throw Errors.Unauthorized();
  }
  // Validate session has userId (older sessions may not have it)
  if (!session.userId) {
    throw Errors.Forbidden('Session expired. Please sign out and sign in again to refresh your session.');
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
 * Looks up the provider from the database or infers from model ID.
 */
async function getRequiredProviders(modelIds: string[], env: Env): Promise<Set<string>> {
  const providers = new Set<string>();
  
  const uniqueModelIds = [...new Set(modelIds)];
  if (uniqueModelIds.length > 0) {
    const placeholders = uniqueModelIds.map(() => '?').join(',');
    const result = await env.DB.prepare(
      `SELECT id, api_provider FROM models WHERE id IN (${placeholders})`
    ).bind(...uniqueModelIds).all<{ id: string; api_provider: string }>();
    
    const dbProviderMap = new Map(
      (result.results ?? []).map(m => [m.id, m.api_provider])
    );
    
    for (const modelId of modelIds) {
      const dbProvider = dbProviderMap.get(modelId);
      if (dbProvider) {
        providers.add(dbProvider);
      } else {
        providers.add(inferProviderFromModelId(modelId));
      }
    }
  }
  
  return providers;
}

/**
 * Validate that system API keys are configured for all required providers.
 * Throws Errors.BadRequest if any required keys are missing.
 */
function validateSystemKeys(requiredProviders: Set<string>, env: Env): void {
  const missingKeys: string[] = [];
  
  for (const provider of requiredProviders) {
    const envKey = PROVIDER_ENV_KEYS[provider as ApiProvider];
    if (!envKey) continue;
    
    const keyValue = (env as unknown as Record<string, string | undefined>)[envKey];
    if (!keyValue) {
      missingKeys.push(`${provider} (${envKey})`);
    }
  }
  
  if (missingKeys.length > 0) {
    throw Errors.BadRequest(
      `System API keys not configured for: ${missingKeys.join(', ')}. ` +
      `Please contact the administrator to add the missing keys.`
    );
  }
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
  const requiredProviders = await getRequiredProviders(modelIds, env);
  
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
 * POST /api/batches - Create a new batch.
 * 
 * For regular users:
 * - Must have API keys for all providers used by selected models
 * - Limited to USER_MAX_BATCH_SIZE games per batch
 * - Rate limited to 1 batch per 10 minutes
 * - Limited to USER_MAX_ACTIVE_BATCHES active batches
 * 
 * For admin users:
 * - Can use system keys (useSystemKeys: true) or their own keys
 * - Can create up to ADMIN_MAX_BATCH_SIZE games per batch
 * - Can use batch API for 50% discount (useBatchAPI: true)
 * - No rate limits or active batch limits
 */
batches.post('/', async (c, next) => {
  // Only apply rate limit to non-admin users
  const session = c.get('session');
  if (session.isAdmin) {
    return next();
  }
  return userBatchRateLimitMiddleware(c, next);
}, async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const isAdmin = session.isAdmin;
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
    useBatchAPI?: boolean; // Discount pricing (admin or enabled models)
    useSystemKeys?: boolean; // Admin only - use platform API keys
  }

  let body: CreateBatchRequest;
  try {
    body = await c.req.json<CreateBatchRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Determine limits based on admin status
  const maxGames = isAdmin ? ADMIN_MAX_BATCH_SIZE : USER_MAX_BATCH_SIZE;
  
  // Validate batch size
  if (!body.totalGames || body.totalGames < 1 || body.totalGames > maxGames) {
    throw Errors.BadRequest(`Total games must be between 1 and ${maxGames}`);
  }

  // Validate config
  if (!body.config || !body.config.teams || body.config.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  // Check active batch limit (skip for admins)
  if (!isAdmin) {
    await checkActiveBatchLimit(userId, env);
  }

  // Determine key handling based on admin status and useSystemKeys flag
  const useSystemKeys = isAdmin && body.useSystemKeys === true;
  let encryptedUserKeys: EncryptedUserKeys | undefined;

  if (useSystemKeys) {
    // Admin using system keys - validate env vars exist
    const modelIds = body.config.teams.map(t => t.modelId);
    const requiredProviders = await getRequiredProviders(modelIds, env);
    validateSystemKeys(requiredProviders, env);
  } else {
    // User keys (or admin using their own keys)
    const userKeys = await validateUserKeysForModels(userId, body.config.teams, env);
    
    if (userKeys.size === 0) {
      throw Errors.BadRequest(
        'You must add API keys before creating batches. Go to Account → API Keys.'
      );
    }
    
    // Encrypt keys for queue transport
    encryptedUserKeys = await encryptUserKeysForQueue(userKeys, env);
  }

  // Build batch config
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
      discountPricing: body.useBatchAPI ?? false,
    },
    createdBy: userId,
    userId,
    useBatchAPI: body.useBatchAPI ?? false,
    ...(encryptedUserKeys && { encryptedUserKeys }),
  };

  const result = await createBatch(env, batchConfig);

  const keySource = useSystemKeys ? 'system API keys' : 'your API keys';
  
  return c.json({
    success: true,
    batchId: result.batchId,
    estimatedCostUsd: result.estimatedCost,
    totalGames: body.totalGames,
    message: `Batch created! ${body.totalGames} games will be run using ${keySource}.`,
    useBatchAPI: body.useBatchAPI ?? false,
    useSystemKeys,
  });
});

/**
 * GET /api/batches - List batches.
 * - Regular users: Only see their own batches
 * - Admin users: See all batches (or filter by ?mine=true for their own)
 */
batches.get('/', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const isAdmin = session.isAdmin;
  const db = createDb(c.env.DB);

  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const statusParam = url.searchParams.get('status');
  const mineOnly = url.searchParams.get('mine') === 'true';

  // Build where conditions
  const conditions: ReturnType<typeof eq>[] = [];
  
  // Filter by user unless admin viewing all
  if (!isAdmin || mineOnly) {
    conditions.push(eq(schema.batches.createdBy, userId));
  }
  
  if (statusParam && ['queued', 'processing', 'completed', 'cancelled', 'paused', 'failed'].includes(statusParam)) {
    conditions.push(eq(schema.batches.status, statusParam as 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused' | 'failed'));
  }

  // Get batches
  const userBatches = await db
    .select()
    .from(schema.batches)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.batches.createdAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.batches)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

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
      createdBy: b.createdBy,
      createdAt: b.createdAt,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
      errorMessage: b.errorMessage,
      progress: b.totalGames > 0
        ? (((b.completedGames ?? 0) + (b.failedGames ?? 0)) / b.totalGames * 100).toFixed(1)
        : '0',
    })),
    total,
    hasMore: offset + limit < total,
    limits: {
      maxBatchSize: isAdmin ? ADMIN_MAX_BATCH_SIZE : USER_MAX_BATCH_SIZE,
      maxActiveBatches: isAdmin ? null : USER_MAX_ACTIVE_BATCHES,
      rateLimitMinutes: isAdmin ? null : USER_RATE_LIMIT_MS / 60000,
    },
    isAdmin,
  });
});

/**
 * GET /api/batches/:id - Get batch details.
 * - Regular users: Only see their own batches
 * - Admin users: Can view any batch
 */
batches.get('/:id', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const isAdmin = session.isAdmin;
  const batchId = c.req.param('id');
  const db = createDb(c.env.DB);
  const env = c.env;

  const batch = await getBatch(env, batchId);

  if (!batch) {
    throw Errors.NotFound('Batch');
  }

  // Ensure user owns this batch (or is admin)
  if (batch.created_by !== userId && !isAdmin) {
    throw Errors.Forbidden('You do not have permission to view this batch');
  }

  // Get recent games from this batch (more for admins)
  const gameLimit = isAdmin ? 50 : 20;
  const recentGames = await db
    .select({
      id: schema.games.id,
      status: schema.games.status,
      winner: schema.games.winner,
      rounds: schema.games.rounds,
      durationMs: schema.games.durationMs,
      costUsd: schema.games.costUsd,
      createdAt: schema.games.createdAt,
      errorMessage: schema.games.errorMessage,
    })
    .from(schema.games)
    .where(eq(schema.games.batchId, batchId))
    .orderBy(desc(schema.games.createdAt))
    .limit(gameLimit);

  // Get error logs for admin
  let errorLogs: Array<{ id: string; message: string; createdAt: Date }> = [];
  if (isAdmin) {
    const errors = await db
      .select({
        id: schema.errorLog.id,
        message: schema.errorLog.message,
        createdAt: schema.errorLog.createdAt,
      })
      .from(schema.errorLog)
      .where(sql`${schema.errorLog.context} LIKE ${'%' + batchId + '%'}`)
      .orderBy(desc(schema.errorLog.createdAt))
      .limit(20);
    errorLogs = errors;
  }

  return c.json({
    id: batch.id,
    name: batch.name,
    status: batch.status,
    totalGames: batch.total_games,
    completedGames: batch.completed_games,
    failedGames: batch.failed_games,
    estimatedCostUsd: batch.estimated_cost_usd,
    actualCostUsd: batch.actual_cost_usd,
    createdBy: batch.created_by,
    createdAt: batch.created_at,
    startedAt: batch.started_at,
    completedAt: batch.completed_at,
    errorMessage: batch.error_message,
    config: batch.config_json ? JSON.parse(batch.config_json) : null,
    progress: batch.total_games > 0
      ? ((batch.completed_games + batch.failed_games) / batch.total_games * 100).toFixed(1)
      : '0',
    recentGames,
    ...(isAdmin && { errorLogs }),
  });
});

/**
 * POST /api/batches/:id/cancel - Cancel a batch.
 * - Regular users: Only cancel their own batches
 * - Admin users: Can cancel any batch
 */
batches.post('/:id/cancel', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const isAdmin = session.isAdmin;
  const batchId = c.req.param('id');

  const batch = await getBatch(c.env, batchId);

  if (!batch) {
    throw Errors.NotFound('Batch');
  }

  // Ensure user owns this batch (or is admin)
  if (batch.created_by !== userId && !isAdmin) {
    throw Errors.Forbidden('You do not have permission to cancel this batch');
  }

  if (batch.status === 'completed' || batch.status === 'cancelled' || batch.status === 'failed') {
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
  const session = c.get('session');
  const isAdmin = session.isAdmin;

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
    useBatchAPI?: boolean;
  }

  let body: EstimateRequest;
  try {
    body = await c.req.json<EstimateRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Cap based on user type
  const maxGames = isAdmin ? ADMIN_MAX_BATCH_SIZE : USER_MAX_BATCH_SIZE;
  const totalGames = Math.min(body.totalGames, maxGames);

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
    useBatchAPI: body.useBatchAPI ?? false,
  });

  return c.json({
    ...estimate,
    maxGames,
    note: totalGames < body.totalGames 
      ? `Capped at limit of ${maxGames} games`
      : undefined,
  });
});

export default batches;


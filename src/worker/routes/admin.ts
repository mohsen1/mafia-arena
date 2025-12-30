/**
 * Admin API routes (protected by Basic Auth).
 */

import { Hono } from 'hono';
import { eq, desc, like, or, sql, ne } from 'drizzle-orm';
import type { Env, BatchConfig, ApiProvider } from '../types.js';
import { Errors, generateTraceId, checkAllKeys } from '../utils/index.js';
import { getRandomTheme } from '../utils/random-config.js';
import {
  createBatch,
  getBatch,
  listBatches,
  cancelBatch,
  estimateCost,
  pauseProcessing,
  resumeProcessing,
  getAdminStats,
  MAX_BATCH_SIZE,
} from '../batch/index.js';
import { adminAuthMiddleware, batchRateLimitMiddleware } from '../middleware/index.js';
import { killHangingGames, getRunningGamesCount } from './admin-cleanup.js';
import { createDb } from '../db/drizzle.js';
import * as schema from '../db/schema.js';
import { getGameStateFromKV, deleteGameStateFromKV } from '../utils/workflow-sync.js';
import { inferProviderFromModelId } from '../ai/factory.js';

/**
 * Map of providers to their env key names.
 * Used for validating system API keys.
 */
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

/**
 * Get required providers for a list of model IDs.
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

const admin = new Hono<{ Bindings: Env }>();

// Apply admin auth to all routes in this router
admin.use('*', adminAuthMiddleware);

/**
 * POST /api/admin/batches - Create a new batch job.
 */
admin.post('/batches', batchRateLimitMiddleware, async (c) => {
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
    useBatchAPI?: boolean;
  }

  let body: CreateBatchRequest;
  try {
    body = await c.req.json<CreateBatchRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Validate
  if (!body.totalGames || body.totalGames < 1 || body.totalGames > MAX_BATCH_SIZE) {
    throw Errors.BadRequest(`Total games must be between 1 and ${MAX_BATCH_SIZE}`);
  }

  if (!body.config || !body.config.teams || body.config.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  const batchConfig: BatchConfig = {
    ...(body.name && { name: body.name }),
    totalGames: body.totalGames,
    gameConfig: {
      playerCount: body.config.playerCount,
      mafiaCount: body.config.mafiaCount,
      teams: body.config.teams,
      maxRounds: 10,
      discussionEnabled: true,
      personaConstraints: 'moderate',
      contextLevel: 'windowed', // Optimized default: reduces token usage vs 'full'
      contextWindowSize: 3,
      // If personaTheme is undefined, batch service will randomize per game
      ...(body.config.personaTheme && { personaTheme: body.config.personaTheme }),
    },
    useBatchAPI: body.useBatchAPI ?? false,
  };

  const result = await createBatch(env, batchConfig);

  return c.json({
    success: true,
    batchId: result.batchId,
    estimatedCostUsd: result.estimatedCost,
    totalGames: body.totalGames,
  });
});

/**
 * GET /api/admin/batches - List all batches.
 */
admin.get('/batches', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const statusParam = url.searchParams.get('status');

  // Build options object conditionally to avoid undefined values
  const options: { status?: 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused'; limit: number; offset: number } = { limit, offset };
  if (statusParam && ['queued', 'processing', 'completed', 'cancelled', 'paused'].includes(statusParam)) {
    options.status = statusParam as 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused';
  }

  const result = await listBatches(env, options);

  return c.json({
    batches: result.batches.map(b => ({
      id: b.id,
      name: b.name,
      status: b.status,
      totalGames: b.total_games,
      completedGames: b.completed_games,
      failedGames: b.failed_games,
      estimatedCostUsd: b.estimated_cost_usd,
      actualCostUsd: b.actual_cost_usd,
      createdBy: b.created_by,
      createdAt: b.created_at,
      startedAt: b.started_at,
      completedAt: b.completed_at,
      progress: b.total_games > 0
        ? ((b.completed_games + b.failed_games) / b.total_games * 100).toFixed(1)
        : '0',
    })),
    total: result.total,
    hasMore: offset + limit < result.total,
  });
});

/**
 * GET /api/admin/batches/:id - Get batch details.
 */
admin.get('/batches/:id', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  const batchId = c.req.param('id');

  const batch = await getBatch(env, batchId);

  if (!batch) {
    throw Errors.NotFound('Batch');
  }

  // Get recent games from this batch (include error_message for debugging)
  const recentGames = await db
    .select({
      id: schema.games.id,
      status: schema.games.status,
      winner: schema.games.winner,
      rounds: schema.games.rounds,
      duration_ms: schema.games.durationMs,
      created_at: schema.games.createdAt,
      error_message: schema.games.errorMessage,
    })
    .from(schema.games)
    .where(eq(schema.games.batchId, batchId))
    .orderBy(desc(schema.games.createdAt))
    .limit(50);

  // Get recent error logs that might be related to this batch
  const errorLogs = await db
    .select()
    .from(schema.errorLog)
    .where(
      or(
        like(schema.errorLog.context, `%${batchId}%`),
        like(schema.errorLog.context, `%batch_id%${batchId}%`)
      )
    )
    .orderBy(desc(schema.errorLog.createdAt))
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
    createdBy: batch.created_by,
    createdAt: batch.created_at,
    startedAt: batch.started_at,
    completedAt: batch.completed_at,
    errorMessage: batch.error_message,
    config: JSON.parse(batch.config_json),
    progress: batch.total_games > 0
      ? ((batch.completed_games + batch.failed_games) / batch.total_games * 100).toFixed(1)
      : '0',
    recentGames,
    errorLogs,
  });
});

/**
 * POST /api/admin/batches/:id/cancel - Cancel a batch.
 */
admin.post('/batches/:id/cancel', async (c) => {
  const env = c.env;
  const batchId = c.req.param('id');

  const batch = await getBatch(env, batchId);

  if (!batch) {
    throw Errors.NotFound('Batch');
  }

  if (batch.status === 'completed' || batch.status === 'cancelled') {
    throw Errors.BadRequest(`Batch is already ${batch.status}`);
  }

  await cancelBatch(env, batchId);

  return c.json({
    success: true,
    message: `Batch ${batchId} cancelled`,
  });
});

/**
 * POST /api/admin/system/pause - Pause all processing.
 */
admin.post('/system/pause', async (c) => {
  const env = c.env;
  await pauseProcessing(env);

  return c.json({
    success: true,
    message: 'System processing paused',
  });
});

/**
 * POST /api/admin/system/resume - Resume processing.
 */
admin.post('/system/resume', async (c) => {
  const env = c.env;
  await resumeProcessing(env);

  return c.json({
    success: true,
    message: 'System processing resumed',
  });
});

/**
 * GET /api/admin/stats/live - Get real-time admin stats.
 */
admin.get('/stats/live', async (c) => {
  const env = c.env;
  const stats = await getAdminStats(env);

  return c.json(stats);
});

/**
 * POST /api/admin/estimate - Get cost estimate for a batch.
 */
admin.post('/estimate', async (c) => {
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

  const estimate = estimateCost({
    totalGames: body.totalGames,
    gameConfig: {
      playerCount: body.config.playerCount,
      mafiaCount: body.config.mafiaCount,
      teams: body.config.teams,
      maxRounds: 10,
      discussionEnabled: true,
      personaConstraints: 'moderate',
      contextLevel: 'windowed', // Optimized default: reduces token usage vs 'full'
      contextWindowSize: 3,
    },
    useBatchAPI: body.useBatchAPI ?? false,
  });

  return c.json(estimate);
});

/**
 * POST /api/admin/games/run-live - Run a single game with live streaming.
 * Starts the game in background mode and returns immediately so the
 * frontend can connect to the WebSocket for real-time updates.
 */
admin.post('/games/run-live', async (c) => {
  const env = c.env;

  interface RunLiveGameRequest {
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

  let body: RunLiveGameRequest;
  try {
    body = await c.req.json<RunLiveGameRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Validate configuration
  if (!body.config || !body.config.teams || body.config.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  const { config } = body;

  // Validate player counts
  const totalTeamPlayers = config.teams.reduce((sum, t) => sum + t.count, 0);
  if (totalTeamPlayers !== config.playerCount) {
    throw Errors.BadRequest(`Team player counts (${totalTeamPlayers}) must equal playerCount (${config.playerCount})`);
  }

  const mafiaPlayers = config.teams
    .filter(t => t.team === 'mafia')
    .reduce((sum, t) => sum + t.count, 0);
  if (mafiaPlayers !== config.mafiaCount) {
    throw Errors.BadRequest(`Mafia team counts (${mafiaPlayers}) must equal mafiaCount (${config.mafiaCount})`);
  }

  // Validate system API keys are configured for required providers
  const modelIds = config.teams.map(t => t.modelId);
  const requiredProviders = await getRequiredProviders(modelIds, env);
  validateSystemKeys(requiredProviders, env);

  // Generate IDs and trace ID
  const traceId = generateTraceId();
  const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_live`;
  const batchId = `batch_${Date.now().toString(36)}_live`;

  // Pick random theme if not specified
  const personaTheme = config.personaTheme ?? getRandomTheme();

  console.log(`[${traceId}] Starting live game ${gameId} via admin panel (workflow)`);

  // Start the workflow
  await env.MAFIA_WORKFLOW.create({
    id: gameId,
    params: {
      gameId,
      config: {
        playerCount: config.playerCount,
        mafiaCount: config.mafiaCount,
        teams: config.teams,
        maxRounds: config.maxRounds ?? 10,
        discussionEnabled: config.discussionEnabled ?? true,
        personaConstraints: config.personaConstraints ?? 'moderate',
        contextLevel: config.contextLevel ?? 'windowed',
        contextWindowSize: config.contextWindowSize ?? 3,
        personaTheme,
      },
      traceId,
      batchId,
    },
  });

  return c.json({
    success: true,
    gameId,
    batchId,
    status: 'running',
    liveUrl: `/games/${gameId}/live`,
    message: 'Game started via Cloudflare Workflow. Redirect to live URL to watch progress.',
    traceId,
  });
});

/**
 * GET /api/admin/games/running - Get count of running/stale games.
 */
admin.get('/games/running', getRunningGamesCount);

/**
 * GET /api/admin/games/failed - List failed games with error reasons.
 */
admin.get('/games/failed', async (c) => {
  const db = createDb(c.env.DB);
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  // Fetch failed games with participants
  const failedGames = await db
    .select({
      id: schema.games.id,
      batchId: schema.games.batchId,
      rounds: schema.games.rounds,
      errorMessage: schema.games.errorMessage,
      playerCount: schema.games.playerCount,
      mafiaCount: schema.games.mafiaCount,
      createdAt: schema.games.createdAt,
      updatedAt: schema.games.updatedAt,
      lastActivity: schema.games.lastActivity,
      personaTheme: schema.games.personaTheme,
    })
    .from(schema.games)
    .where(eq(schema.games.status, 'failed'))
    .orderBy(desc(schema.games.updatedAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.games)
    .where(eq(schema.games.status, 'failed'));
  
  const total = countResult[0]?.count ?? 0;

  // Categorize errors for quick filtering
  const categorizedGames = failedGames.map(game => {
    const error = game.errorMessage ?? '';
    let category: 'rate_limit' | 'timeout' | 'auth' | 'model_error' | 'network' | 'unknown';
    let recoverable = false;

    if (/rate.?limit|429|quota/i.test(error)) {
      category = 'rate_limit';
      recoverable = true;
    } else if (/timeout|504|502|timed? out/i.test(error)) {
      category = 'timeout';
      recoverable = true;
    } else if (/auth|401|403|invalid.*key|api.?key/i.test(error)) {
      category = 'auth';
      recoverable = false;
    } else if (/network|connection|ECONNREFUSED|ENOTFOUND/i.test(error)) {
      category = 'network';
      recoverable = true;
    } else if (/model.*not.*found|404|context.*length|invalid.*model/i.test(error)) {
      category = 'model_error';
      recoverable = false;
    } else {
      category = 'unknown';
      recoverable = true; // Give benefit of the doubt
    }

    return {
      ...game,
      errorCategory: category,
      recoverable,
    };
  });

  return c.json({
    games: categorizedGames,
    total,
    hasMore: offset + limit < total,
    summary: {
      total,
      byCategory: {
        rate_limit: categorizedGames.filter(g => g.errorCategory === 'rate_limit').length,
        timeout: categorizedGames.filter(g => g.errorCategory === 'timeout').length,
        auth: categorizedGames.filter(g => g.errorCategory === 'auth').length,
        model_error: categorizedGames.filter(g => g.errorCategory === 'model_error').length,
        network: categorizedGames.filter(g => g.errorCategory === 'network').length,
        unknown: categorizedGames.filter(g => g.errorCategory === 'unknown').length,
      },
      recoverable: categorizedGames.filter(g => g.recoverable).length,
    },
  });
});

/**
 * POST /api/admin/games/:id/resume - Resume a failed game from last checkpoint.
 */
admin.post('/games/:id/resume', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  const gameId = c.req.param('id');

  // 1. Verify game exists and is failed
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }

  if (game.status !== 'failed') {
    throw Errors.BadRequest(`Game status is "${game.status}", not "failed". Cannot resume.`);
  }

  // 2. Contact the Durable Object to resume
  const doId = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(doId);

  const response = await stub.fetch('http://internal/resume', {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json() as { error?: string; reason?: string };
    const message = error.error || error.reason || 'Durable Object failed to resume game';
    throw Errors.Internal(message);
  }

  const result = await response.json() as { 
    success: boolean; 
    message: string; 
    gameId: string;
    previousStatus?: string;
    previousError?: string;
  };

  return c.json({
    success: true,
    gameId,
    message: result.message,
    previousError: game.errorMessage,
  });
});

/**
 * POST /api/admin/games/kill-hanging - Kill all hanging games.
 * Marks games that have been "running" for >10 minutes as failed.
 */
admin.post('/games/kill-hanging', killHangingGames);

/**
 * POST /api/admin/games/:id/fail - Mark a specific game as failed.
 * Useful for manually fixing stuck games.
 */
admin.post('/games/:id/fail', async (c) => {
  const db = createDb(c.env.DB);
  const gameId = c.req.param('id');
  const { reason } = await c.req.json<{ reason?: string }>();
  
  // Check if game exists
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }
  
  const now = new Date();
  const errorMessage = reason || 'Manually marked as failed by admin';
  
  try {
    await db
      .update(schema.games)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: now,
      })
      .where(eq(schema.games.id, gameId));
    
    // Also update daily stats
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesFailed: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesFailed: sql`${schema.dailyStats.gamesFailed} + 1`,
          updatedAt: now,
        },
      });
    
    return c.json({
      success: true,
      gameId,
      message: `Game ${gameId} marked as failed`,
    });
  } catch (error) {
    return c.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/admin/games/:id/repair - Repair a stuck game by saving its state.
 * 
 * This endpoint:
 * 1. Reads game state from KV (where Workflow saves progress)
 * 2. Saves transcript to R2 (preserves game history)
 * 3. Updates D1 with stats (rounds, tokens, duration)
 * 4. Marks game as failed with proper cleanup
 * 5. Cleans up KV state
 * 
 * Use this for games that made progress but the Workflow crashed.
 */
admin.post('/games/:id/repair', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  const gameId = c.req.param('id');
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));
  
  // 1. Check if game exists and is stuck
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }
  
  if (game.status !== 'running') {
    throw Errors.BadRequest(`Game status is "${game.status}", not "running". Cannot repair.`);
  }

  // 2. Get game state from KV
  const kvState = await getGameStateFromKV(env, gameId);
  
  if (!kvState || !kvState.state) {
    throw Errors.BadRequest('No game state found in KV. Cannot repair - try marking as failed instead.');
  }

  const events = kvState.state.events || [];
  const players = kvState.state.players || [];
  
  if (events.length === 0) {
    throw Errors.BadRequest('No events found in KV state. Cannot repair - try marking as failed instead.');
  }

  // 3. Calculate stats from events
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const startedAt = firstEvent?.timestamp || game.createdAt.getTime();
  const endedAt = lastEvent?.timestamp || Date.now();
  const durationMs = endedAt - startedAt;
  
  // Find highest round number and count tokens
  let maxRound = 0;
  let totalTokens = 0;
  let winner: 'town' | 'mafia' | null = null;
  
  for (const event of events) {
    // Check for round (present on most events)
    const eventRound = (event as { round?: number }).round;
    if (eventRound && eventRound > maxRound) {
      maxRound = eventRound;
    }
    
    // Count tokens from ai_call events
    if (event.type === 'ai_call') {
      const aiEvent = event as { response?: { usage?: { total_tokens?: number } } };
      if (aiEvent.response?.usage?.total_tokens) {
        totalTokens += aiEvent.response.usage.total_tokens;
      }
    }
    
    // Check for game_end event to determine winner
    if (event.type === 'game_end') {
      const gameEndEvent = event as { winner?: 'town' | 'mafia' };
      winner = gameEndEvent.winner || null;
    }
  }
  const finalStatus = winner ? 'completed' : 'failed';

  // 4. Save transcript to R2
  const transcript = {
    gameId,
    events,
    players,
    result: {
      winner,
      rounds: maxRound,
      durationMs,
    },
    repaired: true,
    repairedAt: Date.now(),
    originalError: reason || 'Workflow crashed - repaired via admin',
  };

  await env.TRANSCRIPTS.put(
    `games/${gameId}/transcript.json`,
    JSON.stringify(transcript, null, 2),
    {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { 
        gameId, 
        repaired: 'true',
        rounds: String(maxRound),
        ...(winner && { winner }),
      },
    }
  );

  // 5. Update D1 with stats
  const now = new Date();
  const errorMessage = winner 
    ? null 
    : (reason || 'Workflow crashed - repaired via admin');

  await db
    .update(schema.games)
    .set({
      status: finalStatus,
      winner,
      rounds: maxRound,
      totalTokens,
      durationMs,
      errorMessage,
      updatedAt: now,
    })
    .where(eq(schema.games.id, gameId));

  // 6. Update daily stats
  const today = new Date().toISOString().slice(0, 10);
  if (winner) {
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesCompleted: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesCompleted: sql`${schema.dailyStats.gamesCompleted} + 1`,
          updatedAt: now,
        },
      });
  } else {
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesFailed: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesFailed: sql`${schema.dailyStats.gamesFailed} + 1`,
          updatedAt: now,
        },
      });
  }

  // 7. Clean up KV state
  await deleteGameStateFromKV(env, gameId);

  return c.json({
    success: true,
    gameId,
    status: finalStatus,
    message: `Game ${gameId} repaired successfully`,
    stats: {
      events: events.length,
      rounds: maxRound,
      totalTokens,
      durationMs,
      winner,
    },
  });
});

/**
 * POST /api/admin/games/:id/complete - Mark a specific game as completed.
 * Useful for manually fixing games that finished but weren't persisted.
 */
admin.post('/games/:id/complete', async (c) => {
  const db = createDb(c.env.DB);
  const gameId = c.req.param('id');
  const { winner, rounds } = await c.req.json<{ winner: 'town' | 'mafia'; rounds: number }>();
  
  if (!winner || !['town', 'mafia'].includes(winner)) {
    throw Errors.BadRequest('Invalid winner. Must be "town" or "mafia"');
  }
  if (!rounds || rounds < 1) {
    throw Errors.BadRequest('Invalid rounds. Must be >= 1');
  }
  
  // Check if game exists
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }
  
  const now = new Date();
  
  try {
    await db
      .update(schema.games)
      .set({
        status: 'completed',
        winner,
        rounds,
        updatedAt: now,
      })
      .where(eq(schema.games.id, gameId));
    
    // Also update daily stats
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesCompleted: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesCompleted: sql`${schema.dailyStats.gamesCompleted} + 1`,
          updatedAt: now,
        },
      });
    
    return c.json({
      success: true,
      gameId,
      winner,
      rounds,
      message: `Game ${gameId} marked as completed (${winner} won in ${rounds} rounds)`,
    });
  } catch (error) {
    return c.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
});

/**
 * POST /api/admin/games/:id/restart - Restart a failed game with the same config.
 * Creates a new game with the same configuration and starts a new workflow.
 */
admin.post('/games/:id/restart', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  const oldGameId = c.req.param('id');
  
  // 1. Get the original game config
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, oldGameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }
  
  if (game.status !== 'failed') {
    throw Errors.BadRequest(`Game status is "${game.status}". Only failed games can be restarted.`);
  }

  // 2. Parse config from config_hash: "11-2-google/gemini-3-flash:2,anthropic/claude-opus-4.5:9"
  const configHash = game.configHash;
  const [_playerCount, ...teamParts] = configHash.split('-');
  const mafiaCountFromHash = parseInt(teamParts[0] ?? '0', 10);
  const teamsStr = teamParts.slice(1).join('-'); // Rejoin in case modelId has dashes
  
  // Parse teams: "google/gemini-3-flash:2,anthropic/claude-opus-4.5:9"
  const teamEntries = teamsStr.split(',');
  const teams: Array<{ modelId: string; team: 'mafia' | 'town'; count: number }> = [];
  
  let mafiaAssigned = 0;
  for (const entry of teamEntries) {
    const lastColon = entry.lastIndexOf(':');
    if (lastColon === -1) continue;
    const modelId = entry.slice(0, lastColon);
    const count = parseInt(entry.slice(lastColon + 1), 10);
    
    // Assign to mafia first, then town
    if (mafiaAssigned < mafiaCountFromHash) {
      const mafiaCount = Math.min(count, mafiaCountFromHash - mafiaAssigned);
      if (mafiaCount > 0) {
        teams.push({ modelId, team: 'mafia', count: mafiaCount });
        mafiaAssigned += mafiaCount;
      }
      const townCount = count - mafiaCount;
      if (townCount > 0) {
        teams.push({ modelId, team: 'town', count: townCount });
      }
    } else {
      teams.push({ modelId, team: 'town', count });
    }
  }

  // 3. Generate new game ID and trace ID
  const traceId = generateTraceId();
  const newGameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_restart`;
  const personaTheme = game.personaTheme ?? getRandomTheme();

  // 4. Start new workflow
  await env.MAFIA_WORKFLOW.create({
    id: newGameId,
    params: {
      gameId: newGameId,
      config: {
        playerCount: game.playerCount,
        mafiaCount: game.mafiaCount,
        teams,
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        personaTheme,
        discountPricing: game.discountPricing ?? false,
      },
      traceId,
      batchId: game.batchId ?? undefined,
    },
  });

  return c.json({
    success: true,
    originalGameId: oldGameId,
    newGameId,
    traceId,
    message: `Game restarted as ${newGameId}`,
    liveUrl: `https://mafia-arena.com/games/${newGameId}/live`,
  });
});

// =============================================================================
// DEAD LETTER QUEUE MANAGEMENT
// =============================================================================

/**
 * GET /api/admin/dlq - List failed messages in DLQ.
 */
admin.get('/dlq', async (c) => {
  const db = createDb(c.env.DB);
  const url = new URL(c.req.url);
  const status = (url.searchParams.get('status') || 'pending') as 'pending' | 'retried' | 'discarded';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const [entries, countResult] = await Promise.all([
    db
      .select()
      .from(schema.dlqEntries)
      .where(eq(schema.dlqEntries.status, status))
      .orderBy(desc(schema.dlqEntries.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.dlqEntries)
      .where(eq(schema.dlqEntries.status, status)),
  ]);

  const total = countResult[0]?.count ?? 0;

  return c.json({
    entries: entries.map(e => ({
      id: e.id,
      queueName: e.queueName,
      messageBody: e.messageBody,
      errorMessage: e.errorMessage,
      attempts: e.attempts,
      status: e.status,
      createdAt: e.createdAt,
      retriedAt: e.retriedAt,
    })),
    total,
    hasMore: offset + limit < total,
  });
});

/**
 * POST /api/admin/dlq/:id/retry - Re-queue a failed message.
 */
admin.post('/dlq/:id/retry', async (c) => {
  const db = createDb(c.env.DB);
  const dlqId = c.req.param('id');

  // Get the DLQ entry
  const entry = await db.query.dlqEntries.findFirst({
    where: eq(schema.dlqEntries.id, dlqId),
  });

  if (!entry || entry.status !== 'pending') {
    throw Errors.NotFound('DLQ entry');
  }

  const messageBody = entry.messageBody;

  // Re-queue based on queue type
  // Type assertion is safe here as we're restoring the message to its original queue
  if (entry.queueName === 'game-queue') {
    await c.env.GAME_QUEUE.send(messageBody as unknown as import('../types.js').GameQueueMessage);
  } else if (entry.queueName === 'batch-queue') {
    await c.env.BATCH_QUEUE.send(messageBody as unknown as import('../types.js').BatchQueueMessage);
  } else {
    throw Errors.BadRequest(`Unknown queue: ${entry.queueName}`);
  }

  // Mark as retried
  await db
    .update(schema.dlqEntries)
    .set({
      status: 'retried',
      retriedAt: new Date(),
    })
    .where(eq(schema.dlqEntries.id, dlqId));

  return c.json({
    success: true,
    message: `Message ${dlqId} re-queued to ${entry.queueName}`,
  });
});

/**
 * POST /api/admin/dlq/:id/discard - Mark a failed message as discarded.
 */
admin.post('/dlq/:id/discard', async (c) => {
  const db = createDb(c.env.DB);
  const dlqId = c.req.param('id');

  const entry = await db.query.dlqEntries.findFirst({
    where: eq(schema.dlqEntries.id, dlqId),
  });

  if (!entry || entry.status !== 'pending') {
    throw Errors.NotFound('DLQ entry');
  }

  await db
    .update(schema.dlqEntries)
    .set({ status: 'discarded' })
    .where(eq(schema.dlqEntries.id, dlqId));

  return c.json({
    success: true,
    message: `Message ${dlqId} discarded`,
  });
});

/**
 * GET /api/admin/dlq/stats - Get DLQ statistics.
 */
admin.get('/dlq/stats', async (c) => {
  const db = createDb(c.env.DB);
  
  const stats = await db
    .select({
      status: schema.dlqEntries.status,
      queue_name: schema.dlqEntries.queueName,
      count: sql<number>`count(*)`,
    })
    .from(schema.dlqEntries)
    .groupBy(schema.dlqEntries.status, schema.dlqEntries.queueName);

  const byStatus: Record<string, number> = {};
  const byQueue: Record<string, number> = {};

  for (const row of stats) {
    if (row.status) {
      byStatus[row.status] = (byStatus[row.status] || 0) + row.count;
    }
    byQueue[row.queue_name] = (byQueue[row.queue_name] || 0) + row.count;
  }

  return c.json({
    byStatus,
    byQueue,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
  });
});

// =============================================================================
// API KEY MANAGEMENT
// =============================================================================

/**
 * GET /api/admin/keys - Check status and balance of all configured API keys.
 * Returns masked key previews and balance info where available.
 * Results are cached for 5 minutes to avoid hammering provider APIs.
 */
admin.get('/keys', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const refresh = url.searchParams.get('refresh') === 'true';

  const CACHE_KEY = 'admin:keys:status';
  const CACHE_TTL = 300; // 5 minutes

  // Check cache unless refresh requested
  if (!refresh) {
    const cached = await env.RATE_LIMIT.get(CACHE_KEY);
    if (cached) {
      const data = JSON.parse(cached);
      return c.json({ ...data, cached: true });
    }
  }

  // Fetch fresh status from all providers
  const keys = await checkAllKeys(env);

  // Cache the results
  const response = {
    keys,
    checkedAt: Date.now(),
    cached: false,
  };

  await env.RATE_LIMIT.put(CACHE_KEY, JSON.stringify(response), {
    expirationTtl: CACHE_TTL,
  });

  return c.json(response);
});

// =============================================================================
// MODEL SYNC FROM OPENROUTER
// =============================================================================

/**
 * OpenRouter model response type.
 */
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

/**
 * GET /api/admin/models - List models in DB with routing configuration.
 */
admin.get('/models', async (c) => {
  const db = createDb(c.env.DB);

  const result = await db.query.models.findMany({
    orderBy: [schema.models.family, schema.models.displayName],
  });

  return c.json({
    models: result.map(m => ({
      id: m.id,
      family: m.family,
      display_name: m.displayName,
      // Routing configuration
      api_provider: m.apiProvider ?? 'openrouter',
      api_model_id: m.apiModelId,
      supports_batch_pricing: m.supportsBatchPricing ?? false,
      // ELO rating
      elo_rating: m.eloRating ?? 1500,
      elo_games_played: m.eloGamesPlayed ?? 0,
      // Pricing from config
      pricing: m.config?.pricing ?? null,
      context_length: m.config?.contextLength ?? null,
      created_at: m.createdAt,
    })),
    total: result.length,
  });
});

/**
 * POST /api/admin/models - Create a new model manually.
 * Useful for adding new models before they appear on OpenRouter.
 */
admin.post('/models', async (c) => {
  const db = createDb(c.env.DB);

  interface CreateModelRequest {
    id: string;
    display_name: string;
    family: string;
    api_provider: string;
    api_model_id?: string;
    supports_batch_pricing?: boolean;
    pricing?: { input: number; output: number }; // per 1M tokens
    context_length?: number;
  }

  let body: CreateModelRequest;
  try {
    body = await c.req.json<CreateModelRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Validate required fields
  if (!body.id || !body.display_name || !body.family || !body.api_provider) {
    throw Errors.BadRequest('Missing required fields: id, display_name, family, api_provider');
  }

  // Check if model already exists
  const existing = await db.query.models.findFirst({
    where: eq(schema.models.id, body.id),
  });

  if (existing) {
    throw Errors.BadRequest(`Model ${body.id} already exists`);
  }

  // Build config object
  const config: { contextLength?: number; pricing?: { inputPer1K: number; outputPer1K: number } } = {};
  if (body.context_length) {
    config.contextLength = body.context_length;
  }
  if (body.pricing) {
    // Convert per 1M to per 1K (divide by 1000)
    config.pricing = {
      inputPer1K: body.pricing.input / 1000,
      outputPer1K: body.pricing.output / 1000,
    };
  }

  // Insert new model
  await db.insert(schema.models).values({
    id: body.id,
    family: body.family,
    displayName: body.display_name,
    apiProvider: body.api_provider,
    apiModelId: body.api_model_id || body.id,
    supportsBatchPricing: body.supports_batch_pricing ?? false,
    config: Object.keys(config).length > 0 ? config : null,
  });

  return c.json({
    success: true,
    message: `Model ${body.id} created`,
    model: {
      id: body.id,
      family: body.family,
      display_name: body.display_name,
      api_provider: body.api_provider,
      api_model_id: body.api_model_id || body.id,
      supports_batch_pricing: body.supports_batch_pricing ?? false,
    },
  });
});

/**
 * PATCH /api/admin/models/:id - Update an existing model's configuration.
 * Note: Uses wildcard to support model IDs containing slashes (e.g., fireworks/deepseek-r1)
 */
admin.patch('/models/*', async (c) => {
  const db = createDb(c.env.DB);
  // Extract model ID from wildcard - handles IDs with slashes like "fireworks/deepseek-r1"
  const modelId = decodeURIComponent(c.req.param('*') || '');
  
  if (!modelId) {
    throw Errors.BadRequest('Model ID is required');
  }

  interface UpdateModelRequest {
    display_name?: string;
    api_provider?: string;
    api_model_id?: string;
    supports_batch_pricing?: boolean;
    pricing?: { input: number; output: number }; // per 1M tokens
    context_length?: number;
  }

  let body: UpdateModelRequest;
  try {
    body = await c.req.json<UpdateModelRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Get existing model
  const existing = await db.query.models.findFirst({
    where: eq(schema.models.id, modelId),
  });

  if (!existing) {
    throw Errors.NotFound('Model');
  }

  // Build update data
  const updateData: Partial<typeof schema.models.$inferInsert> = {};

  if (body.display_name !== undefined) {
    updateData.displayName = body.display_name;
  }
  if (body.api_provider !== undefined) {
    updateData.apiProvider = body.api_provider;
  }
  if (body.api_model_id !== undefined) {
    updateData.apiModelId = body.api_model_id;
  }
  if (body.supports_batch_pricing !== undefined) {
    updateData.supportsBatchPricing = body.supports_batch_pricing;
  }

  // Update pricing/context in config JSON if provided
  if (body.pricing !== undefined || body.context_length !== undefined) {
    const existingConfig = existing.config ?? {};
    const newConfig = { ...existingConfig };
    
    if (body.pricing) {
      newConfig.pricing = {
        inputPer1K: body.pricing.input / 1000,
        outputPer1K: body.pricing.output / 1000,
      };
    }
    if (body.context_length !== undefined) {
      newConfig.contextLength = body.context_length;
    }
    
    updateData.config = newConfig;
  }

  // Only update if there are changes
  if (Object.keys(updateData).length === 0) {
    return c.json({ success: true, message: 'No changes to apply' });
  }

  await db.update(schema.models)
    .set(updateData)
    .where(eq(schema.models.id, modelId));

  return c.json({
    success: true,
    message: `Model ${modelId} updated`,
  });
});

/**
 * POST /api/admin/models/sync - Sync models from OpenRouter to DB.
 * Fetches all models from OpenRouter and upserts them into the database.
 */
admin.post('/models/sync', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);

  // Fetch from OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter API error:', response.status, errorText);
    throw Errors.Internal('Failed to fetch models from OpenRouter');
  }

  const data = await response.json() as OpenRouterResponse;

  // Get existing models from DB
  const existing = await db
    .select({ id: schema.models.id })
    .from(schema.models);
  const existingIds = new Set(existing.map(m => m.id));

  // Track sync results
  const added: string[] = [];
  const updated: string[] = [];

  // Upsert each model
  for (const model of data.data) {
    // Extract provider from model ID (e.g., "google/gemini-2.5-pro" -> "google")
    const provider = model.id.split('/')[0] || 'unknown';
    
    // Normalize display name: strip redundant "Provider: " prefix since we store provider separately
    let displayName = model.name;
    const providerPrefixes = ['Google: ', 'Anthropic: ', 'OpenAI: ', 'Meta: ', 'Mistral: ', 'Microsoft: ', 'Xiaomi: ', 'DeepSeek: ', 'Qwen: '];
    for (const prefix of providerPrefixes) {
      if (displayName.startsWith(prefix)) {
        displayName = displayName.slice(prefix.length);
        break;
      }
    }
    
    // Store pricing in config JSON
    const config = {
      contextLength: model.context_length,
      pricing: {
        inputPer1K: parseFloat(model.pricing.prompt) * 1000,
        outputPer1K: parseFloat(model.pricing.completion) * 1000,
      },
    };

    if (existingIds.has(model.id)) {
      // Update existing model
      await db
        .update(schema.models)
        .set({
          displayName,
          family: provider,
          config,
        })
        .where(eq(schema.models.id, model.id));
      updated.push(model.id);
    } else {
      // Insert new model
      await db.insert(schema.models).values({
        id: model.id,
        family: provider,
        displayName,
        config,
        apiProvider: 'openrouter',
        apiModelId: model.id,
      });
      added.push(model.id);
    }
  }

  // Clear OpenRouter cache so next fetch gets fresh data
  await env.RATE_LIMIT.delete('openrouter:models');

  return c.json({
    success: true,
    added: added.length,
    updated: updated.length,
    skipped: 0,
    total: data.data.length,
    addedModels: added.slice(0, 20), // Return first 20 for display
    message: `Synced ${data.data.length} models from OpenRouter`,
  });
});

/**
 * DELETE /api/admin/models/:id - Remove a model from DB.
 * Note: Uses wildcard to support model IDs containing slashes (e.g., fireworks/deepseek-r1)
 */
admin.delete('/models/*', async (c) => {
  const db = createDb(c.env.DB);
  // Extract model ID from wildcard - handles IDs with slashes like "fireworks/deepseek-r1"
  const modelId = decodeURIComponent(c.req.param('*') || '');

  if (!modelId) {
    throw Errors.BadRequest('Model ID is required');
  }

  // Check if model exists
  const model = await db.query.models.findFirst({
    where: eq(schema.models.id, modelId),
  });

  if (!model) {
    throw Errors.NotFound('Model');
  }

  // Check if model has any game participation
  const participations = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.gameParticipants)
    .where(eq(schema.gameParticipants.modelId, modelId));

  if (participations[0] && participations[0].count > 0) {
    throw Errors.BadRequest(`Cannot delete model with ${participations[0].count} game participations`);
  }

  await db.delete(schema.models).where(eq(schema.models.id, modelId));

  return c.json({
    success: true,
    message: `Model ${modelId} deleted`,
  });
});

/**
 * POST /api/admin/elo/backfill - Backfill ELO ratings from historical games.
 * Recalculates ELO for all models based on completed games in chronological order.
 */
admin.post('/elo/backfill', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);

  // Get all completed games between different models, ordered chronologically
  // Filter: rounds > 1 excludes games that ended prematurely (setup failures, instant wins)
  const gamesResult = await db
    .select({
      id: schema.games.id,
      winner: schema.games.winner,
      created_at: schema.games.createdAt,
      mafia_model: sql<string>`mafia.model_id`,
      town_model: sql<string>`town.model_id`,
    })
    .from(schema.games)
    .innerJoin(
      sql`game_participants mafia`,
      sql`${schema.games.id} = mafia.game_id AND mafia.team = 'mafia'`
    )
    .innerJoin(
      sql`game_participants town`,
      sql`${schema.games.id} = town.game_id AND town.team = 'town'`
    )
    .where(
      sql`${schema.games.status} = 'completed'
        AND ${schema.games.rounds} > 1
        AND mafia.model_id != town.model_id
        AND mafia.model_id NOT LIKE 'test/%'
        AND town.model_id NOT LIKE 'test/%'`
    )
    .orderBy(schema.games.createdAt);

  const INITIAL_RATING = 1500;
  const ratings: Map<string, { rating: number; games: number; peak: number }> = new Map();

  function getOrCreate(modelId: string) {
    if (!ratings.has(modelId)) {
      ratings.set(modelId, { rating: INITIAL_RATING, games: 0, peak: INITIAL_RATING });
    }
    return ratings.get(modelId)!;
  }

  function getKFactor(games: number): number {
    if (games < 30) return 32;
    if (games < 100) return 24;
    return 16;
  }

  // Process each game chronologically
  for (const game of gamesResult) {
    const mafiaData = getOrCreate(game.mafia_model);
    const townData = getOrCreate(game.town_model);

    const mafiaK = getKFactor(mafiaData.games);
    const townK = getKFactor(townData.games);

    const mafiaExpected = 1 / (1 + Math.pow(10, (townData.rating - mafiaData.rating) / 400));
    const townExpected = 1 - mafiaExpected;

    const mafiaWon = game.winner === 'mafia';
    const mafiaActual = mafiaWon ? 1 : 0;
    const townActual = mafiaWon ? 0 : 1;

    // Update ratings
    mafiaData.rating = Math.round(mafiaData.rating + mafiaK * (mafiaActual - mafiaExpected));
    townData.rating = Math.round(townData.rating + townK * (townActual - townExpected));

    // Update games played
    mafiaData.games++;
    townData.games++;

    // Track peak
    mafiaData.peak = Math.max(mafiaData.peak, mafiaData.rating);
    townData.peak = Math.max(townData.peak, townData.rating);
  }

  // Update all models in the database using batch
  const updates: D1PreparedStatement[] = [];
  const now = Date.now();

  for (const [modelId, data] of ratings) {
    updates.push(
      env.DB.prepare(`
        UPDATE models SET 
          elo_rating = ?,
          elo_games_played = ?,
          elo_peak = ?,
          elo_updated_at = ?
        WHERE id = ?
      `).bind(data.rating, data.games, data.peak, now, modelId)
    );
  }

  // Use D1's native batch() for atomic execution of multiple updates
  // Note: Drizzle doesn't provide a batch equivalent; this is the recommended pattern
  if (updates.length > 0) {
    await env.DB.batch(updates);
  }

  return c.json({
    success: true,
    gamesProcessed: gamesResult.length,
    modelsUpdated: ratings.size,
    topRatings: Array.from(ratings.entries())
      .sort((a, b) => b[1].rating - a[1].rating)
      .slice(0, 10)
      .map(([id, data]) => ({ id, ...data })),
  });
});

// =============================================================================
// Maintenance Routes (Data Cleanup)
// =============================================================================

/**
 * POST /api/admin/maintenance/rebuild-leaderboard
 * Truncates and regenerates the leaderboard from game_participants source of truth.
 * This fixes data integrity issues like win% > 100%.
 */
admin.post('/maintenance/rebuild-leaderboard', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  
  try {
    // Step 1: Clear the corrupted table
    await db.delete(schema.leaderboard);
    
    // Step 2: Re-populate from source of truth (game_participants)
    // Use raw SQL for the complex INSERT ... SELECT
    // Filter: rounds > 1 excludes games that ended prematurely (setup failures, instant wins)
    const result = await env.DB.prepare(`
      INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens, updated_at)
      SELECT 
          gp.model_id,
          gp.team,
          COUNT(DISTINCT gp.game_id) as games_played,
          SUM(gp.won) as games_won,
          0 as total_tokens,
          unixepoch() * 1000
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE g.status = 'completed'
        AND g.rounds > 1
      GROUP BY gp.model_id, gp.team
    `).run();

    return c.json({ 
      success: true, 
      message: 'Leaderboard rebuilt from source of truth',
      rowsInserted: result.meta?.changes ?? 0,
    });
  } catch (error) {
    console.error('Failed to rebuild leaderboard:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

/**
 * POST /api/admin/maintenance/merge-model
 * Merges one model ID into another (consolidates duplicates).
 * Body: { fromId: string, toId: string }
 */
admin.post('/maintenance/merge-model', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  
  interface MergeRequest {
    fromId: string;
    toId: string;
  }
  
  let body: MergeRequest;
  try {
    body = await c.req.json<MergeRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }
  
  const { fromId, toId } = body;
  
  if (!fromId || !toId) {
    return c.json({ error: 'Missing fromId or toId' }, 400);
  }
  
  if (fromId === toId) {
    return c.json({ error: 'fromId and toId cannot be the same' }, 400);
  }

  try {
    // Verify target model exists
    const targetModel = await db.query.models.findFirst({
      where: eq(schema.models.id, toId),
    });
    
    if (!targetModel) {
      return c.json({ error: `Target model ${toId} does not exist` }, 404);
    }
    
    // Get count of records to migrate
    const participantCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.gameParticipants)
      .where(eq(schema.gameParticipants.modelId, fromId));
    
    // Execute the merge using batch for atomicity
    const statements = [
      // Move game participants to the new ID
      env.DB.prepare('UPDATE game_participants SET model_id = ? WHERE model_id = ?')
        .bind(toId, fromId),
      // Delete old leaderboard entries (will be regenerated)
      env.DB.prepare('DELETE FROM leaderboard WHERE model_id = ?')
        .bind(fromId),
      // Delete old model metadata
      env.DB.prepare('DELETE FROM models WHERE id = ?')
        .bind(fromId),
    ];
    
    // Use D1's native batch() for atomic merge operation
    // Note: Drizzle doesn't provide a batch equivalent; this is the recommended pattern
    await env.DB.batch(statements);

    return c.json({ 
      success: true, 
      message: `Merged ${fromId} into ${toId}`,
      recordsMigrated: participantCount[0]?.count ?? 0,
      note: 'Run rebuild-leaderboard and elo/backfill to update aggregates',
    });
  } catch (error) {
    console.error('Failed to merge models:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

/**
 * GET /api/admin/maintenance/find-duplicates
 * Finds models with similar display names that might be duplicates.
 */
admin.get('/maintenance/find-duplicates', async (c) => {
  const db = createDb(c.env.DB);
  
  try {
    // Get all models with their game counts
    const models = await db
      .select({
        id: schema.models.id,
        display_name: schema.models.displayName,
        provider: schema.models.family,
        total_games: sql<number>`COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0)`,
      })
      .from(schema.models)
      .leftJoin(schema.leaderboard, eq(schema.models.id, schema.leaderboard.modelId))
      .where(ne(schema.models.family, 'test'))
      .groupBy(schema.models.id)
      .orderBy(schema.models.displayName);
    
    // Group by display_name to find duplicates
    const byName: Record<string, typeof models> = {};
    for (const model of models) {
      const normalizedName = model.display_name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!byName[normalizedName]) {
        byName[normalizedName] = [];
      }
      byName[normalizedName].push(model);
    }
    
    // Filter to only show groups with duplicates
    const duplicates = Object.entries(byName)
      .filter(([, models]) => models.length > 1)
      .map(([, models]) => {
        const first = models[0]!;
        return {
          displayName: first.display_name,
          models: models.map(m => ({
            id: m.id,
            provider: m.provider,
            games: m.total_games,
          })),
          suggestedKeep: models.reduce((a, b) => a.total_games > b.total_games ? a : b).id,
        };
      });

    return c.json({ 
      success: true, 
      duplicateGroups: duplicates.length,
      duplicates,
    });
  } catch (error) {
    console.error('Failed to find duplicates:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

/**
 * GET /api/admin/maintenance/low-sample-models
 * Lists models with very few games (< 3) that could be hidden from leaderboard.
 */
admin.get('/maintenance/low-sample-models', async (c) => {
  const db = createDb(c.env.DB);
  
  try {
    const models = await db
      .select({
        id: schema.models.id,
        display_name: schema.models.displayName,
        provider: schema.models.family,
        total_games: sql<number>`COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0)`,
      })
      .from(schema.models)
      .leftJoin(schema.leaderboard, eq(schema.models.id, schema.leaderboard.modelId))
      .where(ne(schema.models.family, 'test'))
      .groupBy(schema.models.id)
      .having(sql`COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0) < 3 AND COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0) > 0`);

    return c.json({ 
      success: true, 
      count: models.length,
      models,
      note: 'These models have too few games for statistical significance',
    });
  } catch (error) {
    console.error('Failed to find low sample models:', error);
    return c.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});

export default admin;

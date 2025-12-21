/**
 * Admin API routes (protected by Basic Auth).
 */

import { Hono } from 'hono';
import type { Env, BatchConfig } from '../types.js';
import { Errors, generateTraceId } from '../utils/index.js';
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
      maxRounds: body.config.maxRounds ?? 10,
      discussionEnabled: body.config.discussionEnabled ?? true,
      personaConstraints: body.config.personaConstraints ?? 'moderate',
      contextLevel: body.config.contextLevel ?? 'summary',
      contextWindowSize: body.config.contextWindowSize ?? 3,
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
  const batchId = c.req.param('id');

  const batch = await getBatch(env, batchId);

  if (!batch) {
    throw Errors.NotFound('Batch');
  }

  // Get recent games from this batch (include error_message for debugging)
  const gamesResult = await env.DB.prepare(`
    SELECT id, status, winner, rounds, duration_ms, created_at, error_message
    FROM games
    WHERE batch_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(batchId).all();

  // Get recent error logs that might be related to this batch
  const errorLogsResult = await env.DB.prepare(`
    SELECT id, level, message, stack, context, created_at
    FROM error_log
    WHERE context LIKE ? OR context LIKE ?
    ORDER BY created_at DESC
    LIMIT 20
  `).bind(`%${batchId}%`, `%batch_id%${batchId}%`).all();

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
    recentGames: gamesResult.results,
    errorLogs: errorLogsResult.results,
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
      discussionEnabled: body.config.discussionEnabled ?? true,
      personaConstraints: 'moderate',
      contextLevel: body.config.contextLevel ?? 'summary',
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

  // Generate IDs and trace ID
  const traceId = generateTraceId();
  const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_live`;
  const batchId = `batch_${Date.now().toString(36)}_live`;

  // Pick random theme if not specified
  const personaTheme = config.personaTheme ?? getRandomTheme();

  // Get Durable Object instance and start game in background mode
  const id = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(id);

  console.log(`[${traceId}] Starting live game ${gameId} via admin panel`);

  const response = await stub.fetch('http://internal/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      batchId,
      config: {
        playerCount: config.playerCount,
        mafiaCount: config.mafiaCount,
        teams: config.teams,
        maxRounds: config.maxRounds ?? 10,
        discussionEnabled: config.discussionEnabled ?? true,
        personaConstraints: config.personaConstraints ?? 'moderate',
        contextLevel: config.contextLevel ?? 'summary',
        contextWindowSize: config.contextWindowSize ?? 3,
        personaTheme,
      },
      background: true, // Run in background mode for live streaming
      traceId,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error: string };
    throw Errors.Internal(error.error ?? 'Failed to start game');
  }

  const result = await response.json() as { 
    success: boolean; 
    gameId: string; 
    seed: number;
    status: string;
    liveUrl: string;
  };

  return c.json({
    success: true,
    gameId,
    batchId,
    seed: result.seed,
    status: result.status,
    liveUrl: `/games/${gameId}/live`,
    message: 'Game started. Redirect to live URL to watch progress.',
    traceId,
  });
});

/**
 * GET /api/admin/games/running - Get count of running/stale games.
 */
admin.get('/games/running', getRunningGamesCount);

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
  const gameId = c.req.param('id');
  const { reason } = await c.req.json<{ reason?: string }>();
  
  const now = Date.now();
  const errorMessage = reason || 'Manually marked as failed by admin';
  
  try {
    await c.env.DB.prepare(`
      UPDATE games 
      SET status = 'failed', 
          error_message = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(errorMessage, now, gameId).run();
    
    // Also update daily stats
    const today = new Date().toISOString().slice(0, 10);
    await c.env.DB.prepare(`
      INSERT INTO daily_stats (date, games_failed)
      VALUES (?, 1)
      ON CONFLICT (date) DO UPDATE SET
        games_failed = games_failed + 1,
        updated_at = unixepoch()
    `).bind(today).run();
    
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

// =============================================================================
// DEAD LETTER QUEUE MANAGEMENT
// =============================================================================

/**
 * GET /api/admin/dlq - List failed messages in DLQ.
 */
admin.get('/dlq', async (c) => {
  const url = new URL(c.req.url);
  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  const countResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM dlq_entries WHERE status = ?
  `).bind(status).first<{ count: number }>();

  const entries = await c.env.DB.prepare(`
    SELECT id, queue_name, message_body, error_message, attempts, status, created_at, retried_at
    FROM dlq_entries
    WHERE status = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).bind(status, limit, offset).all();

  return c.json({
    entries: entries.results.map((e: Record<string, unknown>) => ({
      id: e.id,
      queueName: e.queue_name,
      messageBody: JSON.parse(e.message_body as string),
      errorMessage: e.error_message,
      attempts: e.attempts,
      status: e.status,
      createdAt: e.created_at,
      retriedAt: e.retried_at,
    })),
    total: countResult?.count ?? 0,
    hasMore: offset + limit < (countResult?.count ?? 0),
  });
});

/**
 * POST /api/admin/dlq/:id/retry - Re-queue a failed message.
 */
admin.post('/dlq/:id/retry', async (c) => {
  const dlqId = c.req.param('id');

  // Get the DLQ entry
  const entry = await c.env.DB.prepare(`
    SELECT * FROM dlq_entries WHERE id = ? AND status = 'pending'
  `).bind(dlqId).first<{
    id: string;
    queue_name: string;
    message_body: string;
  }>();

  if (!entry) {
    throw Errors.NotFound('DLQ entry');
  }

  const messageBody = JSON.parse(entry.message_body);

  // Re-queue based on queue type
  if (entry.queue_name === 'game-queue') {
    await c.env.GAME_QUEUE.send(messageBody);
  } else if (entry.queue_name === 'batch-queue') {
    await c.env.BATCH_QUEUE.send(messageBody);
  } else {
    throw Errors.BadRequest(`Unknown queue: ${entry.queue_name}`);
  }

  // Mark as retried
  await c.env.DB.prepare(`
    UPDATE dlq_entries SET status = 'retried', retried_at = ? WHERE id = ?
  `).bind(Math.floor(Date.now() / 1000), dlqId).run();

  return c.json({
    success: true,
    message: `Message ${dlqId} re-queued to ${entry.queue_name}`,
  });
});

/**
 * POST /api/admin/dlq/:id/discard - Mark a failed message as discarded.
 */
admin.post('/dlq/:id/discard', async (c) => {
  const dlqId = c.req.param('id');

  const result = await c.env.DB.prepare(`
    UPDATE dlq_entries SET status = 'discarded' WHERE id = ? AND status = 'pending'
  `).bind(dlqId).run();

  if (result.meta.changes === 0) {
    throw Errors.NotFound('DLQ entry');
  }

  return c.json({
    success: true,
    message: `Message ${dlqId} discarded`,
  });
});

/**
 * GET /api/admin/dlq/stats - Get DLQ statistics.
 */
admin.get('/dlq/stats', async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT 
      status,
      COUNT(*) as count,
      queue_name
    FROM dlq_entries
    GROUP BY status, queue_name
  `).all<{ status: string; count: number; queue_name: string }>();

  const byStatus: Record<string, number> = {};
  const byQueue: Record<string, number> = {};

  for (const row of stats.results) {
    byStatus[row.status] = (byStatus[row.status] || 0) + row.count;
    byQueue[row.queue_name] = (byQueue[row.queue_name] || 0) + row.count;
  }

  return c.json({
    byStatus,
    byQueue,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
  });
});

export default admin;


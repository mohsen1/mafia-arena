/**
 * Admin API routes (protected by Basic Auth).
 */

import { Hono } from 'hono';
import type { Env, BatchConfig } from '../types.js';
import { Errors } from '../utils/errors.js';
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

export default admin;


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
      maxRounds: 10,
      discussionEnabled: true,
      personaConstraints: 'moderate',
      contextLevel: 'windowed', // Optimized default: reduces token usage vs 'full'
      contextWindowSize: 3,
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
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        contextLevel: 'windowed', // Optimized default: reduces token usage vs 'full'
        contextWindowSize: 3,
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

/**
 * POST /api/admin/games/:id/complete - Mark a specific game as completed.
 * Useful for manually fixing games that finished but weren't persisted.
 */
admin.post('/games/:id/complete', async (c) => {
  const gameId = c.req.param('id');
  const { winner, rounds } = await c.req.json<{ winner: 'town' | 'mafia'; rounds: number }>();
  
  if (!winner || !['town', 'mafia'].includes(winner)) {
    return c.json({ success: false, error: 'Invalid winner. Must be "town" or "mafia"' }, { status: 400 });
  }
  if (!rounds || rounds < 1) {
    return c.json({ success: false, error: 'Invalid rounds. Must be >= 1' }, { status: 400 });
  }
  
  const now = Date.now();
  
  try {
    await c.env.DB.prepare(`
      UPDATE games 
      SET status = 'completed', 
          winner = ?,
          rounds = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(winner, rounds, now, gameId).run();
    
    // Also update daily stats
    const today = new Date().toISOString().slice(0, 10);
    await c.env.DB.prepare(`
      INSERT INTO daily_stats (date, games_completed)
      VALUES (?, 1)
      ON CONFLICT (date) DO UPDATE SET
        games_completed = games_completed + 1,
        updated_at = unixepoch()
    `).bind(today).run();
    
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
 * GET /api/admin/models - List models in DB with sync status.
 */
admin.get('/models', async (c) => {
  const env = c.env;

  const result = await env.DB.prepare(`
    SELECT id, provider, display_name, config, created_at
    FROM models
    ORDER BY provider, display_name
  `).all<{
    id: string;
    provider: string;
    display_name: string;
    config: string | null;
    created_at: number;
  }>();

  return c.json({
    models: result.results,
    total: result.results.length,
  });
});

/**
 * POST /api/admin/models/sync - Sync models from OpenRouter to DB.
 * Fetches all models from OpenRouter and upserts them into the database.
 */
admin.post('/models/sync', async (c) => {
  const env = c.env;

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
  const existing = await env.DB.prepare('SELECT id FROM models').all<{ id: string }>();
  const existingIds = new Set(existing.results.map(m => m.id));

  // Track sync results
  const added: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  // Upsert each model
  for (const model of data.data) {
    // Extract provider from model ID (e.g., "google/gemini-2.5-pro" -> "google")
    const provider = model.id.split('/')[0] || 'unknown';
    
    // Store pricing in config JSON
    const config = JSON.stringify({
      contextLength: model.context_length,
      pricing: {
        inputPer1K: parseFloat(model.pricing.prompt) * 1000,
        outputPer1K: parseFloat(model.pricing.completion) * 1000,
      },
    });

    if (existingIds.has(model.id)) {
      // Update existing model
      await env.DB.prepare(`
        UPDATE models 
        SET display_name = ?, provider = ?, config = ?
        WHERE id = ?
      `).bind(model.name, provider, config, model.id).run();
      updated.push(model.id);
    } else {
      // Insert new model
      await env.DB.prepare(`
        INSERT INTO models (id, provider, display_name, config)
        VALUES (?, ?, ?, ?)
      `).bind(model.id, provider, model.name, config).run();
      added.push(model.id);
    }
  }

  // Clear OpenRouter cache so next fetch gets fresh data
  await env.RATE_LIMIT.delete('openrouter:models');

  return c.json({
    success: true,
    added: added.length,
    updated: updated.length,
    skipped: skipped.length,
    total: data.data.length,
    addedModels: added.slice(0, 20), // Return first 20 for display
    message: `Synced ${data.data.length} models from OpenRouter`,
  });
});

/**
 * DELETE /api/admin/models/:id - Remove a model from DB.
 */
admin.delete('/models/:id', async (c) => {
  const modelId = c.req.param('id');

  // Check if model has any game participation
  const participations = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM game_participants WHERE model_id = ?
  `).bind(modelId).first<{ count: number }>();

  if (participations && participations.count > 0) {
    throw Errors.BadRequest(`Cannot delete model with ${participations.count} game participations`);
  }

  await c.env.DB.prepare('DELETE FROM models WHERE id = ?').bind(modelId).run();

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

  // Get all completed games between different models, ordered chronologically
  const gamesResult = await env.DB.prepare(`
    SELECT 
      g.id,
      g.winner,
      g.created_at,
      mafia.model_id as mafia_model,
      town.model_id as town_model
    FROM games g
    JOIN game_participants mafia ON g.id = mafia.game_id AND mafia.team = 'mafia'
    JOIN game_participants town ON g.id = town.game_id AND town.team = 'town'
    WHERE g.status = 'completed'
      AND mafia.model_id != town.model_id
      AND mafia.model_id NOT LIKE 'test/%'
      AND town.model_id NOT LIKE 'test/%'
    ORDER BY g.created_at ASC
  `).all<{
    id: string;
    winner: 'mafia' | 'town';
    created_at: number;
    mafia_model: string;
    town_model: string;
  }>();

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
  for (const game of gamesResult.results) {
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

  // Update all models in the database
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

  if (updates.length > 0) {
    await env.DB.batch(updates);
  }

  return c.json({
    success: true,
    gamesProcessed: gamesResult.results.length,
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
  
  try {
    // Step 1: Clear the corrupted table
    await env.DB.prepare('DELETE FROM leaderboard').run();
    
    // Step 2: Re-populate from source of truth (game_participants)
    const result = await env.DB.prepare(`
      INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens, updated_at)
      SELECT 
          gp.model_id,
          gp.team,
          COUNT(DISTINCT gp.game_id) as games_played,
          SUM(gp.won) as games_won,
          0 as total_tokens,
          unixepoch()
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE g.status = 'completed'
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
    const targetModel = await env.DB.prepare('SELECT id FROM models WHERE id = ?')
      .bind(toId).first();
    
    if (!targetModel) {
      return c.json({ error: `Target model ${toId} does not exist` }, 404);
    }
    
    // Get count of records to migrate
    const participantCount = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM game_participants WHERE model_id = ?'
    ).bind(fromId).first<{ count: number }>();
    
    // Execute the merge
    const statements = [
      // Move game participants to the new ID
      env.DB.prepare('UPDATE game_participants SET model_id = ? WHERE model_id = ?')
        .bind(toId, fromId),
      // Delete old leaderboard entries (will be regenerated)
      env.DB.prepare('DELETE FROM leaderboard WHERE model_id = ?')
        .bind(fromId),
      // Update ELO ratings table if exists
      env.DB.prepare('DELETE FROM elo_ratings WHERE model_id = ?')
        .bind(fromId),
      // Delete old model metadata
      env.DB.prepare('DELETE FROM models WHERE id = ?')
        .bind(fromId),
    ];
    
    await env.DB.batch(statements);

    return c.json({ 
      success: true, 
      message: `Merged ${fromId} into ${toId}`,
      recordsMigrated: participantCount?.count ?? 0,
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
  const env = c.env;
  
  try {
    // Get all models with their game counts
    const models = await env.DB.prepare(`
      SELECT 
        m.id,
        m.display_name,
        m.provider,
        COALESCE(SUM(l.games_played), 0) as total_games
      FROM models m
      LEFT JOIN leaderboard l ON m.id = l.model_id
      WHERE m.provider != 'test'
      GROUP BY m.id
      ORDER BY m.display_name, total_games DESC
    `).all<{ id: string; display_name: string; provider: string; total_games: number }>();
    
    // Group by display_name to find duplicates
    const byName: Record<string, typeof models.results> = {};
    for (const model of models.results) {
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
        const first = models[0]!; // Safe: filtered to length > 1
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
  const env = c.env;
  
  try {
    const models = await env.DB.prepare(`
      SELECT 
        m.id,
        m.display_name,
        m.provider,
        COALESCE(SUM(l.games_played), 0) as total_games
      FROM models m
      LEFT JOIN leaderboard l ON m.id = l.model_id
      WHERE m.provider != 'test'
      GROUP BY m.id
      HAVING total_games < 3 AND total_games > 0
      ORDER BY total_games DESC
    `).all<{ id: string; display_name: string; provider: string; total_games: number }>();

    return c.json({ 
      success: true, 
      count: models.results.length,
      models: models.results,
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


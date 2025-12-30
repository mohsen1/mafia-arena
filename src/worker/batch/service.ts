/**
 * Batch processing service.
 * Handles creating, tracking, and managing large game batches.
 */

import type {
  Env,
  BatchConfig,
  BatchRecord,
  BatchStatus,
  GameQueueMessage,
  GameQueueConfig,
  CostEstimate,
  AdminStats,
  SystemState,
  BatchQueueMessage,
} from '../types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

import { DEFAULT_PRICING } from '../ai/models.js';
import { getRandomTheme } from '../utils/random-config.js';

/** Maximum games per batch */
export const MAX_BATCH_SIZE = 10_000;

/** Average tokens per game (empirical estimate from production data)
 * Actual average is ~550K tokens but varies wildly by model and game length.
 * Using 300K as a conservative estimate for cost predictions.
 */
const TOKENS_PER_GAME = 300_000;

/** Average game duration in seconds */
const SECONDS_PER_GAME = 45;

// =============================================================================
// BATCH CRUD OPERATIONS
// =============================================================================

/**
 * Create a new batch and queue it for processing.
 */
export async function createBatch(
  env: Env,
  config: BatchConfig
): Promise<{ batchId: string; estimatedCost: number }> {
  // Validate batch size
  if (config.totalGames < 1 || config.totalGames > MAX_BATCH_SIZE) {
    throw new Error(`Batch size must be between 1 and ${MAX_BATCH_SIZE}`);
  }

  // Generate batch ID
  const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Estimate cost
  const estimate = estimateCost(config);

  // Insert batch record
  await env.DB.prepare(`
    INSERT INTO batches (id, name, status, total_games, config_json, estimated_cost_usd, created_by)
    VALUES (?, ?, 'queued', ?, ?, ?, ?)
  `).bind(
    batchId,
    config.name ?? `Batch ${new Date().toISOString().slice(0, 10)}`,
    config.totalGames,
    JSON.stringify(config),
    estimate.estimatedCostUsd,
    config.createdBy ?? 'api'
  ).run();

  // Queue the batch for processing
  await env.BATCH_QUEUE.send({
    batchId,
    config,
    createdAt: Date.now(),
  });

  return { batchId, estimatedCost: estimate.estimatedCostUsd };
}

/**
 * Get a batch by ID with progress info.
 */
export async function getBatch(
  env: Env,
  batchId: string
): Promise<BatchRecord | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM batches WHERE id = ?
  `).bind(batchId).first<BatchRecord>();

  return result;
}

/**
 * List batches with pagination.
 */
export async function listBatches(
  env: Env,
  options: { status?: BatchStatus; limit?: number; offset?: number } = {}
): Promise<{ batches: BatchRecord[]; total: number }> {
  const { status, limit = 20, offset = 0 } = options;

  let countQuery = 'SELECT COUNT(*) as count FROM batches';
  let listQuery = 'SELECT * FROM batches';
  const params: (string | number)[] = [];

  if (status) {
    countQuery += ' WHERE status = ?';
    listQuery += ' WHERE status = ?';
    params.push(status);
  }

  listQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const countResult = await env.DB.prepare(countQuery)
    .bind(...params)
    .first<{ count: number }>();

  const listResult = await env.DB.prepare(listQuery)
    .bind(...params, limit, offset)
    .all<BatchRecord>();

  return {
    batches: listResult.results,
    total: countResult?.count ?? 0,
  };
}

/**
 * Update batch status.
 */
export async function updateBatchStatus(
  env: Env,
  batchId: string,
  status: BatchStatus,
  errorMessage?: string
): Promise<void> {
  const updates: string[] = ['status = ?'];
  const params: (string | number | null)[] = [status];

  if (status === 'processing') {
    updates.push('started_at = ?');
    params.push(Math.floor(Date.now() / 1000));
  }

  if (status === 'completed' || status === 'cancelled') {
    updates.push('completed_at = ?');
    params.push(Math.floor(Date.now() / 1000));
  }

  if (errorMessage) {
    updates.push('error_message = ?');
    params.push(errorMessage);
  }

  params.push(batchId);

  await env.DB.prepare(`
    UPDATE batches SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run();
}

/**
 * Increment batch progress counters.
 */
export async function incrementBatchProgress(
  env: Env,
  batchId: string,
  completed: number = 0,
  failed: number = 0,
  costUsd: number = 0
): Promise<void> {
  await env.DB.prepare(`
    UPDATE batches 
    SET completed_games = completed_games + ?,
        failed_games = failed_games + ?,
        actual_cost_usd = actual_cost_usd + ?
    WHERE id = ?
  `).bind(completed, failed, costUsd, batchId).run();

  // Check if batch is complete
  const batch = await getBatch(env, batchId);
  if (batch && batch.completed_games + batch.failed_games >= batch.total_games) {
    await updateBatchStatus(env, batchId, 'completed');
  }
}

/**
 * Cancel a batch.
 */
export async function cancelBatch(env: Env, batchId: string): Promise<void> {
  await updateBatchStatus(env, batchId, 'cancelled');
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/** Checkpoint interval - save progress every N games queued */
const CHECKPOINT_INTERVAL = 50;

/**
 * Process a batch message - split into individual game messages.
 * 
 * Supports checkpoint/resume: If worker crashes mid-batch, it will resume
 * from games_queued instead of starting from 0 (preventing duplicate games).
 * 
 * Preserves traceId from the batch message for distributed tracing.
 */
export async function processBatchMessage(
  env: Env,
  batchId: string,
  config: BatchConfig,
  traceId?: string
): Promise<void> {
  // Check system state
  const systemState = await getSystemState(env);
  if (systemState.processingPaused) {
    // Re-queue with delay, preserving traceId
    const msg: BatchQueueMessage = { batchId, config, createdAt: Date.now() };
    if (traceId) msg.traceId = traceId;
    await env.BATCH_QUEUE.send(msg, { delaySeconds: 60 });
    return;
  }

  // Get current checkpoint (how many games already queued)
  const batch = await getBatch(env, batchId);
  if (!batch) {
    console.error(`[${traceId || 'no-trace'}] Batch ${batchId} not found, skipping`);
    return;
  }

  // Check if batch was cancelled or failed while in queue (race condition protection)
  if (batch.status === 'cancelled' || batch.status === 'failed') {
    console.log(`[${traceId || 'no-trace'}] Batch ${batchId} is ${batch.status}, skipping processing`);
    return;
  }

  const startIndex = batch.games_queued;
  const totalGames = config.totalGames;

  // Already fully queued? This shouldn't happen but handle gracefully
  if (startIndex >= totalGames) {
    console.log(`[${traceId || 'no-trace'}] Batch ${batchId} already fully queued (${startIndex}/${totalGames})`);
    return;
  }

  console.log(`[${traceId || 'no-trace'}] Processing batch ${batchId}: queuing games ${startIndex + 1}-${totalGames} (${totalGames - startIndex} remaining)`);

  // Update batch status to processing (if not already)
  if (batch.status === 'queued') {
    await updateBatchStatus(env, batchId, 'processing');
  }

  // Split into individual game messages, starting from checkpoint
  const messages: MessageSendRequest<GameQueueMessage>[] = [];

  for (let i = startIndex; i < totalGames; i++) {
    // IMPORTANT: Use deterministic IDs to prevent duplicate games on queue retry.
    // If the worker crashes mid-batch and retries, same batchId + index = same gameId.
    const gameId = `${batchId}_game_${String(i).padStart(5, '0')}`;

    // Each game gets a random theme for variety
    // Note: Theme is still random per game, but gameId is deterministic
    const gameConfig: GameQueueConfig = {
      ...config.gameConfig,
      personaTheme: config.gameConfig.personaTheme ?? getRandomTheme(),
    };

    const gameMessage: GameQueueMessage = {
      gameId,
      batchId,
      config: gameConfig,
      createdAt: Date.now(),
    };
    
    // Propagate traceId to individual games
    if (traceId) {
      gameMessage.traceId = traceId;
    }
    
    // Propagate user's encrypted API keys to individual games (for non-admin batches)
    if (config.encryptedUserKeys) {
      gameMessage.encryptedUserKeys = config.encryptedUserKeys;
    }

    messages.push({ body: gameMessage });

    // Send in batches of 100 to avoid hitting queue limits
    if (messages.length >= 100) {
      await env.GAME_QUEUE.sendBatch(messages);
      messages.length = 0;
      
      // Checkpoint every CHECKPOINT_INTERVAL games (within the 100-batch sends)
      const gamesQueued = i + 1;
      if (gamesQueued % CHECKPOINT_INTERVAL === 0 || gamesQueued === totalGames) {
        await updateGamesQueued(env, batchId, gamesQueued);
      }
    }
  }

  // Send remaining messages and final checkpoint
  if (messages.length > 0) {
    await env.GAME_QUEUE.sendBatch(messages);
  }
  await updateGamesQueued(env, batchId, totalGames);

  console.log(`[${traceId || 'no-trace'}] Batch ${batchId} fully queued: ${totalGames} games`);
}

/**
 * Update the games_queued checkpoint for a batch.
 */
async function updateGamesQueued(env: Env, batchId: string, count: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE batches SET games_queued = ? WHERE id = ?
  `).bind(count, batchId).run();
}

// =============================================================================
// COST ESTIMATION
// =============================================================================

/**
 * Estimate the cost of a batch.
 */
export function estimateCost(config: BatchConfig): CostEstimate {
  const { totalGames, gameConfig, useBatchAPI = false } = config;

  // Estimate tokens per game based on player count and settings
  // Personas are always enabled (1.2x base multiplier)
  let tokensMultiplier = 1.2;
  if (gameConfig.discussionEnabled) tokensMultiplier *= 1.5;
  if (gameConfig.contextLevel === 'full') tokensMultiplier *= 2;

  const tokensPerGame = Math.round(TOKENS_PER_GAME * tokensMultiplier);
  const totalTokens = tokensPerGame * totalGames;

  // Use default pricing - model-specific pricing is in DB
  // For accurate estimates, pricing could be fetched from DB at runtime
  const baseCostPer1k = (DEFAULT_PRICING.input * 0.7 + DEFAULT_PRICING.output * 0.3);
  
  // Apply batch discount if requested (50% off)
  const avgCostPer1k = useBatchAPI ? baseCostPer1k * 0.5 : baseCostPer1k;

  const estimatedCostUsd = (totalTokens / 1000) * avgCostPer1k;

  // Estimate time
  const timeEstimateMinutes = Math.ceil((totalGames * SECONDS_PER_GAME) / 60);

  return {
    estimatedCostUsd,
    tokensPerGame,
    totalTokens,
    timeEstimateMinutes,
    useBatchAPI,
    savings: useBatchAPI ? estimatedCostUsd : 0, // Savings vs non-batch
  };
}

// =============================================================================
// SYSTEM STATE (CIRCUIT BREAKER)
// =============================================================================

/**
 * Get current system state.
 * Uses KV for fast reads with D1 fallback for reliability.
 */
export async function getSystemState(env: Env): Promise<SystemState> {
  let isPaused: string | null = null;
  
  // Try KV first for fast circuit breaker state
  try {
    isPaused = await env.RATE_LIMIT.get('SYSTEM_PAUSED');
  } catch (kvError) {
    console.warn('KV read failed for SYSTEM_PAUSED, falling back to D1:', kvError);
  }

  // Get other settings from D1 (and fallback pause state if KV failed)
  const keysToFetch = isPaused === null 
    ? ['max_concurrent_games', 'processing_paused'] 
    : ['max_concurrent_games'];
  
  const placeholders = keysToFetch.map(() => '?').join(',');
  const settings = await env.DB.prepare(`
    SELECT key, value FROM system_state WHERE key IN (${placeholders})
  `).bind(...keysToFetch).all<{ key: string; value: string }>();

  const settingsMap = new Map(settings.results.map(s => [s.key, s.value]));

  // Use KV value if available, otherwise fall back to D1
  const processingPaused = isPaused !== null 
    ? isPaused === 'true' 
    : settingsMap.get('processing_paused') === 'true';

  return {
    processingPaused,
    maxConcurrentGames: parseInt(settingsMap.get('max_concurrent_games') ?? '50', 10),
  };
}

/**
 * Pause all processing.
 */
export async function pauseProcessing(env: Env): Promise<void> {
  await env.RATE_LIMIT.put('SYSTEM_PAUSED', 'true');
  await env.DB.prepare(`
    UPDATE system_state SET value = 'true', updated_at = unixepoch() WHERE key = 'processing_paused'
  `).run();
}

/**
 * Resume processing.
 */
export async function resumeProcessing(env: Env): Promise<void> {
  await env.RATE_LIMIT.put('SYSTEM_PAUSED', 'false');
  await env.DB.prepare(`
    UPDATE system_state SET value = 'false', updated_at = unixepoch() WHERE key = 'processing_paused'
  `).run();
}

/**
 * Get live admin statistics.
 */
export async function getAdminStats(env: Env): Promise<AdminStats> {
  const systemState = await getSystemState(env);

  // Get batch stats
  const batchStats = await env.DB.prepare(`
    SELECT 
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'processing' THEN total_games - completed_games - failed_games ELSE 0 END) as queued
    FROM batches
  `).first<{ active: number; queued: number }>();

  // Get running games count from D1
  const runningGames = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM games WHERE status = 'running'
  `).first<{ count: number }>();

  // Get today's cost
  const today = new Date().toISOString().slice(0, 10);
  const dailyStats = await env.DB.prepare(`
    SELECT cost_usd FROM daily_stats WHERE date = ?
  `).bind(today).first<{ cost_usd: number }>();

  const costToday = dailyStats?.cost_usd ?? 0;

  return {
    gamesRunning: runningGames?.count ?? 0,
    gamesQueued: batchStats?.queued ?? 0,
    batchesActive: batchStats?.active ?? 0,
    costToday,
    systemPaused: systemState.processingPaused,
  };
}

// =============================================================================
// DAILY STATS
// =============================================================================

/**
 * Update daily statistics.
 */
export async function updateDailyStats(
  env: Env,
  data: {
    gamesCompleted?: number;
    gamesFailed?: number;
    tokensUsed?: number;
    costUsd?: number;
    mafiaWins?: number;
    townWins?: number;
  }
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  await env.DB.prepare(`
    INSERT INTO daily_stats (date, games_completed, games_failed, tokens_used, cost_usd, mafia_wins, town_wins)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (date) DO UPDATE SET
      games_completed = games_completed + excluded.games_completed,
      games_failed = games_failed + excluded.games_failed,
      tokens_used = tokens_used + excluded.tokens_used,
      cost_usd = cost_usd + excluded.cost_usd,
      mafia_wins = mafia_wins + excluded.mafia_wins,
      town_wins = town_wins + excluded.town_wins,
      updated_at = unixepoch()
  `).bind(
    today,
    data.gamesCompleted ?? 0,
    data.gamesFailed ?? 0,
    data.tokensUsed ?? 0,
    data.costUsd ?? 0,
    data.mafiaWins ?? 0,
    data.townWins ?? 0
  ).run();
}


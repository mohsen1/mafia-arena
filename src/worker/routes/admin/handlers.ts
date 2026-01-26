/**
 * Core route handlers for admin API.
 */

import type { Context } from 'hono';
import type { Env } from '../../types.js';
import { eq, desc, sql } from 'drizzle-orm';
import { Errors } from '../../utils/index.js';
import {
  pauseProcessing,
  resumeProcessing,
  getAdminStats,
  estimateCost,
} from '../../batch/index.js';
import { checkAllKeys } from '../../utils/index.js';
import { createDb } from '../../db/drizzle.js';
import * as schema from '../../db/schema.js';
import type { EstimateRequest } from './validation.js';
import { GAME } from '../../config/constants.js';

// =============================================================================
// SYSTEM CONTROL HANDLERS
// =============================================================================

export async function handlePauseProcessing(c: Context<{ Bindings: Env }>) {
  await pauseProcessing(c.env);

  return c.json({
    success: true,
    message: 'System processing paused',
  });
}

export async function handleResumeProcessing(c: Context<{ Bindings: Env }>) {
  await resumeProcessing(c.env);

  return c.json({
    success: true,
    message: 'System processing resumed',
  });
}

export async function handleGetLiveStats(c: Context<{ Bindings: Env }>) {
  const stats = await getAdminStats(c.env);
  return c.json(stats);
}

export async function handleEstimateCost(c: Context<{ Bindings: Env }>) {
  let body: EstimateRequest;
  try {
    body = await c.req.json<EstimateRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  const estimate = await estimateCost(c.env, {
    totalGames: body.totalGames,
    gameConfig: {
      playerCount: body.config.playerCount,
      mafiaCount: body.config.mafiaCount,
      teams: body.config.teams,
      maxRounds: GAME.DEFAULT_MAX_ROUNDS,
      discussionEnabled: true,
      personaConstraints: 'moderate',
      contextLevel: 'windowed',
      contextWindowSize: GAME.CONTEXT_WINDOW_SIZE,
    },
    useBatchAPI: body.useBatchAPI ?? false,
  });

  return c.json(estimate);
}

// =============================================================================
// DEAD LETTER QUEUE HANDLERS
// =============================================================================

export async function handleGetDLQ(c: Context<{ Bindings: Env }>) {
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
}

export async function handleRetryDLQ(c: Context<{ Bindings: Env }>) {
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
  if (entry.queueName === 'game-queue') {
    await c.env.GAME_QUEUE.send(messageBody as unknown as import('../../types.js').GameQueueMessage);
  } else if (entry.queueName === 'batch-queue') {
    await c.env.BATCH_QUEUE.send(messageBody as unknown as import('../../types.js').BatchQueueMessage);
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
}

export async function handleDiscardDLQ(c: Context<{ Bindings: Env }>) {
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
}

export async function handleGetDLQStats(c: Context<{ Bindings: Env }>) {
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
}

// =============================================================================
// API KEY MANAGEMENT HANDLERS
// =============================================================================

export async function handleGetKeys(c: Context<{ Bindings: Env }>) {
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
}

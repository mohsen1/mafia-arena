/**
 * Mafia Arena - Cloudflare Worker Entry Point
 *
 * Uses Hono for clean routing and modular route handlers.
 * Handles HTTP requests and queue messages for the Mafia Arena platform.
 */

import { Hono } from 'hono';
import type { Env, GameQueueMessage, BatchQueueMessage } from './types.js';
import { APIError, Errors, logError } from './utils/index.js';
import { corsMiddleware, rateLimitMiddleware } from './middleware/index.js';
import {
  gamesRoutes,
  leaderboardRoutes,
  modelsRoutes,
  statsRoutes,
  analysisRoutes,
  adminRoutes,
  authRoutes,
  keysRoutes,
  batchesRoutes,
  blogRoutes,
  externalWorkersRoutes,
} from './routes/index.js';
import {
  processBatchMessage,
  getSystemState,
  incrementBatchProgress,
  updateDailyStats,
  BatchService,
  registerAvailableProviders,
} from './batch/index.js';

// Re-export the Durable Object
export { GameRunner } from './GameRunner.js';

// Re-export the Workflow
export { MafiaWorkflow } from './workflows/index.js';

// Create Hono app with typed bindings
const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', corsMiddleware);

// Rate limiting for API routes
app.use('/api/*', rateLimitMiddleware);

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'mafia-arena' }));
app.get('/health', (c) => c.json({ status: 'ok', service: 'mafia-arena' }));

// Deep health check - verifies all infrastructure components
app.get('/health/deep', async (c) => {
  const startTime = Date.now();
  
  const checks = await Promise.allSettled([
    // D1 Database
    c.env.DB.prepare('SELECT 1 as ok').first(),
    // R2 Storage (head request is cheap)
    c.env.TRANSCRIPTS.head('health-check'),
    // KV (get non-existent key is cheap)
    c.env.RATE_LIMIT.get('health-check'),
  ]);

  const d1Status = checks[0].status === 'fulfilled' ? 'ok' : 'error';
  const r2Status = checks[1].status === 'fulfilled' ? 'ok' : 'error';
  const kvStatus = checks[2].status === 'fulfilled' ? 'ok' : 'error';

  const allHealthy = d1Status === 'ok' && r2Status === 'ok' && kvStatus === 'ok';

  const response = {
    status: allHealthy ? 'healthy' : 'degraded',
    latencyMs: Date.now() - startTime,
    components: {
      d1: {
        status: d1Status,
        error: checks[0].status === 'rejected' ? String(checks[0].reason) : undefined,
      },
      r2: {
        status: r2Status,
        error: checks[1].status === 'rejected' ? String(checks[1].reason) : undefined,
      },
      kv: {
        status: kvStatus,
        error: checks[2].status === 'rejected' ? String(checks[2].reason) : undefined,
      },
    },
    timestamp: new Date().toISOString(),
  };

  return c.json(response, { status: allHealthy ? 200 : 503 });
});

// Mount route handlers
app.route('/api/games', gamesRoutes);
app.route('/api/leaderboard', leaderboardRoutes);
app.route('/api/models', modelsRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/analysis', analysisRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/auth/keys', keysRoutes);
app.route('/api/auth/external-workers', externalWorkersRoutes);
app.route('/api/batches', batchesRoutes);
app.route('/api/blog', blogRoutes);

// Global error handler
app.onError(async (error, c) => {
  console.error('Request error:', error);

  // Log error to D1
  if (error instanceof Error) {
    const url = new URL(c.req.url);
    c.executionCtx.waitUntil(
      logError(c.env.DB, error, {
        url: url.pathname,
        method: c.req.method,
      })
    );
  }

  // Return structured error response
  if (error instanceof APIError) {
    return error.toResponse();
  }

  return Errors.Internal(error instanceof Error ? error.message : 'Unknown error').toResponse();
});

// 404 handler
app.notFound(() => {
  throw Errors.NotFound('Route');
});

// Export the fetch handler
export default {
  fetch: app.fetch,

  /**
   * Handle queue messages.
   * Processes batch queue and game queue messages.
   * Game queue messages trigger Cloudflare Workflows.
   */
  async queue(
    batch: MessageBatch<GameQueueMessage | BatchQueueMessage>,
    env: Env
  ): Promise<void> {
    // Process all messages in parallel for maximum throughput
    await Promise.all(
      batch.messages.map(async (message) => {
        const body = message.body;

        if ('gameId' in body && body.gameId) {
          // Game queue message - start workflow
          await handleGameMessage(message as Message<GameQueueMessage>, env);
        } else if ('config' in body && body.config && 'totalGames' in body.config) {
          // Batch queue message
          await handleBatchMessage(message as Message<BatchQueueMessage>, env);
        } else {
          console.error('Unknown message type:', body);
          message.ack(); // Acknowledge to prevent infinite retries
        }
      })
    );
  },

  /**
   * Handle scheduled cron triggers.
   * 
   * Schedule:
   * - Every 1 minute: Poll batch jobs for completion
   * - Every 5 minutes: Aggregate pending requests into batches
   * 
   * NOTE: Cleanup cron removed - Workflows handle timeouts natively.
   */
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.log(`Cron triggered: ${event.cron} at ${new Date(event.scheduledTime).toISOString()}`);
    
    // Register batch providers (one-time setup per worker invocation)
    const batchService = new BatchService(env);
    registerBatchProviders(batchService, env);

    // Route based on cron expression
    switch (event.cron) {
      // Poll batch jobs every minute
      case '*/1 * * * *':
        ctx.waitUntil(
          batchService.pollAndDispatch()
            .then((result) => {
              console.log(`Batch polling: ${result.jobsPolled} jobs polled, ${result.jobsCompleted} completed, ${result.resultsDispatched} dispatched`);
            })
            .catch((error) => {
              console.error('Batch polling failed:', error);
            })
        );
        break;

      // Aggregate requests into batches every 5 minutes
      case '*/5 * * * *':
      default:
        ctx.waitUntil(
          batchService.aggregateAndSubmit()
            .then((result) => {
              console.log(`Batch aggregation: ${result.batchesCreated} batches created, ${result.requestsProcessed} requests processed`);
            })
            .catch((error) => {
              console.error('Batch aggregation failed:', error);
            })
        );
        break;
    }
  },
};

/**
 * Register batch provider implementations with the BatchService.
 * Called once per scheduled invocation.
 */
function registerBatchProviders(batchService: BatchService, env: Env): void {
  try {
    const count = registerAvailableProviders(batchService, env);
    console.log(`Registered ${count} batch provider(s) for scheduled tasks`);
  } catch (error) {
    console.error('Failed to register batch providers:', error);
  }
}

/**
 * Handle a single game queue message.
 * Creates a Cloudflare Workflow instance to run the game.
 */
async function handleGameMessage(message: Message<GameQueueMessage>, env: Env): Promise<void> {
  const { gameId, batchId, config, traceId, encryptedUserKeys } = message.body;
  const MAX_RETRIES = 3;

  try {
    // Check system state - respect pause even for queued games
    const systemState = await getSystemState(env);
    if (systemState.processingPaused) {
      console.log(`[${traceId || 'no-trace'}] System paused, retrying game ${gameId} in 60s`);
      message.retry({ delaySeconds: 60 });
      return;
    }

    console.log(`[${traceId || 'no-trace'}] Processing game ${gameId} from batch ${batchId} (attempt ${message.attempts})`);

    // Start the game via Cloudflare Workflow
    // Wrapped in try-catch to handle duplicate workflow creation (idempotency)
    try {
      await env.MAFIA_WORKFLOW.create({
        id: gameId,
        params: {
          gameId,
          config,
          traceId,
          batchId,
          discountPricing: config.discountPricing,
          // Pass user's encrypted API keys for non-admin batches
          encryptedUserKeys,
        },
      });
      console.log(`[${traceId || 'no-trace'}] Game ${gameId} workflow started successfully`);
    } catch (workflowError) {
      // Handle duplicate workflow creation gracefully
      // This can happen if queue message is retried after workflow was already created
      const errorMsg = workflowError instanceof Error ? workflowError.message : String(workflowError);
      
      if (errorMsg.includes('already exists') || errorMsg.includes('already running')) {
        console.log(`[${traceId || 'no-trace'}] Workflow ${gameId} already exists/running, skipping duplicate`);
        message.ack();
        return;
      }
      
      // Workflow exists but is terminated/failed - skip to avoid duplicate stats
      if (errorMsg.includes('completed') || errorMsg.includes('failed') || errorMsg.includes('terminated')) {
        console.warn(`[${traceId || 'no-trace'}] Workflow ${gameId} previously terminated, skipping re-run`);
        message.ack();
        return;
      }
      
      // Unknown error - rethrow to trigger retry logic
      throw workflowError;
    }

    message.ack();
  } catch (error) {
    console.error(`Failed to process game ${gameId} (attempt ${message.attempts}):`, error);

    // Try to log the error - but handle infrastructure failures gracefully
    if (error instanceof Error) {
      try {
        await logError(env.DB, error, { gameId, batchId });
      } catch (dbError) {
        // DB is unavailable - retry the message instead of acking
        console.error('Failed to log error (DB unavailable), will retry message:', dbError);
        message.retry({ delaySeconds: 30 });
        return;
      }
    }

    // Check if we've exhausted retries
    if (message.attempts >= MAX_RETRIES) {
      console.error(`Game ${gameId} failed after ${MAX_RETRIES} attempts, marking as failed`);
      
      // Log to DLQ tracking table for visibility
      try {
        await logToDlq(env.DB, 'game-queue', message.body, error, message.attempts);
      } catch (dlqError) {
        console.error('Failed to log to DLQ table:', dlqError);
      }
      
      // Update batch failed counter
      if (batchId) {
        try {
          await incrementBatchProgress(env, batchId, 0, 1, 0);
          await updateDailyStats(env, { gamesFailed: 1 });
        } catch (updateError) {
          console.error('Failed to update batch progress (DB may be unavailable):', updateError);
          // Still retry the message if we can't update progress
          message.retry({ delaySeconds: 60 });
          return;
        }
      }
      
      message.ack(); // Acknowledge to prevent DLQ
    } else {
      message.retry();
    }
  }
}

/**
 * Handle a single batch queue message - splits into individual games.
 */
async function handleBatchMessage(message: Message<BatchQueueMessage>, env: Env): Promise<void> {
  const { batchId, config, traceId } = message.body;

  try {
    console.log(`[${traceId || 'no-trace'}] Processing batch ${batchId} with ${config.totalGames} games`);

    // Check system state
    const systemState = await getSystemState(env);
    if (systemState.processingPaused) {
      console.log(`[${traceId || 'no-trace'}] System paused, retrying batch ${batchId} in 60s`);
      message.retry({ delaySeconds: 60 });
      return;
    }

    // Process the batch with traceId propagation
    await processBatchMessage(env, batchId, config, traceId);

    message.ack();
    console.log(`[${traceId || 'no-trace'}] Batch ${batchId} processed, ${config.totalGames} games queued`);
  } catch (error) {
    console.error(`Failed to process batch ${batchId}:`, error);

    if (error instanceof Error) {
      try {
        await logError(env.DB, error, { batchId });
      } catch (dbError) {
        console.error('Failed to log batch error (DB unavailable):', dbError);
      }
    }

    // Log to DLQ if max retries exhausted
    if (message.attempts >= 3) {
      try {
        await logToDlq(env.DB, 'batch-queue', message.body, error, message.attempts);
      } catch (dlqError) {
        console.error('Failed to log batch to DLQ table:', dlqError);
      }

      // CRITICAL FIX: Mark batch as failed in DB so UI shows correct status
      const errorMessage = error instanceof Error ? error.message : String(error);
      try {
        await env.DB.prepare(`
          UPDATE batches 
          SET status = 'failed', error_message = ? 
          WHERE id = ?
        `).bind(`Queue processing failed after ${message.attempts} attempts: ${errorMessage}`, batchId).run();
        console.log(`[${traceId || 'no-trace'}] Batch ${batchId} marked as failed in DB`);
      } catch (dbError) {
        console.error('Failed to update batch status to failed:', dbError);
      }

      message.ack();
    } else {
      message.retry();
    }
  }
}

/**
 * Log a failed message to the DLQ tracking table.
 */
async function logToDlq(
  db: D1Database,
  queueName: string,
  messageBody: unknown,
  error: unknown,
  attempts: number
): Promise<void> {
  const id = `dlq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  await db.prepare(`
    INSERT INTO dlq_entries (id, queue_name, message_body, error_message, error_stack, attempts)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    queueName,
    JSON.stringify(messageBody),
    errorMessage,
    errorStack ?? null,
    attempts
  ).run();

  console.log(`Logged failed message to DLQ: ${id}`);
}

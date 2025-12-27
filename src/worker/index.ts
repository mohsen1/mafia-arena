/**
 * Mafia Arena - Cloudflare Worker Entry Point
 *
 * Uses Hono for clean routing and modular route handlers.
 * Handles HTTP requests and queue messages for the Mafia Arena platform.
 */

import { Hono } from 'hono';
import type { Env, GameQueueMessage, BatchQueueMessage } from './types.js';
import type { AIRequestMessage, CompletionRequest, CompletionResponse } from './ai/types.js';
import { createProvider } from './ai/factory.js';
import { isRetryableError } from './ai/errors.js';
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
} from './routes/index.js';
import {
  processBatchMessage,
  getSystemState,
  incrementBatchProgress,
  updateDailyStats,
  BatchService,
  modelSupportsBatchPricing,
  AnthropicBatch,
  OpenAIBatch,
  GoogleBatch,
  CerebrasBatch,
  FireworksBatch,
} from './batch/index.js';
import { cleanupStaleGames } from './scheduled/index.js';

// Re-export the Durable Object
export { GameRunner } from './GameRunner.js';

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
   * This single handler processes batch queue, game queue, and AI request queue messages.
   * Cloudflare routes messages to this handler based on the queue configuration.
   */
  async queue(
    batch: MessageBatch<GameQueueMessage | BatchQueueMessage | AIRequestMessage>,
    env: Env
  ): Promise<void> {
    // Process all messages in parallel for maximum throughput
    await Promise.all(
      batch.messages.map(async (message) => {
        const body = message.body;

        // Check message type based on fields
        // Note: AIRequestMessage may have 'request' OR 'requestRef' (Claim Check pattern)
        if ('requestId' in body && ('request' in body || 'requestRef' in body)) {
          // AI Request queue message (suspense pattern)
          await handleAIRequestMessage(message as Message<AIRequestMessage>, env);
        } else if ('gameId' in body && body.gameId) {
          // Game queue message
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
   * - Every 10 minutes: Clean up stale/hanging games
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

      // Clean up stale games every 10 minutes (default case too)
      case '*/10 * * * *':
      default:
        ctx.waitUntil(
          cleanupStaleGames(env)
            .then((result) => {
              console.log(`Scheduled cleanup completed: killed ${result.killedCount} games (${result.standardKilled} standard, ${result.discountKilled} discount)`);
            })
            .catch((error) => {
              console.error('Scheduled cleanup failed:', error);
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
  // Register providers that have API keys configured
  // Each provider checks its own env var in the constructor
  try {
    // Anthropic - 50% discount
    if ((env as unknown as Record<string, unknown>).ANTHROPIC_API_KEY) {
      batchService.registerProvider(new AnthropicBatch(env, 'anthropic/claude-3-5-sonnet'));
    }
    
    // OpenAI - 50% discount
    if ((env as unknown as Record<string, unknown>).OPENAI_API_KEY) {
      batchService.registerProvider(new OpenAIBatch(env, 'openai/gpt-4o'));
    }
    
    // Google - 50% discount
    if ((env as unknown as Record<string, unknown>).GOOGLE_API_KEY) {
      batchService.registerProvider(new GoogleBatch(env, 'google/gemini-1.5-pro'));
    }
    
    // Cerebras - 50% discount
    if ((env as unknown as Record<string, unknown>).CEREBRAS_API_KEY) {
      batchService.registerProvider(new CerebrasBatch(env, 'cerebras/llama3.1-70b'));
    }
    
    // Fireworks - 40% discount (less than others)
    if ((env as unknown as Record<string, unknown>).FIREWORKS_API_KEY) {
      batchService.registerProvider(new FireworksBatch(env, 'fireworks/llama-v3p1-70b-instruct'));
    }
  } catch (error) {
    console.error('Failed to register batch providers:', error);
  }
}

/**
 * Handle a single game queue message.
 */
async function handleGameMessage(message: Message<GameQueueMessage>, env: Env): Promise<void> {
  const { gameId, batchId, config, traceId } = message.body;
  const MAX_RETRIES = 3;

  try {
    console.log(`[${traceId || 'no-trace'}] Processing game ${gameId} from batch ${batchId} (attempt ${message.attempts})`);

    // Get Durable Object instance by game ID
    const id = env.GAME_RUNNER.idFromName(gameId);
    const stub = env.GAME_RUNNER.get(id);

    // Start the game with traceId
    const response = await stub.fetch('http://internal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, batchId, config, traceId }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error: string };
      throw new Error(error.error ?? 'Failed to start game');
    }

    message.ack();
    console.log(`[${traceId || 'no-trace'}] Game ${gameId} started successfully`);
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
      message.ack();
    } else {
      message.retry();
    }
  }
}

/**
 * Handle AI request queue messages (suspense pattern).
 * 
 * This worker:
 * 1. Receives AI request from queue (sent when DO suspended)
 * 2. Executes the AI call (can take 60s+, that's fine for queue workers)
 * 3. POSTs the result back to the DO callback endpoint
 * 4. DO resumes with cached response
 */
// Drop AI requests older than 10 minutes (games likely timed out or moved on)
const AI_REQUEST_TTL_MS = 10 * 60 * 1000;

async function handleAIRequestMessage(message: Message<AIRequestMessage>, env: Env): Promise<void> {
  let body = message.body;
  const MAX_RETRIES = 5;
  
  // --- FIX 1: TTL Check (Clears Queue Backlog) ---
  // Old messages from failed games will be dropped immediately, clearing the queue
  const age = Date.now() - body.timestamp;
  if (age > AI_REQUEST_TTL_MS) {
    console.warn(`[${body.traceId || 'no-trace'}] Dropping stale AI request ${body.requestId} (Age: ${Math.round(age / 1000)}s, Game: ${body.gameId})`);
    message.ack(); // Remove from queue immediately
    return;
  }
  
  // --- FIX 2: Game Liveness Check (Prevents processing dead games) ---
  // Quick D1 check is much cheaper than an LLM call (~10ms vs ~10-60s)
  try {
    const game = await env.DB.prepare('SELECT status FROM games WHERE id = ?')
      .bind(body.gameId)
      .first<{ status: string }>();

    if (!game) {
      console.warn(`[${body.traceId || 'no-trace'}] Game ${body.gameId} not found in DB. Dropping request ${body.requestId}.`);
      message.ack();
      return;
    }

    if (game.status !== 'running') {
      console.warn(`[${body.traceId || 'no-trace'}] Game ${body.gameId} is ${game.status}. Dropping request ${body.requestId}.`);
      message.ack();
      return;
    }
  } catch (error) {
    // If DB check fails, log but continue (fail open) to not block valid games
    console.warn(`[${body.traceId || 'no-trace'}] Failed to check game status for ${body.gameId}, proceeding:`, error);
  }
  
  // CLAIM CHECK PATTERN: Rehydrate request from R2 if offloaded
  if (!body.request && body.requestRef) {
    console.log(`[${body.traceId || 'no-trace'}] Rehydrating large request from R2: ${body.requestRef}`);
    try {
      const obj = await env.TRANSCRIPTS.get(body.requestRef);
      if (!obj) {
        // FIX: If object is missing, it's non-recoverable (already processed by another worker
        // or expired via TTL). Ack/discard to prevent infinite retry loops.
        console.warn(`[${body.traceId || 'no-trace'}] Offloaded request not found in R2 (likely already processed): ${body.requestRef}. Discarding duplicate message.`);
        message.ack();
        return;
      }
      const requestData = await obj.json() as CompletionRequest;
      // Merge back into body for processing
      body = { ...body, request: requestData };
    } catch (error) {
      console.error(`[${body.traceId || 'no-trace'}] Failed to rehydrate request ${body.requestId}:`, error);
      // Retry - R2 read might be transiently failing (network error)
      message.retry();
      return;
    }
  }

  const { requestId, gameId, modelId, request, context, traceId, discountPricing } = body;

  if (!request) {
    console.error(`[${traceId || 'no-trace'}] Invalid message: missing request data for ${requestId}`);
    message.ack();
    return;
  }

  try {
    // ==========================================================================
    // BATCH ROUTING: Route discount pricing requests to batch API for 40-50% savings
    // ==========================================================================
    if (discountPricing && modelSupportsBatchPricing(modelId)) {
      console.log(`[${traceId || 'no-trace'}] Routing AI request ${requestId} to batch API (${modelId})`);
      
      // Store request in D1 for batch aggregation
      // The cron job will aggregate and submit batches every 5 minutes
      const batchService = new BatchService(env);
      await batchService.storeRequest(body);
      
      message.ack();
      console.log(`[${traceId || 'no-trace'}] AI request ${requestId} queued for batch processing`);
      return;
    }

    // ==========================================================================
    // IMMEDIATE PROCESSING: Non-discount requests or unsupported models
    // ==========================================================================
    console.log(`[${traceId || 'no-trace'}] Processing AI request ${requestId} for game ${gameId} (attempt ${message.attempts})${discountPricing ? ' [DISCOUNT-IMMEDIATE]' : ''}`);

    // 1. Create provider for this model
    // For discount pricing games without batch support, use longer timeouts
    const provider = createProvider(modelId, env, {
      enableRetry: true,
      discountPricing: discountPricing ?? false,
    });

    // 2. Execute the AI call (this can take a while - that's the point!)
    const startTime = Date.now();
    const response = await provider.complete(request);
    const latencyMs = Date.now() - startTime;

    console.log(`[${traceId || 'no-trace'}] AI request ${requestId} completed in ${latencyMs}ms`);

    // 3. Call back to the DO with the response
    const id = env.GAME_RUNNER.idFromName(gameId);
    const stub = env.GAME_RUNNER.get(id);

    const callbackResponse = await stub.fetch('http://internal/internal/ai-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        response: {
          content: response.content,
          tokensUsed: response.tokensUsed,
          latencyMs: response.latencyMs,
          modelId: response.modelId,
        } satisfies CompletionResponse,
      }),
    });

    if (!callbackResponse.ok) {
      const errorText = await callbackResponse.text();
      throw new Error(`DO callback failed: ${callbackResponse.status} - ${errorText}`);
    }

    // NOTE: We intentionally do NOT delete the R2 request payload here.
    // This makes the Claim Check pattern idempotent if duplicate queue messages
    // reference the same R2 object (e.g., from punt/resume logic).
    // R2 objects will be cleaned up automatically via Bucket Lifecycle Rules (TTL).

    message.ack();
    console.log(`[${traceId || 'no-trace'}] AI request ${requestId} callback succeeded`);
  } catch (error) {
    const isFatal = !isRetryableError(error);
    console.error(`[${traceId || 'no-trace'}] AI request ${requestId} failed (attempt ${message.attempts}, fatal=${isFatal}):`, error);

    // Log error
    if (error instanceof Error) {
      try {
        await logError(env.DB, error, { 
          requestId, 
          gameId, 
          modelId, 
          round: context.round,
          phase: context.phase,
          playerId: context.playerId,
          actionType: context.actionType,
          isFatal,
        });
      } catch (dbError) {
        console.error('Failed to log AI request error:', dbError);
      }
    }

    // FAIL FAST: Non-retryable errors (invalid model, auth error, etc.) should immediately notify DO
    // This prevents games from hanging forever waiting for responses that will never come
    if (isFatal || message.attempts >= MAX_RETRIES) {
      if (isFatal) {
        console.error(`[${traceId || 'no-trace'}] AI request ${requestId} failed with FATAL error - notifying DO immediately`);
      } else {
        console.error(`[${traceId || 'no-trace'}] AI request ${requestId} failed after ${MAX_RETRIES} attempts`);
      }
      
      // Notify DO of failure with isFatal flag
      try {
        const id = env.GAME_RUNNER.idFromName(gameId);
        const stub = env.GAME_RUNNER.get(id);
        await stub.fetch('http://internal/internal/ai-callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            isFatal, // New flag to indicate permanent failure
          }),
        });
      } catch (callbackError) {
        console.error('Failed to notify DO of AI error:', callbackError);
      }

      // Log to DLQ for visibility
      try {
        await logToDlq(env.DB, 'ai-request-queue', message.body, error, message.attempts);
      } catch (dlqError) {
        console.error('Failed to log AI request to DLQ:', dlqError);
      }

      message.ack();
    } else {
      // Transient error - retry with exponential backoff: 10s, 20s, 40s, 80s, 160s
      const delaySeconds = 10 * Math.pow(2, message.attempts - 1);
      message.retry({ delaySeconds });
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

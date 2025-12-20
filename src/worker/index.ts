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
  budgetRoutes,
  statsRoutes,
  analysisRoutes,
  adminRoutes,
} from './routes/index.js';
import {
  processBatchMessage,
  getSystemState,
  incrementBatchProgress,
  updateDailyStats,
} from './batch/index.js';

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

// Mount route handlers
app.route('/api/games', gamesRoutes);
app.route('/api/leaderboard', leaderboardRoutes);
app.route('/api/models', modelsRoutes);
app.route('/api/budget', budgetRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/analysis', analysisRoutes);
app.route('/api/admin', adminRoutes);

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
   * This single handler processes both batch queue and game queue messages.
   * Cloudflare routes messages to this handler based on the queue configuration.
   */
  async queue(
    batch: MessageBatch<GameQueueMessage | BatchQueueMessage>,
    env: Env
  ): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body;

      // Check if this is a game message (has gameId) or batch message (has config.totalGames)
      if ('gameId' in body && body.gameId) {
        // Game queue message
        await handleGameMessage(message as Message<GameQueueMessage>, env);
      } else if ('config' in body && body.config && 'totalGames' in body.config) {
        // Batch queue message
        await handleBatchMessage(message as Message<BatchQueueMessage>, env);
      } else {
        console.error('Unknown message type:', body);
        message.ack(); // Acknowledge to prevent infinite retries
      }
    }
  },
};

/**
 * Handle a single game queue message.
 */
async function handleGameMessage(message: Message<GameQueueMessage>, env: Env): Promise<void> {
  const { gameId, batchId, config } = message.body;
  const MAX_RETRIES = 3;

  try {
    console.log(`Processing game ${gameId} from batch ${batchId} (attempt ${message.attempts})`);

    // Get Durable Object instance by game ID
    const id = env.GAME_RUNNER.idFromName(gameId);
    const stub = env.GAME_RUNNER.get(id);

    // Start the game
    const response = await stub.fetch('http://internal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, batchId, config }),
    });

    if (!response.ok) {
      const error = (await response.json()) as { error: string };
      throw new Error(error.error ?? 'Failed to start game');
    }

    message.ack();
    console.log(`Game ${gameId} started successfully`);
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
  const { batchId, config } = message.body;

  try {
    console.log(`Processing batch ${batchId} with ${config.totalGames} games`);

    // Check system state
    const systemState = await getSystemState(env);
    if (systemState.processingPaused) {
      console.log(`System paused, retrying batch ${batchId} in 60s`);
      message.retry({ delaySeconds: 60 });
      return;
    }

    // Process the batch
    await processBatchMessage(env, batchId, config);

    message.ack();
    console.log(`Batch ${batchId} processed, ${config.totalGames} games queued`);
  } catch (error) {
    console.error(`Failed to process batch ${batchId}:`, error);

    if (error instanceof Error) {
      try {
        await logError(env.DB, error, { batchId });
      } catch (dbError) {
        console.error('Failed to log batch error (DB unavailable):', dbError);
      }
    }

    message.retry();
  }
}

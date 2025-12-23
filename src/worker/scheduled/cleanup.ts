/**
 * Scheduled cleanup for stale/hanging games.
 * 
 * Uses smart thresholds based on game type:
 * - Standard games: 1 hour
 * - Discount pricing games: 24 hours (batch APIs can take up to 24h)
 * 
 * Run via Cloudflare Cron Trigger every 10 minutes.
 */

import type { Env } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('ScheduledCleanup');

/**
 * Stale thresholds for different game types.
 */
const STALE_THRESHOLDS = {
  /** Standard real-time games timeout after 1 hour */
  STANDARD_MS: 60 * 60 * 1000,
  /** Discount pricing games (batch API) timeout after 24 hours */
  DISCOUNT_PRICING_MS: 24 * 60 * 60 * 1000,
} as const;

interface StaleGame {
  id: string;
  discount_pricing: number;
  last_activity: number | null;
  created_at: number;
  rounds: number;
  batch_id: string | null;
}

/**
 * Clean up games that have been running for too long.
 * 
 * Uses smart thresholds:
 * - Standard games (discount_pricing = 0): Stale after 1 hour
 * - Discount pricing games (discount_pricing = 1): Stale after 24 hours
 */
export async function cleanupStaleGames(env: Env): Promise<{
  killedCount: number;
  standardKilled: number;
  discountKilled: number;
  gameIds: string[];
}> {
  const now = Date.now();
  const standardThreshold = now - STALE_THRESHOLDS.STANDARD_MS;
  const discountThreshold = now - STALE_THRESHOLDS.DISCOUNT_PRICING_MS;

  log.info('Starting scheduled cleanup', {
    standardThresholdMinutes: STALE_THRESHOLDS.STANDARD_MS / 60 / 1000,
    discountThresholdHours: STALE_THRESHOLDS.DISCOUNT_PRICING_MS / 60 / 60 / 1000,
  });

  try {
    // Find stale games with smart thresholds
    // Use COALESCE to fall back to created_at if last_activity is NULL
    const staleGames = await env.DB.prepare(`
      SELECT id, discount_pricing, last_activity, created_at, rounds, batch_id
      FROM games
      WHERE status = 'running'
        AND (
          (discount_pricing = 0 AND COALESCE(last_activity, created_at) < ?)
          OR (discount_pricing = 1 AND COALESCE(last_activity, created_at) < ?)
        )
      ORDER BY created_at ASC
    `).bind(standardThreshold, discountThreshold).all<StaleGame>();

    if (!staleGames.results || staleGames.results.length === 0) {
      log.info('No stale games found');
      return {
        killedCount: 0,
        standardKilled: 0,
        discountKilled: 0,
        gameIds: [],
      };
    }

    log.info('Found stale games', { count: staleGames.results.length });

    // Categorize games
    const standardGames = staleGames.results.filter(g => g.discount_pricing === 0);
    const discountGames = staleGames.results.filter(g => g.discount_pricing === 1);

    // Build batch update with appropriate error messages
    const updates = staleGames.results.map(game => {
      const isDiscount = game.discount_pricing === 1;
      const threshold = isDiscount ? '24 hours' : '1 hour';
      const lastActive = game.last_activity ?? game.created_at;
      const staleDuration = Math.round((now - lastActive) / 1000 / 60);
      
      const errorMsg = game.rounds === 0
        ? `Auto-cleanup: Game never started (no activity for ${staleDuration} min, threshold: ${threshold})`
        : `Auto-cleanup: Game hung (no activity for ${staleDuration} min, threshold: ${threshold})`;

      return env.DB.prepare(`
        UPDATE games 
        SET status = 'failed', 
            error_message = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(errorMsg, now, game.id);
    });

    await env.DB.batch(updates);

    // Update daily stats
    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(`
      INSERT INTO daily_stats (date, games_failed)
      VALUES (?, ?)
      ON CONFLICT (date) DO UPDATE SET
        games_failed = games_failed + excluded.games_failed,
        updated_at = unixepoch()
    `).bind(today, staleGames.results.length).run();

    const gameIds = staleGames.results.map(g => g.id);
    
    log.info('Cleaned up stale games', {
      total: gameIds.length,
      standardKilled: standardGames.length,
      discountKilled: discountGames.length,
      sampleIds: gameIds.slice(0, 5).join(', '),
    });

    return {
      killedCount: gameIds.length,
      standardKilled: standardGames.length,
      discountKilled: discountGames.length,
      gameIds,
    };

  } catch (error) {
    log.error('Scheduled cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}


/**
 * Scheduled cleanup for stale/hanging games.
 * 
 * Uses smart thresholds based on game type:
 * - Standard games: 1 hour
 * - Discount pricing games: 24 hours (batch APIs can take up to 24h)
 * 
 * NEW: "Active Punt" - Before killing, try to re-trigger games that might
 * just be stuck due to lost callbacks. Games with cached AI responses
 * might be recoverable.
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

/**
 * Warning thresholds - try punt before killing.
 * Games older than WARNING but younger than STALE get a punt attempt.
 */
const PUNT_THRESHOLDS = {
  /** Try to punt standard games after 10 minutes */
  STANDARD_MS: 10 * 60 * 1000,
  /** Try to punt discount games after 2 hours */
  DISCOUNT_PRICING_MS: 2 * 60 * 60 * 1000,
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
 * Try to "punt" (re-trigger) a stuck game before killing it.
 * 
 * This sends a wakeup request to the Durable Object, which will:
 * 1. Check if there are cached AI responses
 * 2. If so, try to resume the game
 * 
 * Returns true if the punt was successful (game responded OK).
 */
async function tryPuntGame(env: Env, gameId: string): Promise<boolean> {
  try {
    const doId = env.GAME_RUNNER.idFromName(gameId);
    const stub = env.GAME_RUNNER.get(doId);
    
    // Send a wakeup/punt request to the DO
    const response = await stub.fetch(new Request('http://internal/punt', {
      method: 'POST',
    }));
    
    if (response.ok) {
      const result = await response.json() as { punted: boolean; reason: string };
      log.info('Punt attempt result', { gameId, ...result });
      return result.punted;
    }
    
    return false;
  } catch (error) {
    log.warn('Punt attempt failed', { 
      gameId, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return false;
  }
}

/**
 * Clean up games that have been running for too long.
 * 
 * Uses smart thresholds:
 * - Standard games (discount_pricing = 0): Stale after 1 hour
 * - Discount pricing games (discount_pricing = 1): Stale after 24 hours
 * 
 * NEW: "Active Punt" - For games between PUNT and STALE thresholds,
 * try to re-trigger them before giving up.
 */
export async function cleanupStaleGames(env: Env): Promise<{
  killedCount: number;
  standardKilled: number;
  discountKilled: number;
  puntedCount: number;
  gameIds: string[];
}> {
  const now = Date.now();
  const standardStaleThreshold = now - STALE_THRESHOLDS.STANDARD_MS;
  const discountStaleThreshold = now - STALE_THRESHOLDS.DISCOUNT_PRICING_MS;
  const standardPuntThreshold = now - PUNT_THRESHOLDS.STANDARD_MS;
  const discountPuntThreshold = now - PUNT_THRESHOLDS.DISCOUNT_PRICING_MS;

  log.info('Starting scheduled cleanup with punt', {
    puntThresholdMinutes: PUNT_THRESHOLDS.STANDARD_MS / 60 / 1000,
    staleThresholdMinutes: STALE_THRESHOLDS.STANDARD_MS / 60 / 1000,
    discountPuntThresholdHours: PUNT_THRESHOLDS.DISCOUNT_PRICING_MS / 60 / 60 / 1000,
    discountStaleThresholdHours: STALE_THRESHOLDS.DISCOUNT_PRICING_MS / 60 / 60 / 1000,
  });

  try {
    // PHASE 1: Find games to PUNT (between punt and stale thresholds)
    const puntCandidates = await env.DB.prepare(`
      SELECT id, discount_pricing, last_activity, created_at, rounds, batch_id
      FROM games
      WHERE status = 'running'
        AND (
          (discount_pricing = 0 AND COALESCE(last_activity, created_at) < ? AND COALESCE(last_activity, created_at) >= ?)
          OR (discount_pricing = 1 AND COALESCE(last_activity, created_at) < ? AND COALESCE(last_activity, created_at) >= ?)
        )
      ORDER BY created_at ASC
      LIMIT 10
    `).bind(standardPuntThreshold, standardStaleThreshold, discountPuntThreshold, discountStaleThreshold).all<StaleGame>();
    
    // Try to punt each candidate
    let puntedCount = 0;
    if (puntCandidates.results && puntCandidates.results.length > 0) {
      log.info('Found games to punt', { count: puntCandidates.results.length });
      
      for (const game of puntCandidates.results) {
        const punted = await tryPuntGame(env, game.id);
        if (punted) {
          puntedCount++;
          // Update last_activity so we don't punt again immediately
          await env.DB.prepare(`
            UPDATE games SET last_activity = ? WHERE id = ?
          `).bind(now, game.id).run();
        }
      }
      
      log.info('Punt phase complete', { attempted: puntCandidates.results.length, successful: puntedCount });
    }

    // PHASE 2: Find STALE games to kill (past stale threshold)
    const staleGames = await env.DB.prepare(`
      SELECT id, discount_pricing, last_activity, created_at, rounds, batch_id
      FROM games
      WHERE status = 'running'
        AND (
          (discount_pricing = 0 AND COALESCE(last_activity, created_at) < ?)
          OR (discount_pricing = 1 AND COALESCE(last_activity, created_at) < ?)
        )
      ORDER BY created_at ASC
    `).bind(standardStaleThreshold, discountStaleThreshold).all<StaleGame>();

    if (!staleGames.results || staleGames.results.length === 0) {
      log.info('No stale games to kill');
      return {
        killedCount: 0,
        standardKilled: 0,
        discountKilled: 0,
        puntedCount,
        gameIds: [],
      };
    }

    log.info('Found stale games to kill', { count: staleGames.results.length });

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
      puntedCount,
      sampleIds: gameIds.slice(0, 5).join(', '),
    });

    return {
      killedCount: gameIds.length,
      standardKilled: standardGames.length,
      discountKilled: discountGames.length,
      puntedCount,
      gameIds,
    };

  } catch (error) {
    log.error('Scheduled cleanup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}


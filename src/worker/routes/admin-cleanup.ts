/**
 * Admin endpoint to clean up stale/hanging games.
 * 
 * Marks games that have been "running" for too long as failed.
 * Useful for recovering from deployment issues or stuck Durable Objects.
 */

import type { Context } from 'hono';
import type { Env } from '../types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('AdminCleanup');

/**
 * A game is considered stale if it's been running for more than this threshold.
 */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function killHangingGames(c: Context<{ Bindings: Env }>): Promise<Response> {
  const now = Date.now();
  const staleTimestamp = now - STALE_THRESHOLD_MS;

  try {
    // Find all games that have been "running" for too long
    // A game is stuck if it's been in "running" status for >10 minutes
    // This includes games that never actually started properly
    interface StaleGame {
      id: string;
      created_at: number;
      rounds: number;
      batch_id: string | null;
    }
    
    const staleGames = await c.env.DB.prepare(`
      SELECT id, created_at, rounds, batch_id
      FROM games
      WHERE status = 'running'
        AND created_at < ?
      ORDER BY created_at ASC
    `).bind(staleTimestamp).all<StaleGame>();

    if (!staleGames.results || staleGames.results.length === 0) {
      log.info('No hanging games found');
      return c.json({
        success: true,
        killedCount: 0,
        message: 'No hanging games found',
      });
    }

    log.info('Found stale games', { count: staleGames.results.length });

    // Update all stale games to failed status
    const gameIds = staleGames.results.map((g) => g.id);
    
    // Categorize games for better error messages
    // Games with 0 rounds likely never started properly
    const neverStarted = staleGames.results.filter((g) => g.rounds === 0);
    const hung = staleGames.results.filter((g) => g.rounds > 0);
    
    // Build batch update with appropriate error messages
    const updates = gameIds.map(gameId => {
      const game = staleGames.results.find((g) => g.id === gameId);
      const errorMsg = game && game.rounds === 0
        ? 'Killed by admin: Game never started (stuck in running state with 0 rounds)'
        : 'Killed by admin: Game hung for >10 minutes';
      
      return c.env.DB.prepare(`
        UPDATE games 
        SET status = 'failed', 
            error_message = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(errorMsg, now, gameId);
    });

    await c.env.DB.batch(updates);

    // Update daily stats to reflect failures
    const today = new Date().toISOString().slice(0, 10);
    await c.env.DB.prepare(`
      INSERT INTO daily_stats (date, games_failed)
      VALUES (?, ?)
      ON CONFLICT (date) DO UPDATE SET
        games_failed = games_failed + excluded.games_failed,
        updated_at = unixepoch()
    `).bind(today, gameIds.length).run();

    log.info('Killed hanging games', { 
      count: gameIds.length,
      neverStarted: neverStarted.length,
      hung: hung.length,
      gameIds: gameIds.slice(0, 5).join(', '), // Log first 5
    });

    return c.json({
      success: true,
      killedCount: gameIds.length,
      breakdown: {
        neverStarted: neverStarted.length,
        hungAfterStart: hung.length,
      },
      gameIds: gameIds,
      message: `Killed ${gameIds.length} game(s): ${neverStarted.length} never started, ${hung.length} hung after starting`,
    });

  } catch (error) {
    log.error('Failed to kill hanging games', { error: error instanceof Error ? error.message : String(error) });
    return c.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

/**
 * Get count of currently running games (for display).
 */
export async function getRunningGamesCount(c: Context<{ Bindings: Env }>): Promise<Response> {
  try {
    const result = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN created_at < ? THEN 1 ELSE 0 END) as stale
      FROM games
      WHERE status = 'running'
    `).bind(Date.now() - STALE_THRESHOLD_MS).first<{ total: number; stale: number }>();

    return c.json({
      total: result?.total ?? 0,
      stale: result?.stale ?? 0,
      staleThresholdMinutes: STALE_THRESHOLD_MS / 60 / 1000,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


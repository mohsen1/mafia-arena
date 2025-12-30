/**
 * Admin endpoint to clean up stale/hanging games.
 * 
 * Marks games that have been "running" for too long as failed.
 * Useful for recovering from deployment issues or stuck Durable Objects.
 */

import type { Context } from 'hono';
import { eq, lt, and, sql } from 'drizzle-orm';
import type { Env } from '../types.js';
import { createLogger } from '../utils/logger.js';
import { createDb } from '../db/drizzle.js';
import * as schema from '../db/schema.js';

const log = createLogger('AdminCleanup');

/**
 * A game is considered stale if it's been running for more than this threshold.
 */
const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function killHangingGames(c: Context<{ Bindings: Env }>): Promise<Response> {
  const db = createDb(c.env.DB);
  const now = Date.now();
  const staleTimestamp = new Date(now - STALE_THRESHOLD_MS);

  try {
    // Find all games that have been "running" for too long
    // A game is stuck if it's been in "running" status for >10 minutes
    // This includes games that never actually started properly
    const staleGames = await db
      .select({
        id: schema.games.id,
        created_at: schema.games.createdAt,
        rounds: schema.games.rounds,
        batch_id: schema.games.batchId,
      })
      .from(schema.games)
      .where(
        and(
          eq(schema.games.status, 'running'),
          lt(schema.games.createdAt, staleTimestamp)
        )
      )
      .orderBy(schema.games.createdAt);

    if (staleGames.length === 0) {
      log.info('No hanging games found');
      return c.json({
        success: true,
        killedCount: 0,
        message: 'No hanging games found',
      });
    }

    log.info('Found stale games', { count: staleGames.length });

    // Update all stale games to failed status
    const gameIds = staleGames.map((g) => g.id);
    
    // Categorize games for better error messages
    // Games with 0 rounds likely never started properly
    const neverStarted = staleGames.filter((g) => g.rounds === 0);
    const hung = staleGames.filter((g) => (g.rounds ?? 0) > 0);
    
    // Build batch update with appropriate error messages
    // Using raw DB for batched updates (Drizzle batch syntax differs)
    const updates = gameIds.map(gameId => {
      const game = staleGames.find((g) => g.id === gameId);
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

    // Use D1's native batch() for atomic multi-row update
    // Note: Drizzle doesn't provide a batch equivalent; this is the recommended pattern
    await c.env.DB.batch(updates);

    // Update daily stats to reflect failures
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesFailed: gameIds.length,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesFailed: sql`${schema.dailyStats.gamesFailed} + ${gameIds.length}`,
          updatedAt: new Date(),
        },
      });

    // Update batch statistics for affected batches
    // Group games by batch_id and update each batch's failed_games count
    const batchCounts = new Map<string, number>();
    for (const game of staleGames) {
      if (game.batch_id) {
        batchCounts.set(game.batch_id, (batchCounts.get(game.batch_id) || 0) + 1);
      }
    }

    const batchesUpdated: string[] = [];
    const batchesCompleted: string[] = [];

    for (const [batchId, failedCount] of batchCounts) {
      // Increment failed_games for this batch
      await c.env.DB.prepare(`
        UPDATE batches 
        SET failed_games = failed_games + ?
        WHERE id = ?
      `).bind(failedCount, batchId).run();

      // Check if batch is now complete
      const batchResult = await c.env.DB.prepare(`
        SELECT total_games, completed_games, failed_games, status 
        FROM batches WHERE id = ?
      `).bind(batchId).first<{
        total_games: number;
        completed_games: number;
        failed_games: number;
        status: string;
      }>();

      if (batchResult && batchResult.status === 'processing') {
        const totalFinished = batchResult.completed_games + batchResult.failed_games;
        if (totalFinished >= batchResult.total_games) {
          // Batch is complete - mark as failed since we killed games
          await c.env.DB.prepare(`
            UPDATE batches 
            SET status = 'failed', 
                completed_at = ?,
                error_message = 'Batch completed with admin-killed games'
            WHERE id = ?
          `).bind(now, batchId).run();
          batchesCompleted.push(batchId);
        }
      }
      batchesUpdated.push(batchId);
    }

    log.info('Killed hanging games', { 
      count: gameIds.length,
      neverStarted: neverStarted.length,
      hung: hung.length,
      gameIds: gameIds.slice(0, 5).join(', '), // Log first 5
      batchesUpdated: batchesUpdated.length,
      batchesCompleted: batchesCompleted.length,
    });

    return c.json({
      success: true,
      killedCount: gameIds.length,
      breakdown: {
        neverStarted: neverStarted.length,
        hungAfterStart: hung.length,
      },
      gameIds: gameIds,
      batchesUpdated: batchesUpdated,
      batchesCompleted: batchesCompleted,
      message: `Killed ${gameIds.length} game(s): ${neverStarted.length} never started, ${hung.length} hung after starting. Updated ${batchesUpdated.length} batch(es), completed ${batchesCompleted.length} batch(es).`,
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
  const db = createDb(c.env.DB);
  const staleTimestamp = new Date(Date.now() - STALE_THRESHOLD_MS);
  
  try {
    const result = await db
      .select({
        total: sql<number>`count(*)`,
        stale: sql<number>`SUM(CASE WHEN ${schema.games.createdAt} < ${staleTimestamp} THEN 1 ELSE 0 END)`,
      })
      .from(schema.games)
      .where(eq(schema.games.status, 'running'));

    return c.json({
      total: result[0]?.total ?? 0,
      stale: result[0]?.stale ?? 0,
      staleThresholdMinutes: STALE_THRESHOLD_MS / 60 / 1000,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

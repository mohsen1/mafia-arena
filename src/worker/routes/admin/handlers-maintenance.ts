/**
 * Maintenance and data cleanup route handlers for admin API.
 */

import type { Context } from 'hono';
import type { Env } from '../../types.js';
import { eq, sql, ne } from 'drizzle-orm';
import { createDb } from '../../db/drizzle.js';
import { errorHandler, createLogger } from '../../utils/index.js';
import * as schema from '../../db/schema.js';
import type { MergeRequest } from './validation.js';

const log = createLogger('admin:maintenance');

export async function handleRebuildLeaderboard(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const db = createDb(env.DB);

  try {
    // Step 1: Clear the corrupted table
    await db.delete(schema.leaderboard);

    // Step 2: Re-populate from source of truth (game_participants)
    const result = await env.DB.prepare(`
      INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens, updated_at)
      SELECT
          gp.model_id,
          gp.team,
          COUNT(DISTINCT gp.game_id) as games_played,
          SUM(gp.won) as games_won,
          0 as total_tokens,
          unixepoch() * 1000
      FROM game_participants gp
      JOIN games g ON gp.game_id = g.id
      WHERE g.status = 'completed'
        AND g.rounds > 1
      GROUP BY gp.model_id, gp.team
    `).run();

    return c.json({
      success: true,
      message: 'Leaderboard rebuilt from source of truth',
      rowsInserted: result.meta?.changes ?? 0,
    });
  } catch (error) {
    return errorHandler.handleApiError(error, {
      route: 'rebuildLeaderboard',
      action: 'rebuild',
    }, log);
  }
}

export async function handleMergeModel(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const db = createDb(env.DB);

  let body: MergeRequest;
  try {
    body = await c.req.json<MergeRequest>();
  } catch {
    throw new Error('Invalid JSON body');
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
    const targetModel = await db.query.models.findFirst({
      where: eq(schema.models.id, toId),
    });

    if (!targetModel) {
      return c.json({ error: `Target model ${toId} does not exist` }, 404);
    }

    // Get count of records to migrate
    const participantCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.gameParticipants)
      .where(eq(schema.gameParticipants.modelId, fromId));

    // Execute the merge using batch for atomicity
    const statements = [
      // Move game participants to the new ID
      env.DB.prepare('UPDATE game_participants SET model_id = ? WHERE model_id = ?')
        .bind(toId, fromId),
      // Delete old leaderboard entries (will be regenerated)
      env.DB.prepare('DELETE FROM leaderboard WHERE model_id = ?')
        .bind(fromId),
      // Delete old model metadata
      env.DB.prepare('DELETE FROM models WHERE id = ?')
        .bind(fromId),
    ];

    // Use D1's native batch() for atomic merge operation
    await env.DB.batch(statements);

    return c.json({
      success: true,
      message: `Merged ${fromId} into ${toId}`,
      recordsMigrated: participantCount[0]?.count ?? 0,
      note: 'Run rebuild-leaderboard and elo/backfill to update aggregates',
    });
  } catch (error) {
    return errorHandler.handleApiError(error, {
      route: 'mergeModel',
      action: 'merge',
      fromId,
      toId,
    }, log);
  }
}

export async function handleFindDuplicates(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);

  try {
    // Get all models with their game counts
    const models = await db
      .select({
        id: schema.models.id,
        display_name: schema.models.displayName,
        provider: schema.models.family,
        total_games: sql<number>`COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0)`,
      })
      .from(schema.models)
      .leftJoin(schema.leaderboard, eq(schema.models.id, schema.leaderboard.modelId))
      .where(ne(schema.models.family, 'test'))
      .groupBy(schema.models.id)
      .orderBy(schema.models.displayName);

    // Group by display_name to find duplicates
    const byName: Record<string, typeof models> = {};
    for (const model of models) {
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
        const first = models[0]!;
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
    return errorHandler.handleApiError(error, {
      route: 'findDuplicates',
      action: 'find',
    }, log);
  }
}

export async function handleGetLowSampleModels(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);

  try {
    const models = await db
      .select({
        id: schema.models.id,
        display_name: schema.models.displayName,
        provider: schema.models.family,
        total_games: sql<number>`COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0)`,
      })
      .from(schema.models)
      .leftJoin(schema.leaderboard, eq(schema.models.id, schema.leaderboard.modelId))
      .where(ne(schema.models.family, 'test'))
      .groupBy(schema.models.id)
      .having(sql`COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0) < 3 AND COALESCE(SUM(${schema.leaderboard.gamesPlayed}), 0) > 0`);

    return c.json({
      success: true,
      count: models.length,
      models,
      note: 'These models have too few games for statistical significance',
    });
  } catch (error) {
    return errorHandler.handleApiError(error, {
      route: 'getLowSampleModels',
      action: 'find',
    }, log);
  }
}

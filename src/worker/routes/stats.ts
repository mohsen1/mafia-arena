/**
 * Stats API routes.
 * 
 * Uses Drizzle ORM with sql template tags for complex aggregations.
 */

import { Hono } from 'hono';
import { eq, sql, desc, gte, and, notLike } from 'drizzle-orm';
import type { Env } from '../types.js';
import { createDb } from '../db/drizzle.js';
import * as schema from '../db/schema.js';

const stats = new Hono<{ Bindings: Env }>();

/**
 * GET /api/stats/overview - Aggregate stats overview.
 */
stats.get('/overview', async (c) => {
  const db = createDb(c.env.DB);

  // Total games and tokens using sql template tag for complex aggregations
  const [totals] = await db
    .select({
      total_games: sql<number>`count(*)`,
      total_tokens: sql<number>`sum(${schema.games.totalTokens})`,
      mafia_wins: sql<number>`sum(case when ${schema.games.winner} = 'mafia' then 1 else 0 end)`,
      town_wins: sql<number>`sum(case when ${schema.games.winner} = 'town' then 1 else 0 end)`,
      avg_rounds: sql<number>`avg(${schema.games.rounds})`,
      avg_duration_ms: sql<number>`avg(${schema.games.durationMs})`,
    })
    .from(schema.games)
    .where(eq(schema.games.status, 'completed'));

  // Stats by provider
  const providerStats = await db
    .select({
      family: schema.models.family,
      games: sql<number>`count(distinct ${schema.gameParticipants.gameId})`,
      wins: sql<number>`sum(case when ${schema.gameParticipants.won} = 1 then 1 else 0 end)`,
      tokens: sql<number>`sum(${schema.leaderboard.totalTokens})`,
    })
    .from(schema.gameParticipants)
    .innerJoin(schema.models, eq(schema.gameParticipants.modelId, schema.models.id))
    .leftJoin(
      schema.leaderboard,
      and(
        eq(schema.gameParticipants.modelId, schema.leaderboard.modelId),
        eq(schema.gameParticipants.team, schema.leaderboard.team)
      )
    )
    .groupBy(schema.models.family);

  // Top models by win rate (min 3 games, exclude test models)
  const topModels = await db
    .select({
      model_id: schema.leaderboard.modelId,
      display_name: schema.models.displayName,
      family: schema.models.family,
      games: sql<number>`sum(${schema.leaderboard.gamesPlayed})`,
      wins: sql<number>`sum(${schema.leaderboard.gamesWon})`,
      win_rate: sql<number>`cast(sum(${schema.leaderboard.gamesWon}) as real) / sum(${schema.leaderboard.gamesPlayed})`,
    })
    .from(schema.leaderboard)
    .innerJoin(schema.models, eq(schema.leaderboard.modelId, schema.models.id))
    .where(notLike(schema.leaderboard.modelId, 'test/%'))
    .groupBy(schema.leaderboard.modelId)
    .having(sql`sum(${schema.leaderboard.gamesPlayed}) >= 3`)
    .orderBy(sql`win_rate desc`)
    .limit(5);

  return c.json({
    totals: {
      games: totals?.total_games ?? 0,
      tokens: totals?.total_tokens ?? 0,
      mafiaWins: totals?.mafia_wins ?? 0,
      townWins: totals?.town_wins ?? 0,
      avgRounds: totals?.avg_rounds ?? 0,
      avgDurationMs: totals?.avg_duration_ms ?? 0,
    },
    byProvider: providerStats,
    topModels,
  });
});

/**
 * GET /api/stats/matchups - Head-to-head model matchups.
 */
stats.get('/matchups', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const team = url.searchParams.get('team') as 'mafia' | 'town' | null;

  // Get all head-to-head matchups (excluding self-play and test models)
  // Keep as raw SQL due to complexity of self-join with aliased conditions
  const query = `
    SELECT 
      gp1.model_id as model_a,
      m1.display_name as model_a_name,
      gp2.model_id as model_b,
      m2.display_name as model_b_name,
      COUNT(DISTINCT gp1.game_id) as games,
      SUM(CASE WHEN gp1.won = 1 THEN 1 ELSE 0 END) as model_a_wins
    FROM game_participants gp1
    JOIN game_participants gp2 ON gp1.game_id = gp2.game_id 
      AND gp1.model_id != gp2.model_id
    JOIN models m1 ON gp1.model_id = m1.id
    JOIN models m2 ON gp2.model_id = m2.id
    WHERE m1.id NOT LIKE 'test/%' AND m2.id NOT LIKE 'test/%'
    ${team ? 'AND gp1.team = ?' : ''}
    GROUP BY gp1.model_id, gp2.model_id
    HAVING games >= 1
  `;

  const result = team
    ? await env.DB.prepare(query).bind(team).all()
    : await env.DB.prepare(query).all();

  // Get self-play statistics (same model on both teams)
  const selfPlayQuery = `
    SELECT 
      model_id,
      COUNT(DISTINCT game_id) as games,
      SUM(CASE WHEN winner = 'mafia' THEN 1 ELSE 0 END) as mafia_wins,
      SUM(CASE WHEN winner = 'town' THEN 1 ELSE 0 END) as town_wins
    FROM (
      SELECT DISTINCT gp_mafia.model_id, gp_mafia.game_id, g.winner
      FROM game_participants gp_mafia
      JOIN game_participants gp_town ON gp_mafia.game_id = gp_town.game_id
        AND gp_mafia.model_id = gp_town.model_id
        AND gp_mafia.team = 'mafia'
        AND gp_town.team = 'town'
      JOIN games g ON gp_mafia.game_id = g.id
    )
    GROUP BY model_id
    HAVING games >= 1
  `;

  const selfPlayResult = await env.DB.prepare(selfPlayQuery).all();

  // Get unique models for matrix (exclude test models)
  const db = createDb(env.DB);
  const models = await db
    .selectDistinct({
      id: schema.models.id,
      display_name: schema.models.displayName,
      family: schema.models.family,
    })
    .from(schema.models)
    .innerJoin(schema.gameParticipants, eq(schema.models.id, schema.gameParticipants.modelId))
    .where(notLike(schema.models.id, 'test/%'))
    .orderBy(schema.models.displayName);

  return c.json({
    matchups: result.results,
    selfPlay: selfPlayResult.results,
    models,
    filter: { team },
  });
});

/**
 * GET /api/stats/costs - Cost efficiency stats.
 */
stats.get('/costs', async (c) => {
  const db = createDb(c.env.DB);

  // Token usage and games by model (exclude test models)
  const modelCosts = await db
    .select({
      model_id: schema.leaderboard.modelId,
      display_name: schema.models.displayName,
      family: schema.models.family,
      games: sql<number>`sum(${schema.leaderboard.gamesPlayed})`,
      wins: sql<number>`sum(${schema.leaderboard.gamesWon})`,
      tokens: sql<number>`sum(${schema.leaderboard.totalTokens})`,
      win_rate: sql<number>`cast(sum(${schema.leaderboard.gamesWon}) as real) / nullif(sum(${schema.leaderboard.gamesPlayed}), 0)`,
      tokens_per_game: sql<number>`cast(sum(${schema.leaderboard.totalTokens}) as real) / nullif(sum(${schema.leaderboard.gamesPlayed}), 0)`,
    })
    .from(schema.leaderboard)
    .innerJoin(schema.models, eq(schema.leaderboard.modelId, schema.models.id))
    .where(notLike(schema.leaderboard.modelId, 'test/%'))
    .groupBy(schema.leaderboard.modelId)
    .orderBy(sql`tokens desc`);

  // Aggregate by provider (exclude test models)
  const providerCosts = await db
    .select({
      family: schema.models.family,
      games: sql<number>`sum(${schema.leaderboard.gamesPlayed})`,
      wins: sql<number>`sum(${schema.leaderboard.gamesWon})`,
      tokens: sql<number>`sum(${schema.leaderboard.totalTokens})`,
      win_rate: sql<number>`cast(sum(${schema.leaderboard.gamesWon}) as real) / nullif(sum(${schema.leaderboard.gamesPlayed}), 0)`,
      tokens_per_game: sql<number>`cast(sum(${schema.leaderboard.totalTokens}) as real) / nullif(sum(${schema.leaderboard.gamesPlayed}), 0)`,
    })
    .from(schema.leaderboard)
    .innerJoin(schema.models, eq(schema.leaderboard.modelId, schema.models.id))
    .where(notLike(schema.leaderboard.modelId, 'test/%'))
    .groupBy(schema.models.family)
    .orderBy(sql`tokens desc`);

  return c.json({
    byModel: modelCosts,
    byProvider: providerCosts,
  });
});

/**
 * GET /api/stats/trends - Activity trends over time.
 * Optimized to use pre-aggregated daily_stats table.
 */
stats.get('/trends', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  const url = new URL(c.req.url);
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);
  
  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

  // Use pre-aggregated daily_stats table for better performance
  const dailyStats = await db
    .select({
      date: schema.dailyStats.date,
      games: schema.dailyStats.gamesCompleted,
      mafia_wins: schema.dailyStats.mafiaWins,
      town_wins: schema.dailyStats.townWins,
      tokens: schema.dailyStats.tokensUsed,
    })
    .from(schema.dailyStats)
    .where(gte(schema.dailyStats.date, cutoffDateStr))
    .orderBy(schema.dailyStats.date);

  // Recent games activity (still needs to query games table for details)
  // Keep as raw SQL due to GROUP_CONCAT and complex join
  const recentActivity = await env.DB.prepare(`
    SELECT 
      g.id,
      g.winner,
      g.rounds,
      g.total_tokens,
      g.created_at,
      GROUP_CONCAT(DISTINCT m.display_name) as models
    FROM games g
    JOIN game_participants gp ON g.id = gp.game_id
    JOIN models m ON gp.model_id = m.id
    WHERE g.status = 'completed'
    GROUP BY g.id
    ORDER BY g.created_at DESC
    LIMIT 10
  `).all();

  return c.json({
    daily: dailyStats,
    recent: recentActivity.results,
    period: { days, cutoffDate: cutoffDateStr },
  });
});

/**
 * GET /api/stats/elo - ELO ratings for all models.
 * Reads pre-calculated ELO from database (updated incrementally on game completion).
 */
stats.get('/elo', async (c) => {
  const db = createDb(c.env.DB);
  
  // Read pre-calculated ELO ratings with proper win/loss counts from leaderboard
  // leaderboard has separate rows per team, so we aggregate them
  const modelsResult = await db
    .select({
      id: schema.models.id,
      display_name: schema.models.displayName,
      family: schema.models.family,
      elo_rating: schema.models.eloRating,
      elo_games_played: schema.models.eloGamesPlayed,
      elo_peak: schema.models.eloPeak,
      total_games: sql<number>`coalesce(sum(${schema.leaderboard.gamesPlayed}), 0)`,
      total_wins: sql<number>`coalesce(sum(${schema.leaderboard.gamesWon}), 0)`,
    })
    .from(schema.models)
    .leftJoin(schema.leaderboard, eq(schema.models.id, schema.leaderboard.modelId))
    .where(
      and(
        notLike(schema.models.id, 'test/%'),
        gte(schema.models.eloGamesPlayed, 3)
      )
    )
    .groupBy(schema.models.id)
    .orderBy(desc(schema.models.eloRating));

  const INITIAL_RATING = 1500;
  
  const rankings = modelsResult
    .filter(m => m.elo_games_played && m.elo_games_played >= 3)
    .map(m => {
      const games = m.total_games;
      const wins = m.total_wins;
      const losses = games - wins;
      return {
        display_name: m.display_name,
        model_ids: [m.id],
        elo: m.elo_rating ?? INITIAL_RATING,
        games,
        wins,
        losses,
        win_rate: games > 0 ? wins / games : 0,
        peak_elo: m.elo_peak ?? INITIAL_RATING,
      };
    });

  return c.json({
    rankings,
    metadata: {
      initial_rating: INITIAL_RATING,
      models_ranked: rankings.length,
    },
  });
});

export default stats;

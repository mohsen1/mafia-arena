/**
 * Stats API routes.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';

const stats = new Hono<{ Bindings: Env }>();

/**
 * GET /api/stats/overview - Aggregate stats overview.
 */
stats.get('/overview', async (c) => {
  const env = c.env;

  // Total games and tokens
  const totals = await env.DB.prepare(`
    SELECT 
      COUNT(*) as total_games,
      SUM(total_tokens) as total_tokens,
      SUM(CASE WHEN winner = 'mafia' THEN 1 ELSE 0 END) as mafia_wins,
      SUM(CASE WHEN winner = 'town' THEN 1 ELSE 0 END) as town_wins,
      AVG(rounds) as avg_rounds,
      AVG(duration_ms) as avg_duration_ms
    FROM games WHERE status = 'completed'
  `).first<{
    total_games: number;
    total_tokens: number;
    mafia_wins: number;
    town_wins: number;
    avg_rounds: number;
    avg_duration_ms: number;
  }>();

  // Stats by provider
  const providerStats = await env.DB.prepare(`
    SELECT 
      m.provider,
      COUNT(DISTINCT gp.game_id) as games,
      SUM(CASE WHEN gp.won = 1 THEN 1 ELSE 0 END) as wins,
      SUM(l.total_tokens) as tokens
    FROM game_participants gp
    JOIN models m ON gp.model_id = m.id
    LEFT JOIN leaderboard l ON gp.model_id = l.model_id AND gp.team = l.team
    GROUP BY m.provider
  `).all();

  // Top models by win rate (min 3 games, exclude test models)
  const topModels = await env.DB.prepare(`
    SELECT 
      l.model_id,
      m.display_name,
      m.provider,
      SUM(l.games_played) as games,
      SUM(l.games_won) as wins,
      CAST(SUM(l.games_won) AS REAL) / SUM(l.games_played) as win_rate
    FROM leaderboard l
    JOIN models m ON l.model_id = m.id
    WHERE l.model_id NOT LIKE 'test/%'
    GROUP BY l.model_id
    HAVING SUM(l.games_played) >= 3
    ORDER BY win_rate DESC
    LIMIT 5
  `).all();

  return c.json({
    totals: {
      games: totals?.total_games ?? 0,
      tokens: totals?.total_tokens ?? 0,
      mafiaWins: totals?.mafia_wins ?? 0,
      townWins: totals?.town_wins ?? 0,
      avgRounds: totals?.avg_rounds ?? 0,
      avgDurationMs: totals?.avg_duration_ms ?? 0,
    },
    byProvider: providerStats.results,
    topModels: topModels.results,
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
  const models = await env.DB.prepare(`
    SELECT DISTINCT m.id, m.display_name, m.provider
    FROM models m
    JOIN game_participants gp ON m.id = gp.model_id
    WHERE m.id NOT LIKE 'test/%'
    ORDER BY m.display_name
  `).all();

  return c.json({
    matchups: result.results,
    selfPlay: selfPlayResult.results,
    models: models.results,
    filter: { team },
  });
});

/**
 * GET /api/stats/costs - Cost efficiency stats.
 */
stats.get('/costs', async (c) => {
  const env = c.env;

  // Token usage and games by model (exclude test models)
  const modelCosts = await env.DB.prepare(`
    SELECT 
      l.model_id,
      m.display_name,
      m.provider,
      SUM(l.games_played) as games,
      SUM(l.games_won) as wins,
      SUM(l.total_tokens) as tokens,
      CAST(SUM(l.games_won) AS REAL) / NULLIF(SUM(l.games_played), 0) as win_rate,
      CAST(SUM(l.total_tokens) AS REAL) / NULLIF(SUM(l.games_played), 0) as tokens_per_game
    FROM leaderboard l
    JOIN models m ON l.model_id = m.id
    WHERE l.model_id NOT LIKE 'test/%'
    GROUP BY l.model_id
    ORDER BY tokens DESC
  `).all();

  // Aggregate by provider (exclude test models)
  const providerCosts = await env.DB.prepare(`
    SELECT 
      m.provider,
      SUM(l.games_played) as games,
      SUM(l.games_won) as wins,
      SUM(l.total_tokens) as tokens,
      CAST(SUM(l.games_won) AS REAL) / NULLIF(SUM(l.games_played), 0) as win_rate,
      CAST(SUM(l.total_tokens) AS REAL) / NULLIF(SUM(l.games_played), 0) as tokens_per_game
    FROM leaderboard l
    JOIN models m ON l.model_id = m.id
    WHERE l.model_id NOT LIKE 'test/%'
    GROUP BY m.provider
    ORDER BY tokens DESC
  `).all();

  return c.json({
    byModel: modelCosts.results,
    byProvider: providerCosts.results,
  });
});

/**
 * GET /api/stats/trends - Activity trends over time.
 * Optimized to use pre-aggregated daily_stats table.
 */
stats.get('/trends', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const days = parseInt(url.searchParams.get('days') ?? '30', 10);
  
  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffDateStr = cutoffDate.toISOString().slice(0, 10);

  // Use pre-aggregated daily_stats table for better performance
  const dailyStats = await env.DB.prepare(`
    SELECT 
      date,
      games_completed as games,
      mafia_wins,
      town_wins,
      tokens_used as tokens
    FROM daily_stats
    WHERE date >= ?
    ORDER BY date ASC
  `).bind(cutoffDateStr).all();

  // Recent games activity (still needs to query games table for details)
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
    daily: dailyStats.results,
    recent: recentActivity.results,
    period: { days, cutoffDate: cutoffDateStr },
  });
});

export default stats;



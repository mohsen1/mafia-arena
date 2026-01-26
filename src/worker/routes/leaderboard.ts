/**
 * Leaderboard API routes.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { paginated } from '../types/api.js';

const leaderboard = new Hono<{ Bindings: Env }>();

/**
 * GET /api/leaderboard - Get model rankings.
 */
leaderboard.get('/', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const team = url.searchParams.get('team');
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  // Base query with test model exclusion and minimum sample size
  // Models need at least 3 games to appear on leaderboard for statistical significance
  let query = `
    SELECT
      l.model_id,
      l.team,
      l.games_played,
      l.games_won,
      l.total_tokens,
      CASE WHEN l.games_played > 0
        THEN CAST(l.games_won AS REAL) / l.games_played
        ELSE 0
      END as win_rate,
      m.display_name,
      m.family as provider
    FROM leaderboard l
    LEFT JOIN models m ON l.model_id = m.id
    WHERE l.model_id NOT LIKE 'test/%'
      AND l.games_played >= 3
  `;

  if (team && (team === 'mafia' || team === 'town')) {
    query += ` AND l.team = '${team}'`;
  }

  query += ' ORDER BY win_rate DESC, games_played DESC';

  const result = await env.DB.prepare(query).all<{
    model_id: string;
    team: string;
    games_played: number;
    games_won: number;
    total_tokens: number;
    win_rate: number;
    display_name: string;
    provider: string;
  }>();

  // Convert to camelCase for API response
  const rankings = (result.results ?? []).map(entry => ({
    modelId: entry.model_id,
    displayName: entry.display_name,
    provider: entry.provider,
    team: entry.team,
    gamesPlayed: entry.games_played,
    gamesWon: entry.games_won,
    winRate: entry.win_rate,
    totalTokens: entry.total_tokens,
  }));

  const total = rankings.length;
  const paginatedRankings = rankings.slice(offset, offset + limit);

  return c.json(paginated(paginatedRankings, total, limit, offset));
});

export default leaderboard;



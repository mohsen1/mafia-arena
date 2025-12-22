/**
 * Leaderboard API routes.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';

const leaderboard = new Hono<{ Bindings: Env }>();

/**
 * GET /api/leaderboard - Get model rankings.
 */
leaderboard.get('/', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const team = url.searchParams.get('team');

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
      m.provider
    FROM leaderboard l
    LEFT JOIN models m ON l.model_id = m.id
  `;

  if (team && (team === 'mafia' || team === 'town')) {
    query += ` WHERE l.team = '${team}'`;
  }

  query += ' ORDER BY win_rate DESC, games_played DESC';

  const result = await env.DB.prepare(query).all();

  return c.json({ rankings: result.results });
});

export default leaderboard;



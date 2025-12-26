/**
 * Analysis API routes for persona patterns.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { Errors } from '../utils/errors.js';

const analysis = new Hono<{ Bindings: Env }>();

/**
 * GET /api/analysis/persona-correlations - Which persona types correlate with winning.
 */
analysis.get('/persona-correlations', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const modelId = url.searchParams.get('model') ?? undefined;
  const team = url.searchParams.get('team') as 'mafia' | 'town' | undefined;
  const minUsage = parseInt(url.searchParams.get('minUsage') ?? '1', 10);

  const query = `
    SELECT 
      p.model_id,
      m.display_name,
      p.team,
      p.personality_type,
      p.usage_count,
      CASE WHEN p.usage_count > 0 
        THEN CAST(p.win_count AS REAL) / p.usage_count 
        ELSE 0 
      END as win_rate,
      p.avg_consistency_score as avg_consistency
    FROM persona_patterns p
    LEFT JOIN models m ON p.model_id = m.id
    WHERE p.usage_count >= ?
    ${modelId ? 'AND p.model_id = ?' : ''}
    ${team ? `AND p.team = ?` : ''}
    ORDER BY win_rate DESC, p.usage_count DESC
  `;

  const params: (string | number)[] = [minUsage];
  if (modelId) params.push(modelId);
  if (team) params.push(team);

  const result = await env.DB.prepare(query).bind(...params).all();

  return c.json({
    correlations: result.results,
    filters: { modelId, team, minUsage },
  });
});

/**
 * GET /api/analysis/team-patterns - How persona choices differ between teams.
 */
analysis.get('/team-patterns', async (c) => {
  const env = c.env;

  const mafiaResult = await env.DB.prepare(`
    SELECT 
      personality_type as personality,
      SUM(usage_count) as total_usage
    FROM persona_patterns 
    WHERE team = 'mafia'
    GROUP BY personality_type
    ORDER BY total_usage DESC
  `).all<{ personality: string; total_usage: number }>();

  const townResult = await env.DB.prepare(`
    SELECT 
      personality_type as personality,
      SUM(usage_count) as total_usage
    FROM persona_patterns 
    WHERE team = 'town'
    GROUP BY personality_type
    ORDER BY total_usage DESC
  `).all<{ personality: string; total_usage: number }>();

  const mafiaTotal = mafiaResult.results.reduce((sum, r) => sum + r.total_usage, 0);
  const townTotal = townResult.results.reduce((sum, r) => sum + r.total_usage, 0);

  return c.json({
    mafia: mafiaResult.results.map(r => ({
      personality: r.personality,
      count: r.total_usage,
      percentage: mafiaTotal > 0 ? ((r.total_usage / mafiaTotal) * 100).toFixed(1) : '0',
    })),
    town: townResult.results.map(r => ({
      personality: r.personality,
      count: r.total_usage,
      percentage: townTotal > 0 ? ((r.total_usage / townTotal) * 100).toFixed(1) : '0',
    })),
    totals: { mafia: mafiaTotal, town: townTotal },
  });
});

/**
 * GET /api/analysis/model-patterns/:modelId - Persona fingerprint for a specific model.
 */
analysis.get('/model-patterns/:modelId', async (c) => {
  const env = c.env;
  const modelId = c.req.param('modelId');

  // Get model info
  const model = await env.DB.prepare('SELECT * FROM models WHERE id = ?')
    .bind(modelId)
    .first();

  if (!model) {
    throw Errors.NotFound('Model');
  }

  // Get mafia patterns
  const mafiaPatterns = await env.DB.prepare(`
    SELECT 
      personality_type,
      usage_count,
      win_count,
      avg_consistency_score,
      CASE WHEN usage_count > 0 
        THEN CAST(win_count AS REAL) / usage_count 
        ELSE 0 
      END as win_rate
    FROM persona_patterns 
    WHERE model_id = ? AND team = 'mafia'
    ORDER BY usage_count DESC
  `).bind(modelId).all();

  // Get town patterns
  const townPatterns = await env.DB.prepare(`
    SELECT 
      personality_type,
      usage_count,
      win_count,
      avg_consistency_score,
      CASE WHEN usage_count > 0 
        THEN CAST(win_count AS REAL) / usage_count 
        ELSE 0 
      END as win_rate
    FROM persona_patterns 
    WHERE model_id = ? AND team = 'town'
    ORDER BY usage_count DESC
  `).bind(modelId).all();

  // Calculate overall stats
  const allPatterns = [...mafiaPatterns.results, ...townPatterns.results] as Record<string, unknown>[];
  const totalGames = allPatterns.reduce((sum, p) => sum + (p.usage_count as number), 0);
  const totalWins = allPatterns.reduce((sum, p) => sum + (p.win_count as number), 0);
  const consistencyScores = allPatterns
    .filter(p => p.avg_consistency_score !== null)
    .map(p => p.avg_consistency_score as number);
  const avgConsistency = consistencyScores.length > 0
    ? consistencyScores.reduce((a, b) => a + b, 0) / consistencyScores.length
    : null;

  return c.json({
    model,
    mafia: mafiaPatterns.results,
    town: townPatterns.results,
    summary: {
      totalGames,
      overallWinRate: totalGames > 0 ? (totalWins / totalGames).toFixed(3) : '0',
      avgConsistency: avgConsistency?.toFixed(3) ?? null,
      dominantMafiaPersonality: mafiaPatterns.results[0] ?? null,
      dominantTownPersonality: townPatterns.results[0] ?? null,
    },
  });
});

/**
 * GET /api/analysis/win-rate-by-personality - Win rates by personality type.
 */
analysis.get('/win-rate-by-personality', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const team = url.searchParams.get('team') as 'mafia' | 'town' | undefined;

  const query = `
    SELECT 
      personality_type as personality,
      SUM(usage_count) as games,
      SUM(win_count) as wins,
      CASE WHEN SUM(usage_count) > 0
        THEN CAST(SUM(win_count) AS REAL) / SUM(usage_count)
        ELSE 0
      END as win_rate
    FROM persona_patterns
    ${team ? 'WHERE team = ?' : ''}
    GROUP BY personality_type
    ORDER BY win_rate DESC
  `;

  const result = team
    ? await env.DB.prepare(query).bind(team).all()
    : await env.DB.prepare(query).all();

  return c.json({
    results: result.results.map((r: Record<string, unknown>) => ({
      personality: r.personality,
      games: r.games,
      wins: r.wins,
      winRate: parseFloat((r.win_rate as number).toFixed(3)),
    })),
    team: team ?? 'all',
  });
});

export default analysis;




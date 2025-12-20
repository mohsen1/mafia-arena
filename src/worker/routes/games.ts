/**
 * Game-related API routes.
 */

import { Hono } from 'hono';
import type { Env, GameQueueMessage } from '../types.js';
import { Errors } from '../utils/errors.js';
import { checkBudget } from '../utils/budget.js';

const games = new Hono<{ Bindings: Env }>();

/**
 * POST /api/games/run - Queue a batch of games.
 */
games.post('/run', async (c) => {
  const env = c.env;

  // Check daily budget
  const budget = await checkBudget(env.DB);
  if (!budget.allowed) {
    throw Errors.BudgetExceeded();
  }

  interface RunGamesRequest {
    count: number;
    config: {
      playerCount: number;
      mafiaCount: number;
      teams: Array<{
        modelId: string;
        team: 'mafia' | 'town';
        count: number;
      }>;
      maxRounds?: number;
      discussionEnabled?: boolean;
      personaConstraints?: 'strict' | 'moderate' | 'free';
      contextLevel?: 'full' | 'windowed' | 'summary';
      contextWindowSize?: number;
    };
  }

  let body: RunGamesRequest;
  try {
    body = await c.req.json<RunGamesRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Validate request
  if (!body.count || body.count < 1 || body.count > 100) {
    throw Errors.BadRequest('Count must be between 1 and 100');
  }

  if (!body.config || !body.config.teams || body.config.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  // Generate batch and game IDs
  const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const gameIds: string[] = [];
  const messages: MessageSendRequest<GameQueueMessage>[] = [];

  for (let i = 0; i < body.count; i++) {
    const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${i}`;
    gameIds.push(gameId);

    messages.push({
      body: {
        gameId,
        batchId,
        config: {
          playerCount: body.config.playerCount,
          mafiaCount: body.config.mafiaCount,
          teams: body.config.teams,
          maxRounds: body.config.maxRounds ?? 10,
          discussionEnabled: body.config.discussionEnabled ?? true,
          personaConstraints: body.config.personaConstraints ?? 'moderate',
          contextLevel: body.config.contextLevel ?? 'summary',
          contextWindowSize: body.config.contextWindowSize ?? 3,
        },
        createdAt: Date.now(),
      },
    });
  }

  // Send to queue
  await env.GAME_QUEUE.sendBatch(messages);

  return c.json({
    success: true,
    batchId,
    queued: body.count,
    gameIds,
    contextLevel: body.config.contextLevel ?? 'summary',
    budget: {
      spent: budget.spent.toFixed(4),
      remaining: budget.remaining.toFixed(4),
      limit: budget.limit,
    },
  });
});

/**
 * POST /api/games/run-direct - Run a game directly without queue.
 */
games.post('/run-direct', async (c) => {
  const env = c.env;

  const budget = await checkBudget(env.DB);
  if (!budget.allowed) {
    throw Errors.BudgetExceeded();
  }

  interface RunGameDirectRequest {
    config: {
      playerCount: number;
      mafiaCount: number;
      teams: Array<{
        modelId: string;
        team: 'mafia' | 'town';
        count: number;
      }>;
      maxRounds?: number;
      discussionEnabled?: boolean;
      personaConstraints?: 'strict' | 'moderate' | 'free';
      contextLevel?: 'full' | 'windowed' | 'summary';
      contextWindowSize?: number;
    };
  }

  let body: RunGameDirectRequest;
  try {
    body = await c.req.json<RunGameDirectRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  if (!body.config || !body.config.teams || body.config.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_direct`;
  const batchId = `batch_${Date.now().toString(36)}_direct`;

  // Get Durable Object instance and run directly
  const id = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(id);

  console.log(`Running game ${gameId} directly (bypassing queue)`);

  const response = await stub.fetch('http://internal/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      batchId,
      config: {
        playerCount: body.config.playerCount,
        mafiaCount: body.config.mafiaCount,
        teams: body.config.teams,
        maxRounds: body.config.maxRounds ?? 10,
        discussionEnabled: body.config.discussionEnabled ?? true,
        personaConstraints: body.config.personaConstraints ?? 'moderate',
        contextLevel: body.config.contextLevel ?? 'summary',
        contextWindowSize: body.config.contextWindowSize ?? 3,
      },
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error: string };
    throw Errors.Internal(error.error ?? 'Failed to start game');
  }

  const result = await response.json() as { success: boolean; gameId: string; seed: number };

  return c.json({
    success: true,
    gameId,
    batchId,
    seed: result.seed,
    contextLevel: body.config.contextLevel ?? 'summary',
    message: 'Game started directly (bypassing queue). Check /api/games after ~30-60s.',
    budget: {
      spent: budget.spent.toFixed(4),
      remaining: budget.remaining.toFixed(4),
      limit: budget.limit,
    },
  });
});

/**
 * GET /api/games - List completed games.
 */
games.get('/', async (c) => {
  const env = c.env;
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const status = url.searchParams.get('status') ?? 'completed';

  const countResult = await env.DB
    .prepare('SELECT COUNT(*) as count FROM games WHERE status = ?')
    .bind(status)
    .first<{ count: number }>();

  const gamesResult = await env.DB
    .prepare(
      `SELECT id, batch_id, winner, rounds, duration_ms, total_tokens, created_at
       FROM games
       WHERE status = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(status, limit, offset)
    .all();

  // Get participants for each game to show model matchups
  const gameIds = gamesResult.results.map((g: Record<string, unknown>) => g.id as string);
  let participantsMap: Record<string, Array<{ model_id: string; model_name: string; team: string }>> = {};
  
  if (gameIds.length > 0) {
    const participantsResult = await env.DB
      .prepare(
        `SELECT gp.game_id, gp.model_id, gp.team, m.display_name as model_name
         FROM game_participants gp
         LEFT JOIN models m ON gp.model_id = m.id
         WHERE gp.game_id IN (${gameIds.map(() => '?').join(',')})`
      )
      .bind(...gameIds)
      .all();

    for (const p of participantsResult.results as Record<string, unknown>[]) {
      const gameId = p.game_id as string;
      if (!participantsMap[gameId]) {
        participantsMap[gameId] = [];
      }
      participantsMap[gameId]!.push({
        model_id: p.model_id as string,
        model_name: (p.model_name as string) || (p.model_id as string),
        team: p.team as string,
      });
    }
  }

  // Attach participants to games
  const gamesWithParticipants = gamesResult.results.map((game: Record<string, unknown>) => ({
    ...game,
    participants: participantsMap[game.id as string] || [],
  }));

  return c.json({
    games: gamesWithParticipants,
    total: countResult?.count ?? 0,
    hasMore: offset + limit < (countResult?.count ?? 0),
    limit,
    offset,
  });
});

/**
 * GET /api/games/:id - Get game details.
 */
games.get('/:id', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  const game = await env.DB
    .prepare('SELECT * FROM games WHERE id = ?')
    .bind(gameId)
    .first();

  if (!game) {
    throw Errors.NotFound('Game');
  }

  const participants = await env.DB
    .prepare(
      `SELECT gp.*, m.display_name as model_name
       FROM game_participants gp
       LEFT JOIN models m ON gp.model_id = m.id
       WHERE gp.game_id = ?`
    )
    .bind(gameId)
    .all();

  return c.json({
    ...game,
    participants: participants.results,
    transcriptUrl: `/api/games/${gameId}/transcript`,
  });
});

/**
 * GET /api/games/:id/transcript - Get full game transcript from R2.
 */
games.get('/:id/transcript', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  const object = await env.TRANSCRIPTS.get(`games/${gameId}/transcript.json`);

  if (!object) {
    throw Errors.NotFound('Transcript');
  }

  const transcript = await object.json();
  return c.json(transcript);
});

/**
 * GET /api/games/:id/personas - Get personas for a specific game.
 */
games.get('/:id/personas', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  // Check game exists
  const game = await env.DB.prepare('SELECT id, persona_enabled FROM games WHERE id = ?')
    .bind(gameId)
    .first<{ id: string; persona_enabled: number }>();

  if (!game) {
    throw Errors.NotFound('Game');
  }

  if (!game.persona_enabled) {
    return c.json({
      gameId,
      personaEnabled: false,
      personas: [],
      analysis: null,
    });
  }

  // Get personas
  const personas = await env.DB.prepare(`
    SELECT 
      gp.*,
      m.display_name as model_name
    FROM game_personas gp
    LEFT JOIN models m ON gp.model_id = m.id
    WHERE gp.game_id = ?
    ORDER BY gp.created_at
  `).bind(gameId).all();

  // Get analysis
  const analysis = await env.DB.prepare(`
    SELECT * FROM game_persona_analysis WHERE game_id = ?
  `).bind(gameId).first();

  return c.json({
    gameId,
    personaEnabled: true,
    personas: personas.results.map((p: Record<string, unknown>) => ({
      playerId: p.player_id,
      modelId: p.model_id,
      modelName: p.model_name || p.model_id,
      team: p.team,
      persona: {
        name: p.persona_name,
        background: p.persona_background,
        personality: p.persona_personality,
        occupation: p.persona_occupation,
      },
      consistency: {
        score: p.consistency_score,
        nameUsageCount: p.name_usage_count,
        personalityAlignment: p.personality_alignment_score,
        inconsistencies: p.inconsistencies ? JSON.parse(p.inconsistencies as string) : [],
      },
    })),
    analysis: analysis ? {
      averageScore: (analysis as Record<string, unknown>).average_consistency_score,
      mafiaAvgConsistency: (analysis as Record<string, unknown>).mafia_avg_consistency,
      townAvgConsistency: (analysis as Record<string, unknown>).town_avg_consistency,
    } : null,
  });
});

export default games;


/**
 * Game-related API routes.
 */

import { Hono } from 'hono';
import type { Env, GameQueueMessage } from '../types.js';
import { Errors } from '../utils/errors.js';
import { getRandomTheme } from '../utils/random-config.js';
import { generateTraceId } from '../utils/trace.js';

const games = new Hono<{ Bindings: Env }>();

/**
 * POST /api/games/run - Queue a batch of games.
 */
games.post('/run', async (c) => {
  const env = c.env;

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
      personaTheme?: 'noir' | 'victorian' | 'modern' | 'fantasy';
      /** Use discount pricing (50% cheaper, up to 24h response time) */
      discountPricing?: boolean;
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

  // Generate trace ID for this batch request
  const traceId = generateTraceId();
  const discountPricing = body.config.discountPricing ?? false;

  // Generate batch and game IDs
  const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const gameIds: string[] = [];
  const messages: MessageSendRequest<GameQueueMessage>[] = [];

  console.log(`[${traceId}] Creating batch ${batchId} with ${body.count} games (discountPricing: ${discountPricing})`);

  for (let i = 0; i < body.count; i++) {
    const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_${i}`;
    gameIds.push(gameId);

    // Each game gets a random theme for variety (unless specified)
    const personaTheme = body.config.personaTheme ?? getRandomTheme();

    messages.push({
      body: {
        gameId,
        batchId,
        config: {
          playerCount: body.config.playerCount,
          mafiaCount: body.config.mafiaCount,
          teams: body.config.teams,
          maxRounds: 10,
          discussionEnabled: true,
          personaConstraints: 'moderate',
          contextLevel: 'windowed', // Optimized default: reduces token usage vs 'full'
          contextWindowSize: 3,
          personaTheme,
          discountPricing,
        },
        createdAt: Date.now(),
        traceId,
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
    contextLevel: 'full',
    discountPricing,
    traceId,
  });
});

/**
 * POST /api/games/run-direct - Run a game directly without queue.
 */
games.post('/run-direct', async (c) => {
  const env = c.env;

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
      personaTheme?: 'noir' | 'victorian' | 'modern' | 'fantasy';
      /** Use discount pricing (50% cheaper, up to 24h response time) */
      discountPricing?: boolean;
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

  // Generate trace ID for this direct game
  const traceId = generateTraceId();
  const discountPricing = body.config.discountPricing ?? false;

  const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_direct`;
  const batchId = `batch_${Date.now().toString(36)}_direct`;

  // Pick random theme if not specified
  const personaTheme = body.config.personaTheme ?? getRandomTheme();

  // Get Durable Object instance and run directly
  const id = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(id);

  console.log(`[${traceId}] Running game ${gameId} directly (discountPricing: ${discountPricing})`);

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
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme,
        discountPricing,
      },
      traceId,
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error: string };
    throw Errors.Internal(error.error ?? 'Failed to start game');
  }

  const result = await response.json() as { success: boolean; gameId: string; seed: number };

  const estimatedTime = discountPricing 
    ? 'Game uses discount pricing. May take up to 24 hours per AI response.'
    : 'Check /api/games after ~30-60s.';

  return c.json({
    success: true,
    gameId,
    batchId,
    seed: result.seed,
    contextLevel: 'full',
    discountPricing,
    message: `Game started directly (bypassing queue). ${estimatedTime}`,
    traceId,
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
      `SELECT id, batch_id, winner, rounds, duration_ms, total_tokens, persona_theme, status, created_at
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
 * Streams directly from R2 to reduce memory pressure.
 */
games.get('/:id/transcript', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  const object = await env.TRANSCRIPTS.get(`games/${gameId}/transcript.json`);

  if (!object) {
    throw Errors.NotFound('Transcript');
  }

  // Stream directly from R2 instead of loading into memory
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

/**
 * GET /api/games/:id/live - WebSocket endpoint for live game streaming.
 * Upgrades to WebSocket connection to receive real-time game events.
 */
games.get('/:id/live', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  // Check if this is a WebSocket upgrade request
  const upgradeHeader = c.req.header('Upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return c.text('Expected Upgrade: websocket header', 426);
  }

  // Get the Durable Object instance for this game
  const doId = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(doId);

  // Forward the WebSocket upgrade request to the Durable Object
  // Use internal URL - DO's fetch handles this internally
  // Clone the original request to preserve all WebSocket-related headers
  const wsRequest = new Request('http://internal/websocket', {
    method: 'GET',
    headers: c.req.raw.headers,
  });
  
  return stub.fetch(wsRequest);
});

/**
 * GET /api/games/:id/events - Get current events (polling fallback).
 * Returns current game state and all events so far.
 */
games.get('/:id/events', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  // Get the Durable Object instance for this game
  const doId = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(doId);

  // Forward the request to the Durable Object
  const response = await stub.fetch(new Request('http://internal/events'));
  const data = await response.json();

  return c.json(data);
});

/**
 * GET /api/games/:id/health - Get detailed health status for a running game.
 * Useful for monitoring and detecting stuck/crashed games.
 * 
 * Returns:
 * - healthStatus: 'healthy' | 'warning' | 'critical' | 'idle' | 'completed'
 * - heartbeat: When game last proved it's alive
 * - activity: When game last made progress
 * - execution: Current phase/round being executed
 */
games.get('/:id/health', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  // Get the Durable Object instance for this game
  const doId = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(doId);

  // Forward the request to the Durable Object
  const response = await stub.fetch(new Request('http://internal/health'));
  const data = await response.json();

  // Preserve HTTP status from DO (503 for critical health)
  return c.json(data, response.status as 200 | 503);
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


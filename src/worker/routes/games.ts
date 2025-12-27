/**
 * Game-related API routes.
 */

import { Hono } from 'hono';
import { eq, desc, inArray, sql, and } from 'drizzle-orm';
import type { Env, GameQueueMessage } from '../types.js';
import { Errors } from '../utils/errors.js';
import { getRandomTheme } from '../utils/random-config.js';
import { generateTraceId } from '../utils/trace.js';
import { createDb } from '../db/drizzle.js';
import * as schema from '../db/schema.js';
import { getSession } from './auth.js';
import { validateEncryptionSecret } from '../utils/crypto.js';
import { inferProviderFromModelId } from '../ai/factory.js';

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
 * Map model IDs to their required API providers.
 * Checks DB for explicit routing config first, then falls back to prefix inference.
 * 
 * @param modelIds - List of model IDs
 * @param env - Environment with DB access
 * @returns Set of provider names that require API keys
 */
async function getRequiredProviders(modelIds: string[], env: Env): Promise<Set<string>> {
  const providers = new Set<string>();
  
  // Fetch model configs from DB to check for explicit api_provider
  const uniqueModelIds = [...new Set(modelIds)];
  if (uniqueModelIds.length > 0) {
    const placeholders = uniqueModelIds.map(() => '?').join(',');
    const result = await env.DB.prepare(
      `SELECT id, api_provider FROM models WHERE id IN (${placeholders})`
    ).bind(...uniqueModelIds).all<{ id: string; api_provider: string }>();
    
    const dbProviderMap = new Map(
      (result.results ?? []).map(m => [m.id, m.api_provider])
    );
    
    for (const modelId of modelIds) {
      // Use DB provider if explicitly configured, otherwise infer from prefix
      const dbProvider = dbProviderMap.get(modelId);
      if (dbProvider) {
        providers.add(dbProvider);
      } else {
        providers.add(inferProviderFromModelId(modelId));
      }
    }
  }
  
  return providers;
}

/**
 * POST /api/games/run-direct - Run a game directly without queue.
 * 
 * Authentication:
 * - Admin users can use system API keys
 * - Non-admin users must have their own API keys for required providers
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

  // Check user authentication
  const session = await getSession(c.req.raw, env);
  
  // Encrypted user API keys to pass to GameRunner (for persistence across DO eviction)
  let encryptedUserKeys: Record<string, { encrypted: string; iv: string }> | undefined;
  let keySource: 'system' | 'user' = 'system';
  
  if (session && !session.isAdmin) {
    // Non-admin user: must use their own API keys
    const modelIds = body.config.teams.map(t => t.modelId);
    const requiredProviders = await getRequiredProviders(modelIds, env);
    
    // Check if encryption is configured
    if (!validateEncryptionSecret(env.ENCRYPTION_SECRET)) {
      throw Errors.Internal('Key management not configured');
    }
    
    // Fetch user's encrypted API keys directly from D1
    let query = `SELECT provider, encrypted_key, iv_vector FROM user_api_keys WHERE user_id = ?`;
    const params: string[] = [session.userId];
    
    if (requiredProviders.size > 0) {
      const placeholders = [...requiredProviders].map(() => '?').join(', ');
      query += ` AND provider IN (${placeholders})`;
      params.push(...requiredProviders);
    }
    
    const result = await env.DB.prepare(query).bind(...params).all<{
      provider: string;
      encrypted_key: string;
      iv_vector: string;
    }>();
    
    const userKeyRows = result.results ?? [];
    const foundProviders = new Set(userKeyRows.map(r => r.provider));
    
    // Validate user has all required keys
    const missingProviders: string[] = [];
    for (const provider of requiredProviders) {
      if (!foundProviders.has(provider)) {
        missingProviders.push(provider);
      }
    }
    
    if (missingProviders.length > 0) {
      throw Errors.Forbidden(
        `Missing API keys for: ${missingProviders.join(', ')}. ` +
        `Please add your API keys in the Account page to run games with these models.`
      );
    }
    
    // Build encrypted keys map to pass to GameRunner
    encryptedUserKeys = {};
    for (const row of userKeyRows) {
      encryptedUserKeys[row.provider] = {
        encrypted: row.encrypted_key,
        iv: row.iv_vector,
      };
    }
    keySource = 'user';
    
    console.log(`User ${session.email} running game with their own API keys for: ${[...requiredProviders].join(', ')}`);
  } else if (session?.isAdmin) {
    // Admin user: use system keys
    console.log(`Admin ${session.email} running game with system API keys`);
  } else {
    // No session: use system keys (for backwards compatibility with queue/admin routes)
    // This path is typically used by the admin UI which handles auth separately
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

  console.log(`[${traceId}] Running game ${gameId} directly (discountPricing: ${discountPricing}, keys: ${keySource})`);

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
      // Pass encrypted user API keys (persisted in DO storage to survive eviction)
      ...(encryptedUserKeys && { encryptedUserKeys }),
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
    keySource,
    message: `Game started directly (bypassing queue). ${estimatedTime}`,
    traceId,
  });
});

/**
 * GET /api/games - List completed games with optional filters.
 * 
 * Query params:
 * - limit: Max games to return (default 20, max 100)
 * - offset: Pagination offset (default 0)
 * - status: Filter by status (default 'completed')
 * - model: Filter by model ID (games where this model participated)
 * - winner: Filter by winner ('mafia' | 'town')
 * - theme: Filter by persona theme ('noir' | 'victorian' | 'modern' | 'fantasy')
 */
games.get('/', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const status = (url.searchParams.get('status') ?? 'completed') as 'running' | 'completed' | 'failed';
  
  // Optional filters
  const modelFilter = url.searchParams.get('model');
  const winnerFilter = url.searchParams.get('winner') as 'mafia' | 'town' | null;
  const themeFilter = url.searchParams.get('theme') as 'noir' | 'victorian' | 'modern' | 'fantasy' | null;

  // Build WHERE conditions
  const conditions = [eq(schema.games.status, status)];
  if (winnerFilter && (winnerFilter === 'mafia' || winnerFilter === 'town')) {
    conditions.push(eq(schema.games.winner, winnerFilter));
  }
  if (themeFilter && ['noir', 'victorian', 'modern', 'fantasy'].includes(themeFilter)) {
    conditions.push(eq(schema.games.personaTheme, themeFilter));
  }

  // If filtering by model, we need to join with participants
  let gamesResult;
  let countResult;
  
  if (modelFilter) {
    // Get game IDs that have this model as participant
    const gameIdsWithModel = db
      .selectDistinct({ gameId: schema.gameParticipants.gameId })
      .from(schema.gameParticipants)
      .where(eq(schema.gameParticipants.modelId, modelFilter));
    
    const modelCondition = inArray(schema.games.id, gameIdsWithModel);
    
    [gamesResult, countResult] = await Promise.all([
      db
        .select({
          id: schema.games.id,
          batch_id: schema.games.batchId,
          winner: schema.games.winner,
          rounds: schema.games.rounds,
          duration_ms: schema.games.durationMs,
          total_tokens: schema.games.totalTokens,
          persona_theme: schema.games.personaTheme,
          status: schema.games.status,
          created_at: schema.games.createdAt,
          cost_usd: schema.games.costUsd,
        })
        .from(schema.games)
        .where(and(...conditions, modelCondition))
        .orderBy(desc(schema.games.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.games)
        .where(and(...conditions, modelCondition)),
    ]);
  } else {
    // No model filter - simpler query
    [gamesResult, countResult] = await Promise.all([
      db
        .select({
          id: schema.games.id,
          batch_id: schema.games.batchId,
          winner: schema.games.winner,
          rounds: schema.games.rounds,
          duration_ms: schema.games.durationMs,
          total_tokens: schema.games.totalTokens,
          persona_theme: schema.games.personaTheme,
          status: schema.games.status,
          created_at: schema.games.createdAt,
          cost_usd: schema.games.costUsd,
        })
        .from(schema.games)
        .where(and(...conditions))
        .orderBy(desc(schema.games.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(schema.games)
        .where(and(...conditions)),
    ]);
  }

  const total = countResult[0]?.count ?? 0;

  // Get participants for each game to show model matchups
  const gameIds = gamesResult.map(g => g.id);
  type ParticipantInfo = { model_id: string; model_name: string | null; team: 'mafia' | 'town' };
  let participantsMap: Record<string, ParticipantInfo[]> = {};
  
  if (gameIds.length > 0) {
    const participantsResult = await db
      .select({
        game_id: schema.gameParticipants.gameId,
        model_id: schema.gameParticipants.modelId,
        team: schema.gameParticipants.team,
        model_name: schema.models.displayName,
      })
      .from(schema.gameParticipants)
      .leftJoin(schema.models, eq(schema.gameParticipants.modelId, schema.models.id))
      .where(inArray(schema.gameParticipants.gameId, gameIds));

    for (const p of participantsResult) {
      if (!participantsMap[p.game_id]) {
        participantsMap[p.game_id] = [];
      }
      participantsMap[p.game_id]!.push({
        model_id: p.model_id,
        model_name: p.model_name,
        team: p.team,
      });
    }
  }

  // Attach participants to games
  const gamesWithParticipants = gamesResult.map(game => ({
    ...game,
    participants: participantsMap[game.id] || [],
  }));

  return c.json({
    games: gamesWithParticipants,
    total,
    hasMore: offset + limit < total,
    limit,
    offset,
    filters: {
      model: modelFilter,
      winner: winnerFilter,
      theme: themeFilter,
    },
  });
});

/**
 * GET /api/games/:id - Get game details.
 */
games.get('/:id', async (c) => {
  const env = c.env;
  const db = createDb(env.DB);
  const gameId = c.req.param('id');

  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }

  const participants = await db
    .select({
      id: schema.gameParticipants.id,
      game_id: schema.gameParticipants.gameId,
      model_id: schema.gameParticipants.modelId,
      team: schema.gameParticipants.team,
      player_count: schema.gameParticipants.playerCount,
      won: schema.gameParticipants.won,
      consistency_score: schema.gameParticipants.consistencyScore,
      model_name: schema.models.displayName,
    })
    .from(schema.gameParticipants)
    .leftJoin(schema.models, eq(schema.gameParticipants.modelId, schema.models.id))
    .where(eq(schema.gameParticipants.gameId, gameId));

  return c.json({
    ...game,
    participants,
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
  const db = createDb(env.DB);
  const gameId = c.req.param('id');

  // Check game exists
  const game = await db
    .select({
      id: schema.games.id,
      persona_enabled: schema.games.personaEnabled,
    })
    .from(schema.games)
    .where(eq(schema.games.id, gameId))
    .limit(1);

  if (game.length === 0 || !game[0]) {
    throw Errors.NotFound('Game');
  }

  const gameData = game[0];

  if (!gameData.persona_enabled) {
    return c.json({
      gameId,
      personaEnabled: false,
      personas: [],
      analysis: null,
    });
  }

  // Get personas with model names
  const personas = await db
    .select({
      player_id: schema.gamePersonas.playerId,
      model_id: schema.gamePersonas.modelId,
      model_name: schema.models.displayName,
      team: schema.gamePersonas.team,
      persona_name: schema.gamePersonas.personaName,
      persona_background: schema.gamePersonas.personaBackground,
      persona_personality: schema.gamePersonas.personaPersonality,
      persona_occupation: schema.gamePersonas.personaOccupation,
      consistency_score: schema.gamePersonas.consistencyScore,
      name_usage_count: schema.gamePersonas.nameUsageCount,
      personality_alignment_score: schema.gamePersonas.personalityAlignmentScore,
      inconsistencies: schema.gamePersonas.inconsistencies,
    })
    .from(schema.gamePersonas)
    .leftJoin(schema.models, eq(schema.gamePersonas.modelId, schema.models.id))
    .where(eq(schema.gamePersonas.gameId, gameId))
    .orderBy(schema.gamePersonas.createdAt);

  // Get analysis
  const analysis = await db.query.gamePersonaAnalysis.findFirst({
    where: eq(schema.gamePersonaAnalysis.gameId, gameId),
  });

  return c.json({
    gameId,
    personaEnabled: true,
    personas: personas.map(p => ({
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
        inconsistencies: p.inconsistencies ?? [],
      },
    })),
    analysis: analysis ? {
      averageScore: analysis.averageConsistencyScore,
      mafiaAvgConsistency: analysis.mafiaAvgConsistency,
      townAvgConsistency: analysis.townAvgConsistency,
    } : null,
  });
});

export default games;

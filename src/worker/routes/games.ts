/**
 * Game-related API routes.
 */

import { Hono } from 'hono';
import { eq, desc, inArray, sql, and, isNull } from 'drizzle-orm';
import type { Env, GameQueueMessage, ApiProvider } from '../types.js';
import { Errors } from '../utils/errors.js';
import { getRandomTheme } from '../utils/random-config.js';
import { generateTraceId } from '../utils/trace.js';
import { createDb } from '../db/drizzle.js';
import * as schema from '../db/schema.js';
import { getSession } from './auth.js';
import { validateEncryptionSecret } from '../utils/crypto.js';
import { inferProviderFromModelId } from '../ai/factory.js';
import { getGameStateFromKV } from '../utils/workflow-sync.js';
import { getSystemState } from '../batch/service.js';

const games = new Hono<{ Bindings: Env }>();

/**
 * Map of providers to their env key names.
 * Used for validating system API keys.
 */
const PROVIDER_ENV_KEYS: Record<ApiProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  together: 'TOGETHER_API_KEY',
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  hyperbolic: 'HYPERBOLIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  ai21: 'AI21_API_KEY',
};

/**
 * Validate that system API keys are configured for all required providers.
 * Throws Errors.BadRequest if any required keys are missing.
 */
function validateSystemKeys(requiredProviders: Set<string>, env: Env): void {
  const missingKeys: string[] = [];
  
  for (const provider of requiredProviders) {
    const envKey = PROVIDER_ENV_KEYS[provider as ApiProvider];
    if (!envKey) {
      // Unknown provider - skip validation (will fail at runtime with clear error)
      continue;
    }
    
    const keyValue = (env as unknown as Record<string, string | undefined>)[envKey];
    if (!keyValue) {
      missingKeys.push(`${provider} (${envKey})`);
    }
  }
  
  if (missingKeys.length > 0) {
    throw Errors.BadRequest(
      `System API keys not configured for: ${missingKeys.join(', ')}. ` +
      `Please contact the administrator to add the missing keys.`
    );
  }
}

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

  // Validate system API keys are configured for required providers
  // This prevents queuing games that will fail on workflow start
  const modelIds = body.config.teams.map(t => t.modelId);
  const requiredProviders = await getRequiredProviders(modelIds, env);
  validateSystemKeys(requiredProviders, env);

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

  // Check system state - respect pause even for direct runs
  const systemState = await getSystemState(env);
  if (systemState.processingPaused) {
    throw Errors.BadRequest('System is paused. New games cannot be started until processing resumes.');
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
    // Admin user: use system keys - validate they are configured
    const modelIds = body.config.teams.map(t => t.modelId);
    const requiredProviders = await getRequiredProviders(modelIds, env);
    validateSystemKeys(requiredProviders, env);
    console.log(`Admin ${session.email} running game with system API keys for: ${[...requiredProviders].join(', ')}`);
  } else {
    // No session: use system keys (for backwards compatibility with queue/admin routes)
    // Still validate that required keys are configured
    const modelIds = body.config.teams.map(t => t.modelId);
    const requiredProviders = await getRequiredProviders(modelIds, env);
    validateSystemKeys(requiredProviders, env);
    // This path is typically used by the admin UI which handles auth separately
  }

  // Generate trace ID for this direct game
  const traceId = generateTraceId();
  const discountPricing = body.config.discountPricing ?? false;

  const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_direct`;
  const batchId = `batch_${Date.now().toString(36)}_direct`;

  // Pick random theme if not specified
  const personaTheme = body.config.personaTheme ?? getRandomTheme();

  console.log(`[${traceId}] Starting game ${gameId} via workflow (discountPricing: ${discountPricing}, keys: ${keySource})`);

  // Create game record in D1 BEFORE starting the workflow.
  // This prevents a race condition where the frontend redirects to the live page
  // before the workflow has created the record, causing "Game not found" errors.
  const configHash = `${body.config.playerCount}-${body.config.mafiaCount}-${body.config.teams.map(t => `${t.modelId}:${t.count}`).join(',')}`;
  await env.DB.prepare(`
    INSERT INTO games (id, status, batch_id, config_hash, player_count, mafia_count, trace_id, persona_theme, discount_pricing, created_at)
    VALUES (?, 'running', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    gameId,
    batchId,
    configHash,
    body.config.playerCount,
    body.config.mafiaCount,
    traceId,
    personaTheme,
    discountPricing ? 1 : 0,
    Date.now()
  ).run();

  // Write initial state to KV immediately so frontend shows "Booting game engine..."
  // instead of "Waiting for events..." while workflow spins up
  try {
    await env.RATE_LIMIT.put(
      `game-state:${gameId}`,
      JSON.stringify({
        state: { events: [], players: [] },
        status: 'running',
        currentRound: 0,
        progress: {
          current: 0,
          total: 1,
          label: 'Booting game engine...',
          pendingPlayers: [],
        },
        updatedAt: Date.now(),
      }),
      { expirationTtl: 86400 }
    );
  } catch (error) {
    // Non-fatal - log but don't fail game creation
    console.warn(`Failed to write initial KV state for ${gameId}:`, error);
  }

  // Start the workflow
  await env.MAFIA_WORKFLOW.create({
    id: gameId,
    params: {
      gameId,
      config: {
        playerCount: body.config.playerCount,
        mafiaCount: body.config.mafiaCount,
        teams: body.config.teams,
        maxRounds: body.config.maxRounds ?? 10,
        discussionEnabled: body.config.discussionEnabled ?? true,
        personaConstraints: body.config.personaConstraints ?? 'moderate',
        contextLevel: body.config.contextLevel ?? 'full',
        contextWindowSize: body.config.contextWindowSize ?? 3,
        personaTheme,
        discountPricing,
      },
      traceId,
      batchId,
      // Pass encrypted user API keys (persisted in workflow params)
      ...(encryptedUserKeys && { encryptedUserKeys }),
    },
  });

  const estimatedTime = discountPricing 
    ? 'Game uses discount pricing. May take up to 24 hours per AI response.'
    : 'Check /api/games after ~30-60s.';

  return c.json({
    success: true,
    gameId,
    batchId,
    contextLevel: body.config.contextLevel ?? 'full',
    discountPricing,
    keySource,
    message: `Game started via Cloudflare Workflow. ${estimatedTime}`,
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
  // Exclude batch games from live games list (they run async and aren't watchable)
  if (status === 'running') {
    conditions.push(isNull(schema.games.batchId));
  }
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
          config_hash: schema.games.configHash,
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
          config_hash: schema.games.configHash,
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
  // Include gameId in URL so DO can fetch KV state even before workflow broadcasts
  const wsRequest = new Request(`http://internal/websocket?gameId=${encodeURIComponent(gameId)}`, {
    method: 'GET',
    headers: c.req.raw.headers,
  });
  
  return stub.fetch(wsRequest);
});

/**
 * GET /api/games/:id/events - Get current events (polling fallback).
 * Returns current game state and all events so far.
 * 
 * For completed/failed games, serves directly from R2 transcript.
 * For running games, forwards to Durable Object.
 */
games.get('/:id/events', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  // First check D1 for game status - this handles workflow-based games where
  // the DO might not have been updated with final status
  const db = createDb(env.DB);
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
    columns: { status: true, winner: true, rounds: true, durationMs: true, createdAt: true },
  });

  // If game is completed/failed in D1, serve events from R2 transcript
  if (game && (game.status === 'completed' || game.status === 'failed')) {
    try {
      const transcript = await env.TRANSCRIPTS.get(`games/${gameId}/transcript.json`);
      if (transcript) {
        const data = await transcript.json() as { events: Array<unknown> };
        return c.json({
          status: game.status,
          gameId,
          eventCount: data.events?.length ?? 0,
          events: data.events ?? [],
          durationMs: game.durationMs ?? undefined,
        });
      }
    } catch (error) {
      console.warn(`[events] Failed to read transcript for completed game ${gameId}:`, error);
    }
  }

  // For running games, check KV for workflow state first (avoid deserializing)
  if (game && game.status === 'running') {
    // Always check for batch status (games using discount pricing may have no KV state yet)
    const batchStatusKey = `game-state:${gameId}:batch-status`;
    const batchStatusRaw = await env.RATE_LIMIT.get(batchStatusKey);
    const batchStatus = batchStatusRaw ? JSON.parse(batchStatusRaw) : undefined;
    
    const kvState = await getGameStateFromKV(env, gameId);
    if (kvState) {
      // Work directly with serialized state - no need to instantiate GameState class
      const allEvents = kvState.state.events;
      const players = kvState.state.players;
      
      // Separate persona events (always include) from game events (last 50)
      const personaEvents = allEvents.filter(e => 
        e.type === 'persona_generation' || 
        e.type === 'persona_generation_start' || 
        e.type === 'persona_generation_progress'
      );
      const gameEvents = allEvents.filter(e => 
        e.type !== 'persona_generation' && 
        e.type !== 'persona_generation_start' && 
        e.type !== 'persona_generation_progress'
      );
      
      // Combine: all persona events + last 50 game events
      const events = [...personaEvents, ...gameEvents.slice(-50)];
      
      return c.json({
        status: kvState.status,
        gameId,
        eventCount: allEvents.length,
        events,
        players, // Include full player data with personas
        currentPhase: kvState.currentPhase,
        currentRound: kvState.currentRound,
        startedAt: allEvents.length > 0 
          ? allEvents[0]?.timestamp 
          : undefined,
        // NEW: Progress fields for UI
        progress: kvState.progress,
        waitingFor: kvState.waitingFor,
        batchStatus: batchStatus ?? kvState.batchStatus,
      });
    }
    
    // No KV state yet, but game is running - check if waiting for batch API
    if (batchStatus) {
      return c.json({
        status: 'running',
        gameId,
        eventCount: 0,
        events: [],
        batchStatus: {
          isWaitingForBatch: true,
          ...batchStatus,
        },
      });
    }
    
    // No KV batch status yet - check D1 for pending batch requests (early game stage)
    const pendingBatchRequests = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM batch_api_requests 
      WHERE game_id = ? AND status IN ('pending', 'bundled')
    `).bind(gameId).first<{ count: number }>();
    
    if (pendingBatchRequests && pendingBatchRequests.count > 0) {
      // Game is waiting for batch API to process initial requests
      return c.json({
        status: 'running',
        gameId,
        eventCount: 0,
        events: [],
        batchStatus: {
          isWaitingForBatch: true,
          batchPending: true,
          pendingRequests: pendingBatchRequests.count,
          estimatedWaitHours: 5, // Default estimate for batch API
        },
      });
    }
  }

  // Fallback to Durable Object (legacy mode)
  const doId = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(doId);

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
  const db = createDb(env.DB);

  // Check D1 first to avoid waking up DO for finished games
  // This prevents 503 errors for completed games where DO may be evicted
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
    columns: { status: true, winner: true },
  });

  // If game is already finished in DB, return healthy completed status immediately
  if (game && (game.status === 'completed' || game.status === 'failed')) {
    return c.json({
      healthStatus: 'completed',
      healthMessage: `Game finished (${game.status})`,
      status: game.status,
      winner: game.winner ?? undefined,
      gameId,
    }, 200);
  }

  // Only contact Durable Object if game is running or not found in D1 (yet)
  try {
    const doId = env.GAME_RUNNER.idFromName(gameId);
    const stub = env.GAME_RUNNER.get(doId);

    const response = await stub.fetch(new Request('http://internal/health'));
    
    // Handle case where DO might throw or return 500
    if (!response.ok && response.status !== 503) {
      return c.json({ 
        healthStatus: 'warning', 
        healthMessage: 'Game runner unreachable',
        gameId,
      }, 200); // Return 200 to frontend so it doesn't throw network errors
    }

    const data = await response.json();
    // Preserve HTTP status from DO (503 for critical health)
    return c.json(data, response.status as 200 | 503);
  } catch (err) {
    // Fallback if DO fetch fails entirely (e.g., DO evicted)
    // Return warning instead of error to avoid console spam
    return c.json({
      healthStatus: 'warning',
      healthMessage: 'Unable to contact game runner',
      gameId,
    }, 200);
  }
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

/**
 * POST /api/games/test-workflow - Test the new workflow implementation.
 * This is a temporary endpoint for testing Phase 1-3 of the migration.
 */
games.post('/test-workflow', async (c) => {
  interface TestWorkflowRequest {
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
    personaTheme?: 'noir' | 'victorian' | 'modern' | 'fantasy';
    discountPricing?: boolean;
  }

  let body: TestWorkflowRequest;
  try {
    body = await c.req.json<TestWorkflowRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  if (!body.teams || body.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  const traceId = generateTraceId();
  const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const personaTheme = body.personaTheme ?? getRandomTheme();

  console.log(`[${traceId}] Starting test workflow for game ${gameId}`);

  // Start the workflow
  await c.env.MAFIA_WORKFLOW.create({
    id: gameId,
    params: {
      gameId,
      config: {
        playerCount: body.playerCount,
        mafiaCount: body.mafiaCount,
        teams: body.teams,
        maxRounds: body.maxRounds ?? 10,
        discussionEnabled: body.discussionEnabled ?? true,
        personaConstraints: body.personaConstraints ?? 'moderate',
        personaTheme,
        discountPricing: body.discountPricing ?? false,
      },
      traceId,
    },
  });

  return c.json({
    id: gameId,
    traceId,
    status: 'workflow_started',
    message: 'Game started via Cloudflare Workflow. Connect to WebSocket for live updates.',
  });
});

/**
 * GET /api/games/:id/workflow-status - Get workflow execution status.
 */
games.get('/:id/workflow-status', async (c) => {
  const gameId = c.req.param('id');
  
  try {
    const instance = await c.env.MAFIA_WORKFLOW.get(gameId);
    const status = await instance.status();
    
    return c.json({
      gameId,
      workflow: status,
    });
  } catch (error) {
    // Workflow not found
    return c.json({
      gameId,
      workflow: null,
      error: 'Workflow not found',
    }, 404);
  }
});

/**
 * GET /api/games/:id/batch-status - Get batch API request status for a game.
 * Returns pending/bundled/completed batch requests for games using discount pricing.
 */
games.get('/:id/batch-status', async (c) => {
  const env = c.env;
  const gameId = c.req.param('id');

  // Get all batch requests for this game
  const requests = await env.DB.prepare(`
    SELECT 
      request_id,
      status,
      provider,
      model_id,
      batch_job_id,
      created_at,
      updated_at,
      error_message
    FROM batch_api_requests
    WHERE game_id = ?
    ORDER BY created_at ASC
  `).bind(gameId).all<{
    request_id: string;
    status: string;
    provider: string;
    model_id: string;
    batch_job_id: string | null;
    created_at: number;
    updated_at: number | null;
    error_message: string | null;
  }>();

  const results = requests.results ?? [];

  // Calculate summary stats
  const total = results.length;
  const pending = results.filter(r => r.status === 'pending').length;
  const bundled = results.filter(r => r.status === 'bundled').length;
  const completed = results.filter(r => r.status === 'completed').length;
  const failed = results.filter(r => r.status === 'failed').length;

  // Get batch job info if any requests are bundled
  let batchJob = null;
  const bundledRequest = results.find(r => r.batch_job_id);
  if (bundledRequest?.batch_job_id) {
    const job = await env.DB.prepare(`
      SELECT 
        id,
        provider,
        provider_job_id,
        status,
        request_count,
        completed_count,
        failed_count,
        created_at,
        submitted_at,
        expires_at
      FROM batch_api_jobs
      WHERE id = ?
    `).bind(bundledRequest.batch_job_id).first<{
      id: string;
      provider: string;
      provider_job_id: string | null;
      status: string;
      request_count: number;
      completed_count: number;
      failed_count: number;
      created_at: number;
      submitted_at: number | null;
      expires_at: number | null;
    }>();
    batchJob = job;
  }

  // Determine overall batch status for the game
  let batchPending = false;
  let estimatedWaitHours: number | null = null;

  if (total > 0 && completed < total) {
    batchPending = true;
    // Estimate wait time based on typical batch processing times
    // Most providers complete within 1-6 hours, max 24 hours
    if (batchJob?.submitted_at) {
      const elapsedMs = Date.now() - batchJob.submitted_at;
      const elapsedHours = elapsedMs / (1000 * 60 * 60);
      // Assume typical completion time is 2-4 hours
      estimatedWaitHours = Math.max(0, 4 - elapsedHours);
    } else {
      // Not yet submitted - include aggregation + processing time
      estimatedWaitHours = 5; // ~5 min aggregation + 4-5 hour processing
    }
  }

  return c.json({
    gameId,
    batchPending,
    estimatedWaitHours,
    summary: {
      total,
      pending,
      bundled,
      completed,
      failed,
    },
    batchJob,
    requests: results,
  });
});

export default games;

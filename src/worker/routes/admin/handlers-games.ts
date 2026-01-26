/**
 * Game management route handlers for admin API.
 */

import type { Context } from 'hono';
import type { Env } from '../../types.js';
import { eq, desc, sql } from 'drizzle-orm';
import { Errors, generateTraceId, createLogger } from '../../utils/index.js';
import { getRandomTheme } from '../../utils/random-config.js';
import { killHangingGames, getRunningGamesCount } from '../admin-cleanup.js';
import { createDb } from '../../db/drizzle.js';
import * as schema from '../../db/schema.js';
import { getGameStateFromKV, deleteGameStateFromKV } from '../../utils/workflow-sync.js';
import { getRequiredProviders, validateSystemKeys, categorizeError, parseConfigHash } from './services.js';
import type { RunLiveGameRequest } from './validation.js';
import { GAME } from '../../config/constants.js';

const log = createLogger('admin:games');

export async function handleRunLiveGame(c: Context<{ Bindings: Env }>) {
  const env = c.env;

  let body: RunLiveGameRequest;
  try {
    body = await c.req.json<RunLiveGameRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  // Validate configuration
  if (!body.config || !body.config.teams || body.config.teams.length === 0) {
    throw Errors.BadRequest('Invalid game configuration: teams required');
  }

  const { config } = body;

  // Validate player counts
  const totalTeamPlayers = config.teams.reduce((sum, t) => sum + t.count, 0);
  if (totalTeamPlayers !== config.playerCount) {
    throw Errors.BadRequest(`Team player counts (${totalTeamPlayers}) must equal playerCount (${config.playerCount})`);
  }

  const mafiaPlayers = config.teams
    .filter(t => t.team === 'mafia')
    .reduce((sum, t) => sum + t.count, 0);
  if (mafiaPlayers !== config.mafiaCount) {
    throw Errors.BadRequest(`Mafia team counts (${mafiaPlayers}) must equal mafiaCount (${config.mafiaCount})`);
  }

  // Validate system API keys are configured for required providers
  const modelIds = config.teams.map(t => t.modelId);
  const requiredProviders = await getRequiredProviders(modelIds, env);
  validateSystemKeys(requiredProviders, env);

  // Generate IDs and trace ID
  const traceId = generateTraceId();
  const gameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_live`;
  const batchId = `batch_${Date.now().toString(36)}_live`;

  // Pick random theme if not specified
  const personaTheme = config.personaTheme ?? getRandomTheme();

  log.info('Starting live game via admin panel', { traceId, gameId, batchId });

  // Start the workflow
  await env.MAFIA_WORKFLOW.create({
    id: gameId,
    params: {
      gameId,
      config: {
        playerCount: config.playerCount,
        mafiaCount: config.mafiaCount,
        teams: config.teams,
        maxRounds: config.maxRounds ?? GAME.DEFAULT_MAX_ROUNDS,
        discussionEnabled: config.discussionEnabled ?? true,
        personaConstraints: config.personaConstraints ?? 'moderate',
        contextLevel: config.contextLevel ?? 'windowed',
        contextWindowSize: config.contextWindowSize ?? GAME.CONTEXT_WINDOW_SIZE,
        personaTheme,
      },
      traceId,
      batchId,
    },
  });

  return c.json({
    success: true,
    gameId,
    batchId,
    status: 'running',
    liveUrl: `/games/${gameId}/live`,
    message: 'Game started via Cloudflare Workflow. Redirect to live URL to watch progress.',
    traceId,
  });
}

export { getRunningGamesCount };

export async function handleGetFailedGames(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  const url = new URL(c.req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

  // Fetch failed games with participants
  const failedGames = await db
    .select({
      id: schema.games.id,
      batchId: schema.games.batchId,
      rounds: schema.games.rounds,
      errorMessage: schema.games.errorMessage,
      playerCount: schema.games.playerCount,
      mafiaCount: schema.games.mafiaCount,
      createdAt: schema.games.createdAt,
      updatedAt: schema.games.updatedAt,
      lastActivity: schema.games.lastActivity,
      personaTheme: schema.games.personaTheme,
    })
    .from(schema.games)
    .where(eq(schema.games.status, 'failed'))
    .orderBy(desc(schema.games.updatedAt))
    .limit(limit)
    .offset(offset);

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.games)
    .where(eq(schema.games.status, 'failed'));

  const total = countResult[0]?.count ?? 0;

  // Categorize errors for quick filtering
  const categorizedGames = failedGames.map(game => {
    const { category, recoverable } = categorizeError(game.errorMessage);

    return {
      ...game,
      errorCategory: category,
      recoverable,
    };
  });

  return c.json({
    games: categorizedGames,
    total,
    hasMore: offset + limit < total,
    summary: {
      total,
      byCategory: {
        rate_limit: categorizedGames.filter(g => g.errorCategory === 'rate_limit').length,
        timeout: categorizedGames.filter(g => g.errorCategory === 'timeout').length,
        auth: categorizedGames.filter(g => g.errorCategory === 'auth').length,
        model_error: categorizedGames.filter(g => g.errorCategory === 'model_error').length,
        network: categorizedGames.filter(g => g.errorCategory === 'network').length,
        unknown: categorizedGames.filter(g => g.errorCategory === 'unknown').length,
      },
      recoverable: categorizedGames.filter(g => g.recoverable).length,
    },
  });
}

export async function handleResumeGame(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const db = createDb(env.DB);
  const gameId = c.req.param('id');

  // 1. Verify game exists and is failed
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }

  if (game.status !== 'failed') {
    throw Errors.BadRequest(`Game status is "${game.status}", not "failed". Cannot resume.`);
  }

  // 2. Contact the Durable Object to resume
  const doId = env.GAME_RUNNER.idFromName(gameId);
  const stub = env.GAME_RUNNER.get(doId);

  const response = await stub.fetch('http://internal/resume', {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json() as { error?: string; reason?: string };
    const message = error.error || error.reason || 'Durable Object failed to resume game';
    throw Errors.Internal(message);
  }

  const result = await response.json() as {
    success: boolean;
    message: string;
    gameId: string;
    previousStatus?: string;
    previousError?: string;
  };

  return c.json({
    success: true,
    gameId,
    message: result.message,
    previousError: game.errorMessage,
  });
}

export { killHangingGames as handleKillHangingGames };

export async function handleFailGame(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  const gameId = c.req.param('id');
  const { reason } = await c.req.json<{ reason?: string }>();

  // Check if game exists
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }

  const now = new Date();
  const errorMessage = reason || 'Manually marked as failed by admin';

  try {
    await db
      .update(schema.games)
      .set({
        status: 'failed',
        errorMessage,
        updatedAt: now,
      })
      .where(eq(schema.games.id, gameId));

    // Also update daily stats
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesFailed: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesFailed: sql`${schema.dailyStats.gamesFailed} + 1`,
          updatedAt: now,
        },
      });

    return c.json({
      success: true,
      gameId,
      message: `Game ${gameId} marked as failed`,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function handleRepairGame(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const db = createDb(env.DB);
  const gameId = c.req.param('id');
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));

  // 1. Check if game exists and is stuck
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }

  if (game.status !== 'running') {
    throw Errors.BadRequest(`Game status is "${game.status}", not "running". Cannot repair.`);
  }

  // 2. Get game state from KV
  const kvState = await getGameStateFromKV(env, gameId);

  if (!kvState || !kvState.state) {
    throw Errors.BadRequest('No game state found in KV. Cannot repair - try marking as failed instead.');
  }

  const events = kvState.state.events || [];
  const players = kvState.state.players || [];

  if (events.length === 0) {
    throw Errors.BadRequest('No events found in KV state. Cannot repair - try marking as failed instead.');
  }

  // 3. Calculate stats from events
  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];
  const startedAt = firstEvent?.timestamp || game.createdAt.getTime();
  const endedAt = lastEvent?.timestamp || Date.now();
  const durationMs = endedAt - startedAt;

  // Find highest round number and count tokens
  let maxRound = 0;
  let totalTokens = 0;
  let winner: 'town' | 'mafia' | null = null;

  for (const event of events) {
    // Check for round (present on most events)
    const eventRound = (event as { round?: number }).round;
    if (eventRound && eventRound > maxRound) {
      maxRound = eventRound;
    }

    // Count tokens from ai_call events
    if (event.type === 'ai_call') {
      const aiEvent = event as { response?: { usage?: { total_tokens?: number } } };
      if (aiEvent.response?.usage?.total_tokens) {
        totalTokens += aiEvent.response.usage.total_tokens;
      }
    }

    // Check for game_end event to determine winner
    if (event.type === 'game_end') {
      const gameEndEvent = event as { winner?: 'town' | 'mafia' };
      winner = gameEndEvent.winner || null;
    }
  }
  const finalStatus = winner ? 'completed' : 'failed';

  // 4. Save transcript to R2
  const transcript = {
    gameId,
    events,
    players,
    result: {
      winner,
      rounds: maxRound,
      durationMs,
    },
    repaired: true,
    repairedAt: Date.now(),
    originalError: reason || 'Workflow crashed - repaired via admin',
  };

  await env.TRANSCRIPTS.put(
    `games/${gameId}/transcript.json`,
    JSON.stringify(transcript, null, 2),
    {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: {
        gameId,
        repaired: 'true',
        rounds: String(maxRound),
        ...(winner && { winner }),
      },
    }
  );

  // 5. Update D1 with stats
  const now = new Date();
  const errorMessage = winner
    ? null
    : (reason || 'Workflow crashed - repaired via admin');

  await db
    .update(schema.games)
    .set({
      status: finalStatus,
      winner,
      rounds: maxRound,
      totalTokens,
      durationMs,
      errorMessage,
      updatedAt: now,
    })
    .where(eq(schema.games.id, gameId));

  // 6. Update daily stats
  const today = new Date().toISOString().slice(0, 10);
  if (winner) {
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesCompleted: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesCompleted: sql`${schema.dailyStats.gamesCompleted} + 1`,
          updatedAt: now,
        },
      });
  } else {
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesFailed: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesFailed: sql`${schema.dailyStats.gamesFailed} + 1`,
          updatedAt: now,
        },
      });
  }

  // 7. Clean up KV state
  await deleteGameStateFromKV(env, gameId);

  return c.json({
    success: true,
    gameId,
    status: finalStatus,
    message: `Game ${gameId} repaired successfully`,
    stats: {
      events: events.length,
      rounds: maxRound,
      totalTokens,
      durationMs,
      winner,
    },
  });
}

export async function handleCompleteGame(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);
  const gameId = c.req.param('id');
  const { winner, rounds } = await c.req.json<{ winner: 'town' | 'mafia'; rounds: number }>();

  if (!winner || !['town', 'mafia'].includes(winner)) {
    throw Errors.BadRequest('Invalid winner. Must be "town" or "mafia"');
  }
  if (!rounds || rounds < 1) {
    throw Errors.BadRequest('Invalid rounds. Must be >= 1');
  }

  // Check if game exists
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, gameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }

  const now = new Date();

  try {
    await db
      .update(schema.games)
      .set({
        status: 'completed',
        winner,
        rounds,
        updatedAt: now,
      })
      .where(eq(schema.games.id, gameId));

    // Also update daily stats
    const today = new Date().toISOString().slice(0, 10);
    await db
      .insert(schema.dailyStats)
      .values({
        date: today,
        gamesCompleted: 1,
      })
      .onConflictDoUpdate({
        target: schema.dailyStats.date,
        set: {
          gamesCompleted: sql`${schema.dailyStats.gamesCompleted} + 1`,
          updatedAt: now,
        },
      });

    return c.json({
      success: true,
      gameId,
      winner,
      rounds,
      message: `Game ${gameId} marked as completed (${winner} won in ${rounds} rounds)`,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function handleRestartGame(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const db = createDb(env.DB);
  const oldGameId = c.req.param('id');

  // 1. Get the original game config
  const game = await db.query.games.findFirst({
    where: eq(schema.games.id, oldGameId),
  });

  if (!game) {
    throw Errors.NotFound('Game');
  }

  if (game.status !== 'failed') {
    throw Errors.BadRequest(`Game status is "${game.status}". Only failed games can be restarted.`);
  }

  // 2. Parse config from config_hash
  const { teams } = parseConfigHash(game.configHash);

  // 3. Generate new game ID and trace ID
  const traceId = generateTraceId();
  const newGameId = `game_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_restart`;
  const personaTheme = game.personaTheme ?? getRandomTheme();

  // 4. Start new workflow
  await env.MAFIA_WORKFLOW.create({
    id: newGameId,
    params: {
      gameId: newGameId,
      config: {
        playerCount: game.playerCount,
        mafiaCount: game.mafiaCount,
        teams,
        maxRounds: GAME.DEFAULT_MAX_ROUNDS,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        personaTheme,
        discountPricing: game.discountPricing ?? false,
      },
      traceId,
      batchId: game.batchId ?? undefined,
    },
  });

  return c.json({
    success: true,
    originalGameId: oldGameId,
    newGameId,
    traceId,
    message: `Game restarted as ${newGameId}`,
    liveUrl: `https://mafia-arena.com/games/${newGameId}/live`,
  });
}

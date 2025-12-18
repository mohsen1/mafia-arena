/**
 * Mafia Arena - Cloudflare Worker Entry Point
 *
 * Handles HTTP requests and queue messages for the Mafia Arena platform.
 */

import type { Env, GameQueueMessage } from './types.js';
import {
  APIError,
  Errors,
  checkRateLimit,
  getRateLimitKey,
  getRateLimitConfig,
  checkBudget,
  logError,
} from './utils/index.js';

// Re-export the Durable Object
export { GameRunner } from './GameRunner.js';

// CORS headers for API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  /**
   * Handle HTTP requests.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Check rate limit for API requests
      if (url.pathname.startsWith('/api/')) {
        const rateLimitResult = await this.checkRateLimitIfEnabled(request, url, env);
        if (rateLimitResult) {
          return rateLimitResult;
        }
      }

      // Route requests
      const response = await this.handleRequest(request, url, env, ctx);

      // Add CORS headers to response
      return this.addCorsHeaders(response);
    } catch (error) {
      console.error('Request error:', error);

      // Log error to D1
      if (error instanceof Error) {
        ctx.waitUntil(
          logError(env.DB, error, {
            url: url.pathname,
            method: request.method,
          })
        );
      }

      // Return structured error response
      if (error instanceof APIError) {
        return this.addCorsHeaders(error.toResponse());
      }

      return this.addCorsHeaders(
        Errors.Internal(error instanceof Error ? error.message : 'Unknown error').toResponse()
      );
    }
  },

  /**
   * Add CORS headers to a response.
   */
  addCorsHeaders(response: Response): Response {
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  /**
   * Check rate limit if KV is available.
   */
  async checkRateLimitIfEnabled(
    request: Request,
    url: URL,
    env: Env
  ): Promise<Response | null> {
    // Skip rate limiting if KV not configured
    if (!env.RATE_LIMIT) {
      return null;
    }

    const key = getRateLimitKey(request, url);
    const config = getRateLimitConfig(request.method, url.pathname);
    const result = await checkRateLimit(env.RATE_LIMIT, key, config);

    if (!result.allowed) {
      const response = Errors.RateLimited(Math.ceil((result.resetAt - Date.now()) / 1000)).toResponse();
      const headers = new Headers(response.headers);
      headers.set('X-RateLimit-Limit', String(config.maxRequests));
      headers.set('X-RateLimit-Remaining', '0');
      headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
      headers.set('Retry-After', String(Math.ceil((result.resetAt - Date.now()) / 1000)));

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    }

    return null;
  },

  /**
   * Route requests to appropriate handlers.
   */
  async handleRequest(
    request: Request,
    url: URL,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const path = url.pathname;

    // Health check
    if (path === '/' || path === '/health') {
      return Response.json({ status: 'ok', service: 'mafia-arena' });
    }

    // API Routes
    if (path.startsWith('/api/')) {
      return this.handleAPI(request, url, env, ctx);
    }

    throw Errors.NotFound('Route');
  },

  /**
   * Handle API requests.
   */
  async handleAPI(
    request: Request,
    url: URL,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const path = url.pathname;
    const method = request.method;

    // POST /api/games/run - Start a batch of games
    if (path === '/api/games/run' && method === 'POST') {
      return this.handleRunGames(request, env);
    }

    // GET /api/games - List games
    if (path === '/api/games' && method === 'GET') {
      return this.handleListGames(url, env);
    }

    // GET /api/games/:id - Get game details
    const gameMatch = path.match(/^\/api\/games\/([a-zA-Z0-9_-]+)$/);
    if (gameMatch && method === 'GET') {
      return this.handleGetGame(gameMatch[1]!, env);
    }

    // GET /api/games/:id/transcript - Get full game transcript
    const transcriptMatch = path.match(/^\/api\/games\/([a-zA-Z0-9_-]+)\/transcript$/);
    if (transcriptMatch && method === 'GET') {
      return this.handleGetTranscript(transcriptMatch[1]!, env);
    }

    // GET /api/leaderboard - Get leaderboard
    if (path === '/api/leaderboard' && method === 'GET') {
      return this.handleGetLeaderboard(url, env);
    }

    // GET /api/models - List models
    if (path === '/api/models' && method === 'GET') {
      return this.handleGetModels(env);
    }

    // GET /api/budget - Get budget status
    if (path === '/api/budget' && method === 'GET') {
      return this.handleGetBudget(env);
    }

    throw Errors.NotFound('Endpoint');
  },

  /**
   * POST /api/games/run - Queue a batch of games.
   */
  async handleRunGames(request: Request, env: Env): Promise<Response> {
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
      };
    }

    let body: RunGamesRequest;
    try {
      body = (await request.json()) as RunGamesRequest;
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
          },
          createdAt: Date.now(),
        },
      });
    }

    // Send to queue
    await env.GAME_QUEUE.sendBatch(messages);

    return Response.json({
      success: true,
      batchId,
      queued: body.count,
      gameIds,
      budget: {
        spent: budget.spent.toFixed(4),
        remaining: budget.remaining.toFixed(4),
        limit: budget.limit,
      },
    });
  },

  /**
   * GET /api/games - List completed games.
   */
  async handleListGames(url: URL, env: Env): Promise<Response> {
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

    return Response.json({
      games: gamesResult.results,
      total: countResult?.count ?? 0,
      hasMore: offset + limit < (countResult?.count ?? 0),
      limit,
      offset,
    });
  },

  /**
   * GET /api/games/:id - Get game details.
   */
  async handleGetGame(gameId: string, env: Env): Promise<Response> {
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

    return Response.json({
      ...game,
      participants: participants.results,
      transcriptUrl: `/api/games/${gameId}/transcript`,
    });
  },

  /**
   * GET /api/games/:id/transcript - Get full game transcript from R2.
   */
  async handleGetTranscript(gameId: string, env: Env): Promise<Response> {
    const object = await env.TRANSCRIPTS.get(`games/${gameId}/transcript.json`);

    if (!object) {
      throw Errors.NotFound('Transcript');
    }

    const transcript = await object.json();
    return Response.json(transcript);
  },

  /**
   * GET /api/leaderboard - Get model rankings.
   */
  async handleGetLeaderboard(url: URL, env: Env): Promise<Response> {
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

    return Response.json({ rankings: result.results });
  },

  /**
   * GET /api/models - List available models.
   */
  async handleGetModels(env: Env): Promise<Response> {
    const result = await env.DB.prepare('SELECT * FROM models ORDER BY display_name').all();

    return Response.json({ models: result.results });
  },

  /**
   * GET /api/budget - Get current budget status.
   */
  async handleGetBudget(env: Env): Promise<Response> {
    const budget = await checkBudget(env.DB);

    return Response.json({
      allowed: budget.allowed,
      spent: budget.spent.toFixed(4),
      remaining: budget.remaining.toFixed(4),
      limit: budget.limit,
      currency: 'USD',
    });
  },

  /**
   * Handle queue messages.
   */
  async queue(batch: MessageBatch<GameQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { gameId, batchId, config } = message.body;

      try {
        console.log(`Processing game ${gameId} from batch ${batchId}`);

        // Get Durable Object instance by game ID
        const id = env.GAME_RUNNER.idFromName(gameId);
        const stub = env.GAME_RUNNER.get(id);

        // Start the game
        const response = await stub.fetch('http://internal/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId, batchId, config }),
        });

        if (!response.ok) {
          const error = (await response.json()) as { error: string };
          throw new Error(error.error ?? 'Failed to start game');
        }

        // Acknowledge message
        message.ack();
        console.log(`Game ${gameId} started successfully`);
      } catch (error) {
        console.error(`Failed to process game ${gameId}:`, error);

        // Log to D1
        if (error instanceof Error) {
          await logError(env.DB, error, { gameId, batchId }).catch(() => {});
        }

        // Retry the message
        message.retry();
      }
    }
  },
};

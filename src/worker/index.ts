/**
 * Mafia Arena - Cloudflare Worker Entry Point
 *
 * Handles HTTP requests and queue messages for the Mafia Arena platform.
 */

import type { Env, GameQueueMessage, BatchQueueMessage, BatchConfig } from './types.js';
import {
  APIError,
  Errors,
  checkRateLimit,
  getRateLimitKey,
  getRateLimitConfig,
  checkBudget,
  logError,
} from './utils/index.js';
import {
  createBatch,
  getBatch,
  listBatches,
  cancelBatch,
  processBatchMessage,
  estimateCost,
  getSystemState,
  pauseProcessing,
  resumeProcessing,
  getAdminStats,
  incrementBatchProgress,
  updateDailyStats,
  MAX_BATCH_SIZE,
} from './batch/index.js';

// Re-export the Durable Object
export { GameRunner } from './GameRunner.js';

// CORS headers for API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Verify Basic Auth credentials for admin routes.
 */
function verifyAdminAuth(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');

    return username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

/**
 * Return 401 response requesting Basic Auth.
 */
function requireAuth(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mafia Arena Admin"',
      ...corsHeaders,
    },
  });
}

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

    // POST /api/games/run-direct - Run a game directly (bypasses queue for testing)
    if (path === '/api/games/run-direct' && method === 'POST') {
      return this.handleRunGameDirect(request, env);
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

    // Persona Analysis Endpoints
    // GET /api/analysis/persona-correlations - Which persona types correlate with winning
    if (path === '/api/analysis/persona-correlations' && method === 'GET') {
      return this.handlePersonaCorrelations(url, env);
    }

    // GET /api/analysis/team-patterns - How persona choices differ between teams
    if (path === '/api/analysis/team-patterns' && method === 'GET') {
      return this.handleTeamPatterns(env);
    }

    // GET /api/analysis/model-patterns/:modelId - Persona fingerprint for a specific model
    const modelPatternsMatch = path.match(/^\/api\/analysis\/model-patterns\/([a-zA-Z0-9_-]+)$/);
    if (modelPatternsMatch && method === 'GET') {
      return this.handleModelPatterns(modelPatternsMatch[1]!, env);
    }

    // GET /api/analysis/win-rate-by-personality - Win rates by personality type
    if (path === '/api/analysis/win-rate-by-personality' && method === 'GET') {
      return this.handleWinRateByPersonality(url, env);
    }

    // GET /api/games/:id/personas - Get personas for a specific game
    const personasMatch = path.match(/^\/api\/games\/([a-zA-Z0-9_-]+)\/personas$/);
    if (personasMatch && method === 'GET') {
      return this.handleGetGamePersonas(personasMatch[1]!, env);
    }

    // Stats Endpoints
    // GET /api/stats/overview - Aggregate stats overview
    if (path === '/api/stats/overview' && method === 'GET') {
      return this.handleStatsOverview(env);
    }

    // GET /api/stats/matchups - Head-to-head model matchups
    if (path === '/api/stats/matchups' && method === 'GET') {
      return this.handleStatsMatchups(url, env);
    }

    // GET /api/stats/costs - Cost efficiency stats
    if (path === '/api/stats/costs' && method === 'GET') {
      return this.handleStatsCosts(env);
    }

    // GET /api/stats/trends - Activity trends over time
    if (path === '/api/stats/trends' && method === 'GET') {
      return this.handleStatsTrends(url, env);
    }

    // ==========================================================================
    // ADMIN API ENDPOINTS (protected by Basic Auth)
    // ==========================================================================

    if (path.startsWith('/api/admin/')) {
      // Verify admin credentials
      if (!verifyAdminAuth(request, env)) {
        return requireAuth();
      }
    }

    // POST /api/admin/batches - Create a new batch (up to 10,000 games)
    if (path === '/api/admin/batches' && method === 'POST') {
      return this.handleCreateBatch(request, env);
    }

    // GET /api/admin/batches - List all batches
    if (path === '/api/admin/batches' && method === 'GET') {
      return this.handleListBatches(url, env);
    }

    // GET /api/admin/batches/:id - Get batch details
    const batchMatch = path.match(/^\/api\/admin\/batches\/([a-zA-Z0-9_-]+)$/);
    if (batchMatch && method === 'GET') {
      return this.handleGetBatch(batchMatch[1]!, env);
    }

    // POST /api/admin/batches/:id/cancel - Cancel a batch
    const cancelMatch = path.match(/^\/api\/admin\/batches\/([a-zA-Z0-9_-]+)\/cancel$/);
    if (cancelMatch && method === 'POST') {
      return this.handleCancelBatch(cancelMatch[1]!, env);
    }

    // POST /api/admin/system/pause - Pause all processing
    if (path === '/api/admin/system/pause' && method === 'POST') {
      return this.handlePauseSystem(env);
    }

    // POST /api/admin/system/resume - Resume processing
    if (path === '/api/admin/system/resume' && method === 'POST') {
      return this.handleResumeSystem(env);
    }

    // GET /api/admin/stats/live - Real-time metrics
    if (path === '/api/admin/stats/live' && method === 'GET') {
      return this.handleAdminStatsLive(env);
    }

    // POST /api/admin/estimate - Cost estimate for config
    if (path === '/api/admin/estimate' && method === 'POST') {
      return this.handleCostEstimate(request);
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
        personaConstraints?: 'strict' | 'moderate' | 'free';
        contextLevel?: 'full' | 'windowed' | 'summary';
        contextWindowSize?: number;
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

    return Response.json({
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
  },

  /**
   * POST /api/games/run-direct - Run a game directly without queue.
   * Bypasses the queue for immediate execution and testing.
   */
  async handleRunGameDirect(request: Request, env: Env): Promise<Response> {
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
      body = (await request.json()) as RunGameDirectRequest;
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

    return Response.json({
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

    // Get participants for each game to show model matchups
    const gameIds = gamesResult.results.map((g: any) => g.id);
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

      for (const p of participantsResult.results as any[]) {
        if (!participantsMap[p.game_id]) {
          participantsMap[p.game_id] = [];
        }
        participantsMap[p.game_id]!.push({
          model_id: p.model_id,
          model_name: p.model_name || p.model_id,
          team: p.team,
        });
      }
    }

    // Attach participants to games
    const gamesWithParticipants = gamesResult.results.map((game: any) => ({
      ...game,
      participants: participantsMap[game.id] || [],
    }));

    return Response.json({
      games: gamesWithParticipants,
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
   * GET /api/analysis/persona-correlations - Which persona types correlate with winning.
   */
  async handlePersonaCorrelations(url: URL, env: Env): Promise<Response> {
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

    return Response.json({
      correlations: result.results,
      filters: { modelId, team, minUsage },
    });
  },

  /**
   * GET /api/analysis/team-patterns - How persona choices differ between teams.
   */
  async handleTeamPatterns(env: Env): Promise<Response> {
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

    return Response.json({
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
  },

  /**
   * GET /api/analysis/model-patterns/:modelId - Persona fingerprint for a specific model.
   */
  async handleModelPatterns(modelId: string, env: Env): Promise<Response> {
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
    const allPatterns = [...mafiaPatterns.results, ...townPatterns.results] as any[];
    const totalGames = allPatterns.reduce((sum, p) => sum + p.usage_count, 0);
    const totalWins = allPatterns.reduce((sum, p) => sum + p.win_count, 0);
    const consistencyScores = allPatterns
      .filter(p => p.avg_consistency_score !== null)
      .map(p => p.avg_consistency_score);
    const avgConsistency = consistencyScores.length > 0
      ? consistencyScores.reduce((a: number, b: number) => a + b, 0) / consistencyScores.length
      : null;

    return Response.json({
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
  },

  /**
   * GET /api/analysis/win-rate-by-personality - Win rates by personality type.
   */
  async handleWinRateByPersonality(url: URL, env: Env): Promise<Response> {
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

    return Response.json({
      results: result.results.map((r: any) => ({
        personality: r.personality,
        games: r.games,
        wins: r.wins,
        winRate: parseFloat(r.win_rate.toFixed(3)),
      })),
      team: team ?? 'all',
    });
  },

  /**
   * GET /api/games/:id/personas - Get personas for a specific game.
   */
  async handleGetGamePersonas(gameId: string, env: Env): Promise<Response> {
    // Check game exists
    const game = await env.DB.prepare('SELECT id, persona_enabled FROM games WHERE id = ?')
      .bind(gameId)
      .first<{ id: string; persona_enabled: number }>();

    if (!game) {
      throw Errors.NotFound('Game');
    }

    if (!game.persona_enabled) {
      return Response.json({
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

    return Response.json({
      gameId,
      personaEnabled: true,
      personas: personas.results.map((p: any) => ({
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
          inconsistencies: p.inconsistencies ? JSON.parse(p.inconsistencies) : [],
        },
      })),
      analysis: analysis ? {
        averageScore: analysis.average_consistency_score,
        mafiaAvgConsistency: analysis.mafia_avg_consistency,
        townAvgConsistency: analysis.town_avg_consistency,
      } : null,
    });
  },

  /**
   * GET /api/stats/overview - Aggregate stats overview.
   */
  async handleStatsOverview(env: Env): Promise<Response> {
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

    // Top models by win rate (min 3 games)
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
      GROUP BY l.model_id
      HAVING SUM(l.games_played) >= 3
      ORDER BY win_rate DESC
      LIMIT 5
    `).all();

    return Response.json({
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
  },

  /**
   * GET /api/stats/matchups - Head-to-head model matchups.
   */
  async handleStatsMatchups(url: URL, env: Env): Promise<Response> {
    const team = url.searchParams.get('team') as 'mafia' | 'town' | null;

    // Get all head-to-head matchups (excluding self-play)
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
      ${team ? 'WHERE gp1.team = ?' : ''}
      GROUP BY gp1.model_id, gp2.model_id
      HAVING games >= 1
    `;

    const result = team
      ? await env.DB.prepare(query).bind(team).all()
      : await env.DB.prepare(query).all();

    // Get self-play statistics (same model on both teams)
    // Use DISTINCT to avoid double-counting when model has multiple players per team
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

    // Get unique models for matrix
    const models = await env.DB.prepare(`
      SELECT DISTINCT m.id, m.display_name, m.provider
      FROM models m
      JOIN game_participants gp ON m.id = gp.model_id
      ORDER BY m.display_name
    `).all();

    return Response.json({
      matchups: result.results,
      selfPlay: selfPlayResult.results,
      models: models.results,
      filter: { team },
    });
  },

  /**
   * GET /api/stats/costs - Cost efficiency stats.
   */
  async handleStatsCosts(env: Env): Promise<Response> {
    // Token usage and games by model
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
      GROUP BY l.model_id
      ORDER BY tokens DESC
    `).all();

    // Aggregate by provider
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
      GROUP BY m.provider
      ORDER BY tokens DESC
    `).all();

    return Response.json({
      byModel: modelCosts.results,
      byProvider: providerCosts.results,
    });
  },

  /**
   * GET /api/stats/trends - Activity trends over time.
   */
  async handleStatsTrends(url: URL, env: Env): Promise<Response> {
    const days = parseInt(url.searchParams.get('days') ?? '30', 10);
    const cutoff = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    // Games per day
    const dailyGames = await env.DB.prepare(`
      SELECT 
        DATE(created_at, 'unixepoch') as date,
        COUNT(*) as games,
        SUM(CASE WHEN winner = 'mafia' THEN 1 ELSE 0 END) as mafia_wins,
        SUM(CASE WHEN winner = 'town' THEN 1 ELSE 0 END) as town_wins,
        SUM(total_tokens) as tokens
      FROM games
      WHERE status = 'completed' AND created_at >= ?
      GROUP BY DATE(created_at, 'unixepoch')
      ORDER BY date ASC
    `).bind(cutoff).all();

    // Recent games activity
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

    return Response.json({
      daily: dailyGames.results,
      recent: recentActivity.results,
      period: { days, cutoff },
    });
  },

  // ===========================================================================
  // ADMIN API HANDLERS
  // ===========================================================================

  /**
   * POST /api/admin/batches - Create a new batch job.
   */
  async handleCreateBatch(request: Request, env: Env): Promise<Response> {
    interface CreateBatchRequest {
      name?: string;
      totalGames: number;
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
      useBatchAPI?: boolean;
    }

    let body: CreateBatchRequest;
    try {
      body = (await request.json()) as CreateBatchRequest;
    } catch {
      throw Errors.BadRequest('Invalid JSON body');
    }

    // Validate
    if (!body.totalGames || body.totalGames < 1 || body.totalGames > MAX_BATCH_SIZE) {
      throw Errors.BadRequest(`Total games must be between 1 and ${MAX_BATCH_SIZE}`);
    }

    if (!body.config || !body.config.teams || body.config.teams.length === 0) {
      throw Errors.BadRequest('Invalid game configuration: teams required');
    }

    const batchConfig: BatchConfig = {
      ...(body.name && { name: body.name }),
      totalGames: body.totalGames,
      gameConfig: {
        playerCount: body.config.playerCount,
        mafiaCount: body.config.mafiaCount,
        teams: body.config.teams,
        maxRounds: body.config.maxRounds ?? 10,
        discussionEnabled: body.config.discussionEnabled ?? true,
        personaConstraints: body.config.personaConstraints ?? 'moderate',
        contextLevel: body.config.contextLevel ?? 'summary',
        contextWindowSize: body.config.contextWindowSize ?? 3,
      },
      useBatchAPI: body.useBatchAPI ?? false,
    };

    const result = await createBatch(env, batchConfig);

    return Response.json({
      success: true,
      batchId: result.batchId,
      estimatedCostUsd: result.estimatedCost,
      totalGames: body.totalGames,
    });
  },

  /**
   * GET /api/admin/batches - List all batches.
   */
  async handleListBatches(url: URL, env: Env): Promise<Response> {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const statusParam = url.searchParams.get('status');

    // Build options object conditionally to avoid undefined values
    const options: { status?: 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused'; limit: number; offset: number } = { limit, offset };
    if (statusParam && ['queued', 'processing', 'completed', 'cancelled', 'paused'].includes(statusParam)) {
      options.status = statusParam as 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused';
    }

    const result = await listBatches(env, options);

    return Response.json({
      batches: result.batches.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        totalGames: b.total_games,
        completedGames: b.completed_games,
        failedGames: b.failed_games,
        estimatedCostUsd: b.estimated_cost_usd,
        actualCostUsd: b.actual_cost_usd,
        createdBy: b.created_by,
        createdAt: b.created_at,
        startedAt: b.started_at,
        completedAt: b.completed_at,
        progress: b.total_games > 0
          ? ((b.completed_games + b.failed_games) / b.total_games * 100).toFixed(1)
          : '0',
      })),
      total: result.total,
      hasMore: offset + limit < result.total,
    });
  },

  /**
   * GET /api/admin/batches/:id - Get batch details.
   */
  async handleGetBatch(batchId: string, env: Env): Promise<Response> {
    const batch = await getBatch(env, batchId);

    if (!batch) {
      throw Errors.NotFound('Batch');
    }

    // Get recent games from this batch (include error_message for debugging)
    const gamesResult = await env.DB.prepare(`
      SELECT id, status, winner, rounds, duration_ms, created_at, error_message
      FROM games
      WHERE batch_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(batchId).all();

    // Get recent error logs that might be related to this batch
    const errorLogsResult = await env.DB.prepare(`
      SELECT id, level, message, stack, context, created_at
      FROM error_log
      WHERE context LIKE ? OR context LIKE ?
      ORDER BY created_at DESC
      LIMIT 20
    `).bind(`%${batchId}%`, `%batch_id%${batchId}%`).all();

    return Response.json({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      totalGames: batch.total_games,
      completedGames: batch.completed_games,
      failedGames: batch.failed_games,
      estimatedCostUsd: batch.estimated_cost_usd,
      actualCostUsd: batch.actual_cost_usd,
      createdBy: batch.created_by,
      createdAt: batch.created_at,
      startedAt: batch.started_at,
      completedAt: batch.completed_at,
      errorMessage: batch.error_message,
      config: JSON.parse(batch.config_json),
      progress: batch.total_games > 0
        ? ((batch.completed_games + batch.failed_games) / batch.total_games * 100).toFixed(1)
        : '0',
      recentGames: gamesResult.results,
      errorLogs: errorLogsResult.results,
    });
  },

  /**
   * POST /api/admin/batches/:id/cancel - Cancel a batch.
   */
  async handleCancelBatch(batchId: string, env: Env): Promise<Response> {
    const batch = await getBatch(env, batchId);

    if (!batch) {
      throw Errors.NotFound('Batch');
    }

    if (batch.status === 'completed' || batch.status === 'cancelled') {
      throw Errors.BadRequest(`Batch is already ${batch.status}`);
    }

    await cancelBatch(env, batchId);

    return Response.json({
      success: true,
      message: `Batch ${batchId} cancelled`,
    });
  },

  /**
   * POST /api/admin/system/pause - Pause all processing.
   */
  async handlePauseSystem(env: Env): Promise<Response> {
    await pauseProcessing(env);

    return Response.json({
      success: true,
      message: 'System processing paused',
    });
  },

  /**
   * POST /api/admin/system/resume - Resume processing.
   */
  async handleResumeSystem(env: Env): Promise<Response> {
    await resumeProcessing(env);

    return Response.json({
      success: true,
      message: 'System processing resumed',
    });
  },

  /**
   * GET /api/admin/stats/live - Get real-time admin stats.
   */
  async handleAdminStatsLive(env: Env): Promise<Response> {
    const stats = await getAdminStats(env);

    return Response.json(stats);
  },

  /**
   * POST /api/admin/estimate - Get cost estimate for a batch.
   */
  async handleCostEstimate(request: Request): Promise<Response> {
    interface EstimateRequest {
      totalGames: number;
      config: {
        playerCount: number;
        mafiaCount: number;
        teams: Array<{
          modelId: string;
          team: 'mafia' | 'town';
          count: number;
        }>;
        discussionEnabled?: boolean;
        contextLevel?: 'full' | 'windowed' | 'summary';
      };
      useBatchAPI?: boolean;
    }

    let body: EstimateRequest;
    try {
      body = (await request.json()) as EstimateRequest;
    } catch {
      throw Errors.BadRequest('Invalid JSON body');
    }

    const estimate = estimateCost({
      totalGames: body.totalGames,
      gameConfig: {
        playerCount: body.config.playerCount,
        mafiaCount: body.config.mafiaCount,
        teams: body.config.teams,
        maxRounds: 10,
        discussionEnabled: body.config.discussionEnabled ?? true,
        personaConstraints: 'moderate',
        contextLevel: body.config.contextLevel ?? 'summary',
        contextWindowSize: 3,
      },
      useBatchAPI: body.useBatchAPI ?? false,
    });

    return Response.json(estimate);
  },

  /**
   * Handle queue messages.
   * This single handler processes both batch queue and game queue messages.
   * Cloudflare routes messages to this handler based on the queue configuration.
   */
  async queue(
    batch: MessageBatch<GameQueueMessage | BatchQueueMessage>,
    env: Env
  ): Promise<void> {
    for (const message of batch.messages) {
      const body = message.body;

      // Check if this is a game message (has gameId) or batch message (has config.totalGames)
      if ('gameId' in body && body.gameId) {
        // Game queue message
        await this.handleGameMessage(message as Message<GameQueueMessage>, env);
      } else if ('config' in body && body.config && 'totalGames' in body.config) {
        // Batch queue message
        await this.handleBatchMessage(message as Message<BatchQueueMessage>, env);
      } else {
        console.error('Unknown message type:', body);
        message.ack(); // Acknowledge to prevent infinite retries
      }
    }
  },

  /**
   * Handle a single game queue message.
   */
  async handleGameMessage(message: Message<GameQueueMessage>, env: Env): Promise<void> {
    const { gameId, batchId, config } = message.body;
    const MAX_RETRIES = 3;

    try {
      console.log(`Processing game ${gameId} from batch ${batchId} (attempt ${message.attempts})`);

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

      message.ack();
      console.log(`Game ${gameId} started successfully`);
    } catch (error) {
      console.error(`Failed to process game ${gameId} (attempt ${message.attempts}):`, error);

      if (error instanceof Error) {
        await logError(env.DB, error, { gameId, batchId }).catch(() => {});
      }

      // Check if we've exhausted retries
      if (message.attempts >= MAX_RETRIES) {
        console.error(`Game ${gameId} failed after ${MAX_RETRIES} attempts, marking as failed`);
        
        // Update batch failed counter
        if (batchId) {
          await incrementBatchProgress(env, batchId, 0, 1, 0).catch((e) => {
            console.error('Failed to update batch progress:', e);
          });
          await updateDailyStats(env, { gamesFailed: 1 }).catch(() => {});
        }
        
        message.ack(); // Acknowledge to prevent DLQ
      } else {
        message.retry();
      }
    }
  },

  /**
   * Handle a single batch queue message - splits into individual games.
   */
  async handleBatchMessage(message: Message<BatchQueueMessage>, env: Env): Promise<void> {
    const { batchId, config } = message.body;

    try {
      console.log(`Processing batch ${batchId} with ${config.totalGames} games`);

      // Check system state
      const systemState = await getSystemState(env);
      if (systemState.processingPaused) {
        console.log(`System paused, retrying batch ${batchId} in 60s`);
        message.retry({ delaySeconds: 60 });
        return;
      }

      // Process the batch
      await processBatchMessage(env, batchId, config);

      message.ack();
      console.log(`Batch ${batchId} processed, ${config.totalGames} games queued`);
    } catch (error) {
      console.error(`Failed to process batch ${batchId}:`, error);

      if (error instanceof Error) {
        await logError(env.DB, error, { batchId }).catch(() => {});
      }

      message.retry();
    }
  },
};

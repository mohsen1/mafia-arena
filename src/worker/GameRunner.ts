/**
 * GameRunner Durable Object
 * Runs a single Mafia game, handling AI calls with retry logic
 * and persisting results to D1 and R2.
 * 
 * BENCHMARK INTEGRITY:
 * - Uses ctx.storage to persist state across DO evictions
 * - Idempotent result persistence to prevent double-counting
 * - Records seed for game reproducibility
 * 
 * LIVE STREAMING:
 * - Supports WebSocket connections for real-time event streaming
 * - Broadcasts game events to connected watchers
 * - Late-joiners receive full event history via SYNC message
 */

import { DurableObject } from 'cloudflare:workers';
import type { Env, GameQueueConfig } from './types.js';
import { Game, validateConfig, type GameConfig, type GameResult, type GameEvent } from '../engine/index.js';
import { createProvidersForGame, GameAIAdapter } from './ai/index.js';
import { generateSeed } from '../engine/utils/random.js';
import { calculateGameCost } from './utils/budget.js';
import { createLogger, logErrorWithStack, type Logger } from './utils/logger.js';

/** Storage keys for DO state persistence */
const STORAGE_KEYS = {
  STATUS: 'status',
  GAME_ID: 'gameId',
  BATCH_ID: 'batchId',
  STARTED_AT: 'startedAt',
  COMPLETED_AT: 'completedAt',
  ERROR: 'error',
  CONFIG: 'config',
  SEED: 'seed',
  EVENT_LOG: 'eventLog',
} as const;

/** DO storage limit is 128KB - use 100KB to leave headroom */
const MAX_STORAGE_BYTES = 100_000;

/**
 * Strip large fields from events for DO storage.
 * AICallEvent contains full prompts and raw responses which can be huge.
 * For live streaming, viewers only need to see the parsed action, not the prompts.
 * Full data is preserved in the R2 transcript.
 */
function stripEventForStorage(event: GameEvent): GameEvent {
  if (event.type === 'ai_call') {
    return {
      ...event,
      prompt: {
        system: '[stripped for storage]',
        user: '[stripped for storage]',
      },
      response: {
        raw: '[stripped for storage]',
        parsed: event.response.parsed,
      },
    };
  }
  if (event.type === 'ai_parse_error') {
    return {
      ...event,
      rawResponse: '[stripped for storage]',
    };
  }
  return event;
}

/**
 * Prepare events for DO storage by stripping large fields and truncating if needed.
 */
function prepareEventsForStorage(events: GameEvent[]): GameEvent[] {
  // Strip large fields from all events
  let stripped = events.map(stripEventForStorage);
  
  // Check size and truncate if still too large
  let serialized = JSON.stringify(stripped);
  
  // Progressively truncate if needed
  while (serialized.length > MAX_STORAGE_BYTES && stripped.length > 10) {
    // Keep last half of events, minimum 10
    const keepCount = Math.max(10, Math.floor(stripped.length / 2));
    stripped = stripped.slice(-keepCount);
    serialized = JSON.stringify(stripped);
  }
  
  return stripped;
}

interface GameRunnerState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  gameId: string | null;
  batchId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  seed: number | null;
}

/** WebSocket message types for live streaming */
interface WsMessage {
  type: 'SYNC' | 'EVENT' | 'STATUS' | 'ERROR';
  events?: GameEvent[] | undefined;
  event?: GameEvent | undefined;
  status?: GameRunnerState['status'] | undefined;
  error?: string | undefined;
  gameId?: string | undefined;
}

export class GameRunner extends DurableObject<Env> {
  private stateCache: GameRunnerState | null = null;
  
  /** Connected WebSocket clients for live streaming */
  private sessions: WebSocket[] = [];
  
  /** In-memory event log for live streaming (persisted to storage periodically) */
  private eventLog: GameEvent[] = [];

  /** Logger instance for this DO */
  private log: Logger;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.log = createLogger('GameRunner', { doId: ctx.id.toString().slice(-8) });
    this.log.info('DO initialized');
  }

  /**
   * Load state from storage or return cached state.
   */
  private async loadState(): Promise<GameRunnerState> {
    if (this.stateCache) {
      return this.stateCache;
    }

    const storage = this.ctx.storage;
    
    const [status, gameId, batchId, startedAt, completedAt, error, seed] = await Promise.all([
      storage.get<GameRunnerState['status']>(STORAGE_KEYS.STATUS),
      storage.get<string>(STORAGE_KEYS.GAME_ID),
      storage.get<string>(STORAGE_KEYS.BATCH_ID),
      storage.get<number>(STORAGE_KEYS.STARTED_AT),
      storage.get<number>(STORAGE_KEYS.COMPLETED_AT),
      storage.get<string>(STORAGE_KEYS.ERROR),
      storage.get<number>(STORAGE_KEYS.SEED),
    ]);

    this.stateCache = {
      status: status ?? 'idle',
      gameId: gameId ?? null,
      batchId: batchId ?? null,
      startedAt: startedAt ?? null,
      completedAt: completedAt ?? null,
      error: error ?? null,
      seed: seed ?? null,
    };

    return this.stateCache;
  }

  /**
   * Save state to storage.
   */
  private async saveState(state: Partial<GameRunnerState>): Promise<void> {
    const storage = this.ctx.storage;
    const updates: Promise<void>[] = [];

    if (state.status !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.STATUS, state.status));
      if (this.stateCache) this.stateCache.status = state.status;
    }
    if (state.gameId !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.GAME_ID, state.gameId));
      if (this.stateCache) this.stateCache.gameId = state.gameId;
    }
    if (state.batchId !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.BATCH_ID, state.batchId));
      if (this.stateCache) this.stateCache.batchId = state.batchId;
    }
    if (state.startedAt !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.STARTED_AT, state.startedAt));
      if (this.stateCache) this.stateCache.startedAt = state.startedAt;
    }
    if (state.completedAt !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.COMPLETED_AT, state.completedAt));
      if (this.stateCache) this.stateCache.completedAt = state.completedAt;
    }
    if (state.error !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.ERROR, state.error));
      if (this.stateCache) this.stateCache.error = state.error;
    }
    if (state.seed !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.SEED, state.seed));
      if (this.stateCache) this.stateCache.seed = state.seed;
    }

    await Promise.all(updates);
  }

  /**
   * Handle incoming fetch requests.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.log.debug('Incoming request', { path: url.pathname, method: request.method });

    try {
      switch (url.pathname) {
        case '/start':
          return await this.handleStart(request);

        case '/status':
          return await this.handleStatus();

        case '/websocket':
          return await this.handleWebSocket(request);

        case '/events':
          return await this.handleGetEvents();

        default:
          this.log.warn('Unknown path', { path: url.pathname });
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      logErrorWithStack(this.log, 'Request handler error', error, { path: url.pathname });
      throw error;
    }
  }

  /**
   * Handle WebSocket upgrade for live game streaming.
   */
  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    this.log.info('WebSocket upgrade request', { 
      upgradeHeader, 
      sessionCount: this.sessions.length 
    });

    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      this.log.warn('Invalid WebSocket upgrade', { upgradeHeader });
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Accept the WebSocket connection
    this.ctx.acceptWebSocket(server);
    this.sessions.push(server);
    this.log.info('WebSocket connected', { sessionCount: this.sessions.length });

    // Load event log from storage if not already loaded
    if (this.eventLog.length === 0) {
      const storedEvents = await this.ctx.storage.get<GameEvent[]>(STORAGE_KEYS.EVENT_LOG);
      if (storedEvents) {
        this.eventLog = storedEvents;
        this.log.debug('Loaded events from storage', { eventCount: this.eventLog.length });
      }
    }

    // Send current state and event history to new client
    const state = await this.loadState();
    const syncMessage: WsMessage = {
      type: 'SYNC',
      events: this.eventLog,
      status: state.status,
      gameId: state.gameId ?? undefined,
    };
    server.send(JSON.stringify(syncMessage));
    this.log.info('Sent SYNC message', { 
      eventCount: this.eventLog.length, 
      status: state.status,
      gameId: state.gameId 
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle WebSocket message event (Hibernation API).
   */
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Currently we don't handle incoming messages from clients
    // But this could be extended for interactive features
  }

  /**
   * Handle WebSocket close event (Hibernation API).
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    this.sessions = this.sessions.filter(s => s !== ws);
    this.log.info('WebSocket closed', { 
      code, 
      reason: reason || 'none', 
      wasClean, 
      remainingSessions: this.sessions.length 
    });
  }

  /**
   * Handle WebSocket error event (Hibernation API).
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    logErrorWithStack(this.log, 'WebSocket error', error, { 
      sessionCount: this.sessions.length 
    });
    this.sessions = this.sessions.filter(s => s !== ws);
  }

  /**
   * Broadcast a message to all connected WebSocket clients.
   */
  private broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    const deadSessions: WebSocket[] = [];

    for (const ws of this.sessions) {
      try {
        ws.send(data);
      } catch {
        deadSessions.push(ws);
      }
    }

    // Clean up dead sessions
    if (deadSessions.length > 0) {
      this.sessions = this.sessions.filter(s => !deadSessions.includes(s));
    }
  }

  /**
   * Get current events (for polling fallback).
   */
  private async handleGetEvents(): Promise<Response> {
    const state = await this.loadState();
    
    // Load events from storage if not in memory
    if (this.eventLog.length === 0) {
      const storedEvents = await this.ctx.storage.get<GameEvent[]>(STORAGE_KEYS.EVENT_LOG);
      if (storedEvents) {
        this.eventLog = storedEvents;
      }
    }

    return Response.json({
      status: state.status,
      gameId: state.gameId,
      eventCount: this.eventLog.length,
      events: this.eventLog,
    });
  }

  /**
   * Start a new game.
   * 
   * Supports two modes:
   * - Synchronous (default): Waits for game to complete before returning
   * - Background (background=true): Returns immediately, game runs via ctx.waitUntil
   *   Useful for live watching where frontend connects via WebSocket
   */
  private async handleStart(request: Request): Promise<Response> {
    const currentState = await this.loadState();
    
    // Check if game is stuck in "running" state (stale after 10 minutes)
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const isStale = currentState.status === 'running' && 
      currentState.startedAt && 
      (Date.now() - currentState.startedAt) > STALE_THRESHOLD_MS;

    if (currentState.status === 'running' && !isStale) {
      return Response.json(
        { error: 'Game already running', gameId: currentState.gameId },
        { status: 409 }
      );
    }

    // If stale, log and reset
    if (isStale) {
      console.log(`Game ${currentState.gameId} was stale (started ${Math.round((Date.now() - currentState.startedAt!) / 1000 / 60)} min ago), resetting`);
      await this.saveState({
        status: 'failed',
        error: 'Game timed out (stale)',
        completedAt: Date.now(),
      });
      // Update D1 if game was inserted
      if (currentState.gameId) {
        await this.updateGameStatus(currentState.gameId, 'failed', 'Game timed out');
      }
    }

    try {
      const body = await request.json() as {
        gameId: string;
        batchId: string;
        config: GameQueueConfig;
        /** Run in background mode - returns immediately while game executes */
        background?: boolean;
      };

      const { gameId, batchId, config, background = false } = body;

      // Generate seed for reproducibility if not provided
      const seed = config.seed ?? generateSeed();

      // Validate configuration
      const gameConfig = this.toGameConfig(config, seed);
      const validation = validateConfig(gameConfig);
      if (!validation.valid) {
        return Response.json(
          { error: 'Invalid configuration', details: validation.errors },
          { status: 400 }
        );
      }

      const startedAt = Date.now();

      // Persist state to storage BEFORE starting
      await this.saveState({
        status: 'running',
        gameId,
        batchId,
        startedAt,
        completedAt: null,
        error: null,
        seed,
      });

      // Reset event log
      this.eventLog = [];
      await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, []);

      // Insert 'running' record into D1 immediately so game appears in lists
      await this.insertRunningGame(gameId, batchId, gameConfig, startedAt);

      // Background mode: Return immediately, run game via waitUntil
      // This is used for live watching where frontend connects via WebSocket
      if (background) {
        this.ctx.waitUntil(this.runGameWithErrorHandling(gameId, batchId, gameConfig));
        return Response.json({ 
          success: true, 
          gameId, 
          seed, 
          status: 'running',
          message: 'Game started in background. Connect to WebSocket for live updates.',
          liveUrl: `/api/games/${gameId}/live`,
        });
      }

      // Synchronous mode: Run the game and wait for completion
      try {
        await this.runGame(gameId, batchId, gameConfig);
        return Response.json({ success: true, gameId, seed, status: 'completed' });
      } catch (error) {
        console.error(`Game ${gameId} failed:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        await this.saveState({
          status: 'failed',
          error: errorMessage,
          completedAt: Date.now(),
        });

        // Update game status to failed in D1
        await this.updateGameStatus(gameId, 'failed', errorMessage);

        // Broadcast error to connected clients
        this.broadcast({
          type: 'ERROR',
          error: errorMessage,
          status: 'failed',
          gameId,
        });

        return Response.json(
          { 
            success: false, 
            gameId, 
            seed, 
            status: 'failed',
            error: errorMessage,
          },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('Failed to start game:', error);
      return Response.json(
        { error: 'Failed to start game', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  /**
   * Run game with error handling for background execution.
   * Used with ctx.waitUntil() for non-blocking game execution.
   */
  private async runGameWithErrorHandling(
    gameId: string, 
    batchId: string, 
    gameConfig: GameConfig
  ): Promise<void> {
    const gameLog = this.log.child({ gameId, batchId });
    
    try {
      gameLog.info('Starting background game execution');
      await this.runGame(gameId, batchId, gameConfig);
      gameLog.info('Background game execution completed successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logErrorWithStack(gameLog, 'Background game failed', error, {
        eventCount: this.eventLog.length,
      });
      
      await this.saveState({
        status: 'failed',
        error: errorMessage,
        completedAt: Date.now(),
      });
      gameLog.info('State saved as failed');

      // Update game status to failed in D1
      await this.updateGameStatus(gameId, 'failed', errorMessage);

      // Broadcast error to connected clients
      this.broadcast({
        type: 'ERROR',
        error: errorMessage,
        status: 'failed',
        gameId,
      });
      gameLog.info('Error broadcasted to clients', { sessionCount: this.sessions.length });
    }
  }

  /**
   * Insert a running game record into D1 immediately.
   * This allows the game to appear in listings while it's still running.
   */
  private async insertRunningGame(
    gameId: string,
    batchId: string,
    config: GameConfig,
    startedAt: number
  ): Promise<void> {
    try {
      this.log.debug('Inserting running game record', { gameId, batchId });
      await this.env.DB.prepare(
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, seed, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 'running', ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = 'running', created_at = excluded.created_at`
      ).bind(
        gameId,
        batchId,
        this.hashConfig(config),
        config.playerCount,
        config.mafiaCount,
        config.seed ?? null,
        startedAt
      ).run();
      this.log.debug('Running game record inserted', { gameId });
    } catch (error) {
      logErrorWithStack(this.log, 'Failed to insert running game', error, { gameId });
      // Don't throw - game can still run without this record
    }
  }

  /**
   * Update game status in D1 (for failures).
   */
  private async updateGameStatus(gameId: string, status: string, errorMessage?: string): Promise<void> {
    try {
      this.log.debug('Updating game status in D1', { gameId, status });
      await this.env.DB.prepare(
        `UPDATE games SET status = ?, error_message = ?, updated_at = ? WHERE id = ?`
      ).bind(status, errorMessage ?? null, Date.now(), gameId).run();
      this.log.debug('Game status updated', { gameId, status });
    } catch (error) {
      logErrorWithStack(this.log, 'Failed to update game status', error, { gameId, status });
    }
  }

  /**
   * Get the current game status.
   */
  private async handleStatus(): Promise<Response> {
    const state = await this.loadState();
    return Response.json(state);
  }

  /**
   * Run the game to completion.
   */
  private async runGame(gameId: string, batchId: string, config: GameConfig): Promise<void> {
    const gameLog = this.log.child({ gameId, batchId });
    const startTime = Date.now();
    
    gameLog.info('Game starting', { 
      seed: config.seed,
      playerCount: config.playerCount,
      mafiaCount: config.mafiaCount,
      models: config.teams.map(t => t.modelId),
    });

    // Reset event log for this game
    this.eventLog = [];

    // Get all unique model IDs from the config
    const modelIds = config.teams.map((t) => t.modelId);

    // Create AI providers for all models
    gameLog.debug('Creating AI providers', { modelIds });
    const providers = createProvidersForGame(modelIds, this.env);
    const aiAdapter = new GameAIAdapter(providers);

    // Track event counts for logging
    let eventCount = 0;
    let lastPhase = '';
    let lastRound = 0;

    // Event callback for live streaming
    const onEvent = async (event: GameEvent) => {
      eventCount++;
      
      // Log phase transitions
      if (event.type === 'phase_start') {
        gameLog.info('Phase started', { 
          phase: event.phase, 
          round: event.round,
          eventCount,
        });
        lastPhase = event.phase;
        lastRound = event.round;
      }

      // Log eliminations
      if (event.type === 'elimination') {
        gameLog.info('Player eliminated', { 
          playerId: event.playerId,
          playerName: event.playerName,
          team: event.team,
          phase: event.phase,
          round: event.round,
        });
      }

      // Log AI calls (at debug level)
      if (event.type === 'ai_call') {
        gameLog.debug('AI call completed', { 
          modelId: event.modelId,
          playerId: event.playerId,
          actionType: event.actionType,
          tokensUsed: event.tokensUsed?.input + event.tokensUsed?.output,
          latencyMs: event.latencyMs,
        });
      }

      // Log AI errors
      if (event.type === 'ai_error' || event.type === 'ai_parse_error') {
        gameLog.warn('AI error', { 
          eventType: event.type,
          playerId: event.playerId,
          modelId: event.modelId,
        });
      }

      // Add to in-memory log (full events for R2 transcript)
      this.eventLog.push(event);

      // Persist periodically (every 10 events or on important events)
      // DO storage has 128KB limit, so we strip large fields and truncate if needed
      if (
        this.eventLog.length % 10 === 0 ||
        event.type === 'elimination' ||
        event.type === 'game_end' ||
        event.type === 'phase_start'
      ) {
        const eventsToStore = prepareEventsForStorage(this.eventLog);
        await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, eventsToStore);
        gameLog.debug('Events persisted to storage', { storedCount: eventsToStore.length });
      }

      // Broadcast to connected WebSocket clients (with stripped event for large responses)
      this.broadcast({
        type: 'EVENT',
        event: stripEventForStorage(event),
        gameId,
      });
    };

    // Create and run the game with live streaming
    gameLog.info('Creating game instance');
    const game = new Game(config, aiAdapter, { gameId, onEvent });
    
    gameLog.info('Running game loop');
    const result = await game.run();

    const durationMs = Date.now() - startTime;
    gameLog.info('Game completed', { 
      winner: result.winner,
      rounds: result.rounds,
      eventCount,
      durationMs,
      totalTokens: result.tokenUsage.total,
    });

    // Final persist of stripped events for DO storage
    const eventsToStore = prepareEventsForStorage(this.eventLog);
    await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, eventsToStore);

    // Persist results (idempotent)
    gameLog.debug('Persisting results to D1/R2');
    await this.persistResults(result, batchId);

    // Update state
    await this.saveState({
      status: 'completed',
      completedAt: Date.now(),
    });
    gameLog.info('State saved as completed');

    // Broadcast completion status
    this.broadcast({
      type: 'STATUS',
      status: 'completed',
      gameId,
    });
  }

  /**
   * Persist game results to D1 and R2.
   * IDEMPOTENT: Checks if game already exists before inserting.
   * Uses db.batch() for atomic D1 operations to prevent partial data states.
   * R2 write happens BEFORE D1 to ensure transcript exists if game record exists.
   */
  private async persistResults(result: GameResult, batchId: string): Promise<void> {
    const db = this.env.DB;
    const transcripts = this.env.TRANSCRIPTS;

    // Check if this game was already persisted (idempotency check)
    const existingGame = await db
      .prepare('SELECT id FROM games WHERE id = ?')
      .bind(result.id)
      .first();

    if (existingGame) {
      console.log(`Game ${result.id} already persisted, skipping to avoid double-counting`);
      return;
    }

    // Calculate cost using per-model pricing
    const modelIds = result.participants.map(p => p.modelId);
    const costUsd = calculateGameCost(modelIds, result.tokenUsage.total);
    const createdAt = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const mafiaWon = result.winner === 'mafia' ? 1 : 0;
    const townWon = result.winner === 'town' ? 1 : 0;

    // 1. Write transcript to R2 FIRST (before D1)
    // This ensures we never have a game record pointing to a missing transcript
    const transcript = {
      gameId: result.id,
      batchId,
      seed: result.config.seed,
      config: result.config,
      events: result.events,
      result: {
        winner: result.winner,
        rounds: result.rounds,
        participants: result.participants,
      },
      metadata: {
        totalTokens: result.tokenUsage,
        durationMs: result.durationMs,
        createdAt,
        costUsd,
      },
    };

    await transcripts.put(
      `games/${result.id}/transcript.json`,
      JSON.stringify(transcript, null, 2),
      {
        httpMetadata: { contentType: 'application/json' },
      }
    );

    // 2. Build all D1 statements for atomic batch execution
    const statements: D1PreparedStatement[] = [];

    // Insert game record
    statements.push(
      db.prepare(
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, seed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        result.id,
        batchId,
        this.hashConfig(result.config),
        result.config.playerCount,
        result.config.mafiaCount,
        result.winner,
        result.rounds,
        result.durationMs,
        result.tokenUsage.total,
        'completed',
        result.config.seed ?? null,
        createdAt
      )
    );

    // Insert game participants
    for (const participant of result.participants) {
      statements.push(
        db.prepare(
          `INSERT INTO game_participants (id, game_id, model_id, team, player_count, won)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          `${result.id}_${participant.modelId}_${participant.team}`,
          result.id,
          participant.modelId,
          participant.team,
          participant.playerCount,
          participant.won ? 1 : 0
        )
      );
    }

    // Update leaderboard for each participant
    for (const participant of result.participants) {
      statements.push(
        db.prepare(
          `INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens, updated_at)
           VALUES (?, ?, 1, ?, ?, ?)
           ON CONFLICT (model_id, team) DO UPDATE SET
             games_played = games_played + 1,
             games_won = games_won + excluded.games_won,
             total_tokens = total_tokens + excluded.total_tokens,
             updated_at = excluded.updated_at`
        ).bind(
          participant.modelId,
          participant.team,
          participant.won ? 1 : 0,
          participant.tokensUsed,
          createdAt
        )
      );
    }

    // Update daily stats
    statements.push(
      db.prepare(`
        INSERT INTO daily_stats (date, games_completed, games_failed, tokens_used, cost_usd, mafia_wins, town_wins)
        VALUES (?, 1, 0, ?, ?, ?, ?)
        ON CONFLICT (date) DO UPDATE SET
          games_completed = games_completed + 1,
          tokens_used = tokens_used + excluded.tokens_used,
          cost_usd = cost_usd + excluded.cost_usd,
          mafia_wins = mafia_wins + excluded.mafia_wins,
          town_wins = town_wins + excluded.town_wins,
          updated_at = unixepoch()
      `).bind(today, result.tokenUsage.total, costUsd, mafiaWon, townWon)
    );

    // Update batch progress (if part of a batch)
    if (batchId && !batchId.includes('direct')) {
      statements.push(
        db.prepare(`
          UPDATE batches 
          SET completed_games = completed_games + 1,
              actual_cost_usd = actual_cost_usd + ?
          WHERE id = ?
        `).bind(costUsd, batchId)
      );
    }

    // 3. Execute all D1 statements atomically
    await db.batch(statements);

    // 4. Check and update batch completion status
    if (batchId && !batchId.includes('direct')) {
      await this.checkBatchCompletion(batchId);
    }

    // 5. Log to Analytics Engine for real-time metrics (if available)
    if (this.env.ANALYTICS) {
      this.env.ANALYTICS.writeDataPoint({
        blobs: [
          modelIds[0] ?? 'unknown',
          modelIds[1] ?? 'unknown',
          result.winner,
          batchId,
        ],
        doubles: [
          result.rounds,
          result.durationMs,
          result.tokenUsage.total,
          costUsd,
        ],
        indexes: [batchId],
      });
    }

    console.log(`Persisted results for game ${result.id} (cost: $${costUsd.toFixed(4)})`);
  }

  /**
   * Check if a batch is complete and update its status.
   */
  private async checkBatchCompletion(batchId: string): Promise<void> {
    try {
      const batch = await this.env.DB.prepare(`
        SELECT total_games, completed_games, failed_games, status
        FROM batches WHERE id = ?
      `).bind(batchId).first<{
        total_games: number;
        completed_games: number;
        failed_games: number;
        status: string;
      }>();

      if (batch && batch.status === 'processing') {
        const totalProcessed = batch.completed_games + batch.failed_games;
        if (totalProcessed >= batch.total_games) {
          await this.env.DB.prepare(`
            UPDATE batches 
            SET status = 'completed', completed_at = unixepoch()
            WHERE id = ?
          `).bind(batchId).run();
          console.log(`Batch ${batchId} completed`);
        }
      }
    } catch (error) {
      console.error(`Failed to check batch completion for ${batchId}:`, error);
    }
  }


  /**
   * Convert queue config to game engine config.
   */
  private toGameConfig(config: GameQueueConfig, seed: number): GameConfig {
    return {
      playerCount: config.playerCount,
      mafiaCount: config.mafiaCount,
      teams: config.teams.map((t) => ({
        modelId: t.modelId,
        team: t.team,
        count: t.count,
      })),
      maxRounds: config.maxRounds,
      discussionEnabled: config.discussionEnabled,
      personaConstraints: config.personaConstraints,
      seed, // Include seed for reproducibility
      contextLevel: config.contextLevel ?? 'summary',
      contextWindowSize: config.contextWindowSize ?? 3,
    };
  }


  /**
   * Create a hash of the game configuration for grouping.
   */
  private hashConfig(config: GameConfig): string {
    const key = JSON.stringify({
      playerCount: config.playerCount,
      mafiaCount: config.mafiaCount,
      teams: config.teams.map((t) => ({ modelId: t.modelId, team: t.team })).sort((a, b) =>
        `${a.modelId}:${a.team}`.localeCompare(`${b.modelId}:${b.team}`)
      ),
      discussionEnabled: config.discussionEnabled,
    });

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(16);
  }
}

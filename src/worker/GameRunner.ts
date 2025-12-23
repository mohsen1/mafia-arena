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
  TRACE_ID: 'traceId',
  DISCOUNT_PRICING: 'discountPricing',
  LAST_ACTIVITY: 'lastActivity',
} as const;

/** 
 * Stale thresholds for game status checks.
 * Discount pricing games get a much longer threshold (48 hours) to accommodate
 * AI provider batch API response times (up to 24 hours).
 */
const STALE_THRESHOLD_MS = {
  STANDARD: 10 * 60 * 1000,              // 10 minutes for real-time games
  DISCOUNT_PRICING: 48 * 60 * 60 * 1000, // 48 hours for discount pricing games
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
 * Returns stripped events that fit within DO storage limits.
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
  
  // Final safety check - if still too large, keep only last 10 events
  if (serialized.length > MAX_STORAGE_BYTES) {
    stripped = stripped.slice(-10);
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
  traceId: string | null;
  /** Whether this game uses discount pricing (longer timeouts) */
  discountPricing: boolean;
  /** Timestamp of last activity (AI call, event, etc.) */
  lastActivity: number | null;
}

/** WebSocket message types for live streaming */
interface WsMessage {
  type: 'SYNC' | 'EVENT' | 'STATUS' | 'ERROR';
  events?: GameEvent[] | undefined;
  event?: GameEvent | undefined;
  status?: GameRunnerState['status'] | undefined;
  error?: string | undefined;
  gameId?: string | undefined;
  /** Duration in ms for failed/completed games */
  durationMs?: number | undefined;
}

export class GameRunner extends DurableObject<Env> {
  private stateCache: GameRunnerState | null = null;
  
  /** Connected WebSocket clients for live streaming */
  private sessions: WebSocket[] = [];
  
  /** In-memory event log for live streaming (persisted to storage periodically) */
  private eventLog: GameEvent[] = [];

  /** Logger instance for this DO */
  private log: Logger;

  /** Timestamp of last D1 activity update (for throttling - update every 5 min) */
  private lastD1ActivityUpdate = 0;
  
  /** Throttle interval for D1 activity updates (5 minutes) */
  private static readonly D1_ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.log = createLogger('GameRunner', { doId: ctx.id.toString().slice(-8) });
    this.log.info('DO initialized');

    // Auto-resume interrupted games if they are not stale
    this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.loadState();
      
      if (state.status === 'running' && state.startedAt && state.gameId && state.batchId) {
        // Use longer timeout for discount pricing games (48h vs 10min)
        const staleThreshold = state.discountPricing 
          ? STALE_THRESHOLD_MS.DISCOUNT_PRICING 
          : STALE_THRESHOLD_MS.STANDARD;
        
        // Check against lastActivity if available, otherwise startedAt
        const lastActive = state.lastActivity ?? state.startedAt;
        const isStale = (Date.now() - lastActive) > staleThreshold;
        
        if (!isStale) {
          const config = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
          if (config) {
            this.log.info('Resuming interrupted game', { 
              gameId: state.gameId,
              discountPricing: state.discountPricing,
              lastActive: new Date(lastActive).toISOString(),
            });
            const gameConfig = this.toGameConfig(config, state.seed || 0);
            
            // In DO environment, any unfinished waitUntil tasks are lost on eviction.
            // By calling it here, we ensure it starts again when the DO wakes up.
            this.ctx.waitUntil(this.runGameWithErrorHandling(state.gameId, state.batchId, gameConfig));
          }
        } else {
          const staleDuration = state.discountPricing ? '48 hours' : '10 minutes';
          this.log.warn('Interrupted game is stale, marking as failed', { 
            gameId: state.gameId,
            discountPricing: state.discountPricing,
            staleDuration,
          });
          await this.saveState({
            status: 'failed',
            error: `Interrupted and timed out (stale after ${staleDuration})`,
            completedAt: Date.now(),
          });
          await this.updateGameStatus(state.gameId, 'failed', `Interrupted and timed out (stale after ${staleDuration})`);
        }
      }
    });
  }

  /**
   * Load state from storage or return cached state.
   */
  private async loadState(): Promise<GameRunnerState> {
    if (this.stateCache) {
      return this.stateCache;
    }

    const storage = this.ctx.storage;
    
    const [status, gameId, batchId, startedAt, completedAt, error, seed, traceId, discountPricing, lastActivity] = await Promise.all([
      storage.get<GameRunnerState['status']>(STORAGE_KEYS.STATUS),
      storage.get<string>(STORAGE_KEYS.GAME_ID),
      storage.get<string>(STORAGE_KEYS.BATCH_ID),
      storage.get<number>(STORAGE_KEYS.STARTED_AT),
      storage.get<number>(STORAGE_KEYS.COMPLETED_AT),
      storage.get<string>(STORAGE_KEYS.ERROR),
      storage.get<number>(STORAGE_KEYS.SEED),
      storage.get<string>(STORAGE_KEYS.TRACE_ID),
      storage.get<boolean>(STORAGE_KEYS.DISCOUNT_PRICING),
      storage.get<number>(STORAGE_KEYS.LAST_ACTIVITY),
    ]);

    this.stateCache = {
      status: status ?? 'idle',
      gameId: gameId ?? null,
      batchId: batchId ?? null,
      startedAt: startedAt ?? null,
      completedAt: completedAt ?? null,
      error: error ?? null,
      seed: seed ?? null,
      traceId: traceId ?? null,
      discountPricing: discountPricing ?? false,
      lastActivity: lastActivity ?? null,
    };

    return this.stateCache;
  }

  /**
   * Save state to storage.
   */
  private async saveState(state: Partial<GameRunnerState & { config: GameQueueConfig }>): Promise<void> {
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
    if (state.traceId !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.TRACE_ID, state.traceId));
      if (this.stateCache) this.stateCache.traceId = state.traceId;
    }
    if (state.discountPricing !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.DISCOUNT_PRICING, state.discountPricing));
      if (this.stateCache) this.stateCache.discountPricing = state.discountPricing;
    }
    if (state.lastActivity !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.LAST_ACTIVITY, state.lastActivity));
      if (this.stateCache) this.stateCache.lastActivity = state.lastActivity;
    }
    if (state.config !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.CONFIG, state.config));
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
      // Include error and duration for failed/completed games
      error: state.error ?? undefined,
      durationMs: state.startedAt && state.completedAt 
        ? state.completedAt - state.startedAt 
        : undefined,
    };
    server.send(JSON.stringify(syncMessage));
    this.log.info('Sent SYNC message', { 
      eventCount: this.eventLog.length, 
      status: state.status,
      gameId: state.gameId,
      hasError: !!state.error,
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
   * For completed games, serves full data from R2 transcript.
   * For running games, serves stripped data from DO storage (real-time).
   */
  private async handleGetEvents(): Promise<Response> {
    const state = await this.loadState();
    
    // For completed/failed games, serve from R2 transcript (has full unstripped data)
    if (state.status === 'completed' || state.status === 'failed') {
      try {
        const transcript = await this.env.TRANSCRIPTS.get(`games/${state.gameId}/transcript.json`);
        if (transcript) {
          const data = await transcript.json() as { events: GameEvent[] };
          return Response.json({
            status: state.status,
            gameId: state.gameId,
            eventCount: data.events?.length ?? 0,
            events: data.events ?? [],
          });
        }
      } catch (error) {
        this.log.warn('Failed to read transcript from R2, falling back to DO storage', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    // For running games (or if R2 read fails), use DO storage (stripped data)
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
      // Include error for failed games
      error: state.error ?? undefined,
      // Include duration for completed/failed games
      durationMs: state.startedAt && state.completedAt 
        ? state.completedAt - state.startedAt 
        : undefined,
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
    
    // Check if game is stuck in "running" state - use appropriate threshold
    const staleThreshold = currentState.discountPricing 
      ? STALE_THRESHOLD_MS.DISCOUNT_PRICING 
      : STALE_THRESHOLD_MS.STANDARD;
    
    // Check against lastActivity if available, otherwise startedAt
    const lastActive = currentState.lastActivity ?? currentState.startedAt;
    const isStale = currentState.status === 'running' && 
      lastActive && 
      (Date.now() - lastActive) > staleThreshold;

    if (currentState.status === 'running' && !isStale) {
      return Response.json(
        { 
          error: 'Game already running', 
          gameId: currentState.gameId,
          discountPricing: currentState.discountPricing,
          lastActivity: currentState.lastActivity,
        },
        { status: 409 }
      );
    }

    // If stale, log and reset
    if (isStale) {
      const staleDuration = currentState.discountPricing ? '48 hours' : '10 minutes';
      const timeAgo = currentState.discountPricing 
        ? Math.round((Date.now() - lastActive!) / 1000 / 60 / 60) + ' hours'
        : Math.round((Date.now() - lastActive!) / 1000 / 60) + ' min';
      console.log(`Game ${currentState.gameId} was stale (last active ${timeAgo} ago, threshold: ${staleDuration}), resetting`);
      await this.saveState({
        status: 'failed',
        error: `Game timed out (stale after ${staleDuration})`,
        completedAt: Date.now(),
      });
      // Update D1 if game was inserted
      if (currentState.gameId) {
        await this.updateGameStatus(currentState.gameId, 'failed', `Game timed out (stale after ${staleDuration})`);
      }
    }

    try {
      const body = await request.json() as {
        gameId: string;
        batchId: string;
        config: GameQueueConfig;
        /** Run in background mode - returns immediately while game executes */
        background?: boolean;
        /** Trace ID for distributed tracing */
        traceId?: string;
      };

      const { gameId, batchId, config, background = false, traceId } = body;
      
      // Create logger with traceId context
      const gameLog = traceId 
        ? this.log.child({ gameId, batchId, traceId })
        : this.log.child({ gameId, batchId });

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
      const discountPricing = config.discountPricing ?? false;

      // Persist state to storage BEFORE starting
      await this.saveState({
        status: 'running',
        gameId,
        batchId,
        startedAt,
        completedAt: null,
        error: null,
        seed,
        traceId: traceId ?? null,
        discountPricing,
        lastActivity: startedAt,
        config, // Store config for resume logic
      });
      
      gameLog.info('Game starting', { seed, background, discountPricing });

      // Reset event log
      this.eventLog = [];
      await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, []);

      // Insert 'running' record into D1 immediately so game appears in lists
      await this.insertRunningGame(gameId, batchId, gameConfig, startedAt, traceId);

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
    startedAt: number,
    traceId?: string,
    discountPricing = false
  ): Promise<void> {
    try {
      this.log.debug('Inserting running game record', { gameId, batchId, traceId, discountPricing });
      
      // Build batch of statements for game and participants
      const statements: D1PreparedStatement[] = [];
      
      // Insert game record with discount_pricing and last_activity for smart stale detection
      statements.push(
        this.env.DB.prepare(
          `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, seed, persona_theme, trace_id, discount_pricing, last_activity, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 'running', ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET status = 'running', trace_id = excluded.trace_id, discount_pricing = excluded.discount_pricing, last_activity = excluded.last_activity, created_at = excluded.created_at`
        ).bind(
          gameId,
          batchId,
          this.hashConfig(config),
          config.playerCount,
          config.mafiaCount,
          config.seed ?? null,
          config.personaTheme ?? 'noir',
          traceId ?? null,
          discountPricing ? 1 : 0,
          startedAt, // last_activity starts as startedAt
          startedAt
        )
      );
      
      // Insert participants with won = 0 (will be updated when game completes)
      for (const team of config.teams) {
        statements.push(
          this.env.DB.prepare(
            `INSERT INTO game_participants (id, game_id, model_id, team, player_count, won)
             VALUES (?, ?, ?, ?, ?, 0)
             ON CONFLICT (id) DO NOTHING`
          ).bind(
            `${gameId}_${team.modelId}_${team.team}`,
            gameId,
            team.modelId,
            team.team,
            team.count
          )
        );
      }
      
      await this.env.DB.batch(statements);
      this.log.debug('Running game record and participants inserted', { gameId });
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
   * Update last_activity in D1 for smart stale detection.
   * Called periodically during game execution to signal the game is still alive.
   */
  private async updateLastActivityInD1(gameId: string): Promise<void> {
    try {
      const now = Date.now();
      await this.env.DB.prepare(
        `UPDATE games SET last_activity = ? WHERE id = ?`
      ).bind(now, gameId).run();
      this.log.debug('D1 last_activity updated', { gameId });
    } catch (error) {
      // Non-fatal - log but don't throw
      this.log.warn('Failed to update last_activity in D1', { 
        gameId, 
        error: error instanceof Error ? error.message : String(error) 
      });
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
      models: config.teams.map(t => t.modelId).join(','),
    });

    // Reset event log for this game
    this.eventLog = [];

    // Get discountPricing from config for activity tracking and provider configuration
    const discountPricing = (await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG))?.discountPricing ?? false;

    // Get all unique model IDs from the config
    const modelIds = config.teams.map((t) => t.modelId);

    // Create AI providers for all models
    // Pass discountPricing to use longer timeouts and more retries
    gameLog.debug('Creating AI providers', { modelIds: modelIds.join(','), discountPricing });
    const providers = createProvidersForGame(modelIds, this.env, { discountPricing });
    const aiAdapter = new GameAIAdapter(providers);

    // Track event counts for logging
    let eventCount = 0;

    // Event callback for live streaming
    const onEvent = async (event: GameEvent) => {
      eventCount++;
      const now = Date.now();
      
      // Update lastActivity on significant events (especially AI calls)
      // This is crucial for discount pricing games to avoid being marked stale
      if (event.type === 'ai_call' || event.type === 'phase_start' || event.type === 'elimination') {
        await this.ctx.storage.put(STORAGE_KEYS.LAST_ACTIVITY, now);
        if (this.stateCache) this.stateCache.lastActivity = now;
        
        // Also update D1 periodically (throttled to every 5 minutes)
        // This allows the scheduled cleanup job to detect active games
        if (now - this.lastD1ActivityUpdate >= GameRunner.D1_ACTIVITY_UPDATE_INTERVAL_MS) {
          this.lastD1ActivityUpdate = now;
          // Fire and forget - don't await to avoid blocking game execution
          this.updateLastActivityInD1(gameId).catch(() => {});
        }
      }
      
      // Log phase transitions
      if (event.type === 'phase_start') {
        gameLog.info('Phase started', { 
          phase: event.phase, 
          round: event.round,
          eventCount,
          discountPricing,
        });
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

      // Log AI parse errors
      if (event.type === 'ai_parse_error') {
        gameLog.warn('AI parse error', { 
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
        try {
          const eventsToStore = prepareEventsForStorage(this.eventLog);
          const serializedSize = JSON.stringify(eventsToStore).length;
          
          if (serializedSize > MAX_STORAGE_BYTES) {
            gameLog.warn('Events still too large after stripping, keeping last 10 only', {
              size: serializedSize,
              eventCount: eventsToStore.length,
            });
            // Emergency truncation - keep only last 10 events with all fields stripped
            const emergency = eventsToStore.slice(-10);
            await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, emergency);
            gameLog.debug('Emergency event truncation applied', { storedCount: emergency.length });
          } else {
            await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, eventsToStore);
            gameLog.debug('Events persisted to storage', { 
              storedCount: eventsToStore.length,
              sizeBytes: serializedSize 
            });
          }
        } catch (error) {
          // Storage failed - likely size issue. Log but don't fail the game.
          // Full events are still preserved in R2 transcript.
          logErrorWithStack(gameLog, 'Failed to persist events to DO storage', error, {
            eventCount: this.eventLog.length,
          });
          gameLog.warn('Continuing game without DO event storage (R2 transcript unaffected)');
        }
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
    try {
      const eventsToStore = prepareEventsForStorage(this.eventLog);
      const serializedSize = JSON.stringify(eventsToStore).length;
      
      if (serializedSize > MAX_STORAGE_BYTES) {
        gameLog.warn('Final events too large, keeping last 10 only', {
          size: serializedSize,
          eventCount: eventsToStore.length,
        });
        await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, eventsToStore.slice(-10));
      } else {
        await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, eventsToStore);
      }
    } catch (error) {
      // Storage failed but game completed - R2 transcript has full data
      logErrorWithStack(gameLog, 'Failed to persist final events to DO storage', error);
      gameLog.warn('Game completed successfully, but DO event storage failed (R2 transcript has full data)');
    }

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
    
    // Get current state to retrieve traceId
    const state = await this.loadState();
    const traceId = state.traceId;

    // Check if this game was already completed (idempotency check)
    // Note: Record might exist with status 'running' from insertRunningGame()
    const existingGame = await db
      .prepare('SELECT status FROM games WHERE id = ?')
      .bind(result.id)
      .first<{ status: string }>();

    if (existingGame?.status === 'completed') {
      console.log(`[${traceId || 'no-trace'}] Game ${result.id} already completed, skipping to avoid double-counting`);
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
      traceId: traceId ?? undefined,
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

    // Insert or update game record (may already exist from insertRunningGame)
    statements.push(
      db.prepare(
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, seed, persona_theme, trace_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           winner = excluded.winner,
           rounds = excluded.rounds,
           duration_ms = excluded.duration_ms,
           total_tokens = excluded.total_tokens,
           status = excluded.status,
           persona_theme = excluded.persona_theme,
           trace_id = COALESCE(excluded.trace_id, trace_id)`
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
        result.config.personaTheme ?? 'noir',
        traceId ?? null,
        createdAt
      )
    );

    // Insert or update game participants (may already exist from insertRunningGame)
    for (const participant of result.participants) {
      statements.push(
        db.prepare(
          `INSERT INTO game_participants (id, game_id, model_id, team, player_count, won)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET won = excluded.won, player_count = excluded.player_count`
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
   * Note: discountPricing is NOT passed to engine - it's a worker-level config
   * that affects timeouts and state persistence, not game logic.
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
      personaTheme: config.personaTheme ?? 'noir',
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

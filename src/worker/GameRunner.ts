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
import { Game, validateConfig, type GameConfig, type GameResult, type GameEvent, type SerializedGameState } from '../engine/index.js';
import { createProvidersForGame, GameAIAdapter } from './ai/index.js';
import { isTestModel } from './ai/providers/MockE2EProvider.js';
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
  TRACE_ID: 'traceId',
  DISCOUNT_PRICING: 'discountPricing',
  LAST_ACTIVITY: 'lastActivity',
  /** @deprecated Use CHECKPOINT_META instead - kept for migration */
  GAME_STATE: 'gameState',
  /** Event log for WebSocket sync (persisted to survive eviction) */
  EVENT_LOG: 'eventLog',
  /** Active heartbeat timestamp - proves game is actively running */
  HEARTBEAT: 'heartbeat',
  /** Current phase being executed (for debugging stuck games) */
  CURRENT_PHASE: 'currentPhase',
  /** Current round being executed */
  CURRENT_ROUND: 'currentRound',
  /** R2 checkpoint pointer - replaces GAME_STATE to avoid 128KB limit */
  CHECKPOINT_META: 'checkpointMeta',
} as const;

/**
 * Metadata pointer to R2-stored game state checkpoint.
 * This is tiny (~100 bytes) and stored in DO storage.
 * The actual game state (unlimited size) is in R2.
 */
interface CheckpointMeta {
  /** R2 key where full state is stored */
  r2Key: string;
  /** Timestamp when checkpoint was saved */
  timestamp: number;
  /** Round number for debugging */
  round: number;
  /** Phase for debugging */
  phase: string;
  /** Version for future migrations */
  version: number;
}

/** 
 * Stale thresholds for game status checks.
 * Discount pricing games get a much longer threshold (48 hours) to accommodate
 * AI provider batch API response times (up to 24 hours).
 */
const STALE_THRESHOLD_MS = {
  STANDARD: 10 * 60 * 1000,              // 10 minutes for real-time games
  DISCOUNT_PRICING: 48 * 60 * 60 * 1000, // 48 hours for discount pricing games
} as const;

/** Max length for action messages in stripped events */
const MAX_ACTION_MESSAGE_LENGTH = 200;

/**
 * Truncate a string to max length, adding ellipsis if truncated.
 */
function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/**
 * Strip large fields from events for WebSocket streaming and DO storage.
 * AICallEvent contains full prompts and raw responses which can be huge.
 * For live streaming, viewers only need to see the parsed action (truncated).
 * Full data is preserved in the R2 transcript.
 * 
 * Uses structuredClone for deep copy to prevent:
 * - Mutation of original event objects
 * - Reference leaks to nested data structures
 */
function stripEventForStorage(event: GameEvent): GameEvent {
  if (event.type === 'ai_call') {
    // Truncate the message in parsed action if it's a message-type action
    const parsed = event.response.parsed;
    let strippedParsed = parsed;
    
    if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
      strippedParsed = {
        ...parsed,
        message: truncateString(parsed.message, MAX_ACTION_MESSAGE_LENGTH),
      };
    }
    
    // Deep copy with stripped fields - structuredClone ensures no reference leaks
    return structuredClone({
      ...event,
      prompt: {
        system: '[stripped]',
        user: '[stripped]',
      },
      response: {
        raw: '[stripped]',
        parsed: strippedParsed,
      },
    });
  }
  
  if (event.type === 'ai_parse_error') {
    return structuredClone({
      ...event,
      rawResponse: '[stripped]',
    });
  }

  // For other event types, deep copy to prevent reference leaks
  return structuredClone(event);
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
  /** Active heartbeat timestamp - proves game is actively running, not stuck */
  heartbeat: number | null;
  /** Current phase being executed (for debugging) */
  currentPhase: string | null;
  /** Current round being executed */
  currentRound: number | null;
}

/** WebSocket message types for live streaming */
interface WsMessage {
  type: 'SYNC' | 'EVENT' | 'STATUS' | 'ERROR';
  events?: GameEvent[] | undefined;
  event?: GameEvent | undefined;
  status?: GameRunnerState['status'] | undefined;
  error?: string | undefined;
  gameId?: string | undefined;
  /** Game start timestamp (ms since epoch) */
  startedAt?: number | undefined;
  /** Duration in ms for failed/completed games */
  durationMs?: number | undefined;
}

export class GameRunner extends DurableObject<Env> {
  private stateCache: GameRunnerState | null = null;
  
  /** Connected WebSocket clients for live streaming */
  private sessions: WebSocket[] = [];
  
  /** In-memory event log for live streaming (full events with prompts for R2 transcript) */
  private eventLog: GameEvent[] = [];
  
  /** Stripped event log for DO storage persistence (avoids SQLITE_TOOBIG) */
  private strippedEventLog: GameEvent[] = [];
  
  /** Maximum events to store in DO storage (to avoid 128KB SQLite limit) */
  private static readonly MAX_DO_STORAGE_EVENTS = 20;
  
  /** Index of last event streamed to R2 (for incremental streaming) */
  private lastR2StreamIndex: number = 0;

  /** Logger instance for this DO */
  private log: Logger;

  /** Timestamp of last D1 activity update (for throttling - update every 5 min) */
  private lastD1ActivityUpdate = 0;
  
  /** Throttle interval for D1 activity updates (5 minutes) */
  private static readonly D1_ACTIVITY_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
  
  /** Heartbeat interval handle (for cleanup on game end) */
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  
  /** Heartbeat interval in milliseconds (15 seconds) */
  private static readonly HEARTBEAT_INTERVAL_MS = 15_000;

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
    
    const [status, gameId, batchId, startedAt, completedAt, error, seed, traceId, discountPricing, lastActivity, heartbeat, currentPhase, currentRound] = await Promise.all([
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
      storage.get<number>(STORAGE_KEYS.HEARTBEAT),
      storage.get<string>(STORAGE_KEYS.CURRENT_PHASE),
      storage.get<number>(STORAGE_KEYS.CURRENT_ROUND),
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
      heartbeat: heartbeat ?? null,
      currentPhase: currentPhase ?? null,
      currentRound: currentRound ?? null,
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
    if (state.heartbeat !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.HEARTBEAT, state.heartbeat));
      if (this.stateCache) this.stateCache.heartbeat = state.heartbeat;
    }
    if (state.currentPhase !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.CURRENT_PHASE, state.currentPhase));
      if (this.stateCache) this.stateCache.currentPhase = state.currentPhase;
    }
    if (state.currentRound !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.CURRENT_ROUND, state.currentRound));
      if (this.stateCache) this.stateCache.currentRound = state.currentRound;
    }

    await Promise.all(updates);
  }

  // ===========================================================================
  // R2 Checkpoint System (Replaces 128KB-limited DO storage)
  // ===========================================================================

  /**
   * Load serialized game state, handling migration from DO storage to R2.
   * 
   * This implements a hybrid approach:
   * 1. First, check for the new R2 checkpoint pointer (CHECKPOINT_META)
   * 2. If found, fetch full state from R2 (no size limits)
   * 3. Fall back to legacy DO storage (GAME_STATE) for older games
   * 
   * The fallback ensures running games aren't broken during deployment.
   */
  private async loadSerializedGameState(): Promise<SerializedGameState | undefined> {
    // 1. Try new R2-backed checkpoint system
    const meta = await this.ctx.storage.get<CheckpointMeta>(STORAGE_KEYS.CHECKPOINT_META);
    
    if (meta) {
      this.log.debug('Loading checkpoint from R2', { r2Key: meta.r2Key, round: meta.round });
      try {
        const object = await this.env.TRANSCRIPTS.get(meta.r2Key);
        if (object) {
          const state = await object.json<SerializedGameState>();
          this.log.info('Loaded game state from R2 checkpoint', { 
            r2Key: meta.r2Key,
            round: state.round,
            phase: state.phase,
            eventCount: state.events.length,
          });
          return state;
        }
        // Checkpoint file missing - fall through to legacy
        this.log.warn('R2 checkpoint file missing, trying legacy storage', { r2Key: meta.r2Key });
      } catch (error) {
        logErrorWithStack(this.log, 'Failed to load checkpoint from R2', error, { r2Key: meta.r2Key });
        // Don't throw - try legacy fallback
      }
    }

    // 2. Fallback: Legacy DO storage (for games started before this change)
    const legacyState = await this.ctx.storage.get<SerializedGameState>(STORAGE_KEYS.GAME_STATE);
    if (legacyState) {
      this.log.info('Loaded legacy DO-stored state (will migrate to R2 on next save)', {
        round: legacyState.round,
        phase: legacyState.phase,
      });
      return legacyState;
    }

    return undefined;
  }

  /**
   * Save game state checkpoint to R2 and update DO pointer.
   * 
   * This completely eliminates the 128KB DO storage limit by:
   * 1. Writing the FULL state to R2 (unlimited size)
   * 2. Storing only a tiny pointer in DO storage (~100 bytes)
   * 
   * Also cleans up legacy GAME_STATE key to free DO storage space.
   */
  private async saveCheckpoint(state: SerializedGameState): Promise<void> {
    const r2Key = `games/${state.gameId}/checkpoints/round_${state.round}_${state.phase}.json`;
    
    // 1. Write FULL state to R2 (no size limits!)
    // We no longer need to strip personas, truncate messages, etc.
    await this.env.TRANSCRIPTS.put(r2Key, JSON.stringify(state), {
      httpMetadata: { contentType: 'application/json' },
    });
    
    // 2. Update pointer in DO storage (tiny ~100 bytes)
    const meta: CheckpointMeta = {
      r2Key,
      timestamp: Date.now(),
      round: state.round,
      phase: state.phase,
      version: 1,
    };
    await this.ctx.storage.put(STORAGE_KEYS.CHECKPOINT_META, meta);
    
    // 3. Delete legacy GAME_STATE key if it exists (migration cleanup)
    // This frees up DO storage space
    await this.ctx.storage.delete(STORAGE_KEYS.GAME_STATE);
    
    this.log.debug('Checkpoint saved to R2', { 
      r2Key, 
      round: state.round, 
      phase: state.phase,
      estimatedBytes: JSON.stringify(state).length,
    });
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

        case '/health':
          return await this.handleHealth();

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

    // Load event log if not already loaded (for DO hibernation recovery)
    // Try DO storage first (faster), then fall back to R2 stream
    if (this.eventLog.length === 0) {
      const state = await this.loadState();
      if (state.gameId && state.status === 'running') {
        // Try DO storage first (persisted on every event, stripped to avoid size limits)
        const storedEvents = await this.ctx.storage.get<GameEvent[]>(STORAGE_KEYS.EVENT_LOG);
        if (storedEvents && storedEvents.length > 0) {
          this.eventLog = storedEvents;
          this.strippedEventLog = storedEvents;
          this.lastR2StreamIndex = storedEvents.length;
          this.log.debug('Loaded events from DO storage', { eventCount: this.eventLog.length });
        } else {
          // Fall back to R2 stream
          const streamedEvents = await this.loadEventsFromR2Stream(state.gameId);
          if (streamedEvents.length > 0) {
            this.eventLog = streamedEvents;
            this.strippedEventLog = streamedEvents.map(stripEventForStorage);
            this.lastR2StreamIndex = streamedEvents.length;
            this.log.debug('Loaded events from R2 stream', { eventCount: this.eventLog.length });
          }
        }
      }
    }

    // Send current state and event history to new client
    const state = await this.loadState();
    const syncMessage: WsMessage = {
      type: 'SYNC',
      events: this.eventLog,
      status: state.status,
      gameId: state.gameId ?? undefined,
      // Include startedAt for timer calculation
      startedAt: state.startedAt ?? undefined,
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
   * Start the heartbeat interval.
   * Heartbeat proves the game is actively running (not stuck waiting on AI).
   * External health checks can use this to detect truly stuck games.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing interval
    
    const updateHeartbeat = async () => {
      const now = Date.now();
      try {
        await this.ctx.storage.put(STORAGE_KEYS.HEARTBEAT, now);
        if (this.stateCache) this.stateCache.heartbeat = now;
        this.log.debug('Heartbeat updated', { timestamp: now });
      } catch (error) {
        this.log.warn('Failed to update heartbeat', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    };
    
    // Initial heartbeat
    updateHeartbeat();
    
    // Periodic heartbeat (every 15 seconds)
    this.heartbeatInterval = setInterval(() => {
      updateHeartbeat();
    }, GameRunner.HEARTBEAT_INTERVAL_MS);
    
    this.log.info('Heartbeat started', { intervalMs: GameRunner.HEARTBEAT_INTERVAL_MS });
  }
  
  /**
   * Stop the heartbeat interval.
   * Called when game completes or fails.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.log.debug('Heartbeat stopped');
    }
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
   * For running games, serves from DO storage, then R2 stream fallback.
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
            startedAt: state.startedAt ?? undefined,
            durationMs: state.startedAt && state.completedAt 
              ? state.completedAt - state.startedAt 
              : undefined,
          });
        }
      } catch (error) {
        this.log.warn('Failed to read transcript from R2', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    // For running games, use in-memory events or load from storage
    // Try DO storage first (persisted on every event), then R2 stream
    if (this.eventLog.length === 0 && state.gameId && state.status === 'running') {
      const storedEvents = await this.ctx.storage.get<GameEvent[]>(STORAGE_KEYS.EVENT_LOG);
      if (storedEvents && storedEvents.length > 0) {
        this.eventLog = storedEvents;
        this.strippedEventLog = storedEvents;
        this.lastR2StreamIndex = storedEvents.length;
      } else {
        const streamedEvents = await this.loadEventsFromR2Stream(state.gameId);
        if (streamedEvents.length > 0) {
          this.eventLog = streamedEvents;
          this.strippedEventLog = streamedEvents.map(stripEventForStorage);
          this.lastR2StreamIndex = streamedEvents.length;
        }
      }
    }

    return Response.json({
      status: state.status,
      gameId: state.gameId,
      eventCount: this.eventLog.length,
      events: this.eventLog,
      startedAt: state.startedAt ?? undefined,
      error: state.error ?? undefined,
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

      // Reset event logs (memory only - no DO storage)
      this.eventLog = [];
      this.strippedEventLog = [];
      this.lastR2StreamIndex = 0;

      // Insert 'running' record into D1 immediately so game appears in lists
      // Skip for test games to avoid polluting production data
      const modelIds = config.teams.map(t => t.modelId);
      const isTestGame = modelIds.some(id => isTestModel(id));
      if (!isTestGame) {
        await this.insertRunningGame(gameId, batchId, gameConfig, startedAt, traceId);
      } else {
        gameLog.info('Skipping D1 insert for test game', { testModels: modelIds.filter(id => isTestModel(id)).join(',') });
      }

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
      // Ensure heartbeat is stopped on error
      this.stopHeartbeat();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      logErrorWithStack(gameLog, 'Background game failed', error, {
        eventCount: this.eventLog.length,
      });
      
      await this.saveState({
        status: 'failed',
        error: errorMessage,
        completedAt: Date.now(),
        currentPhase: null,
        currentRound: null,
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
   * Get detailed health status for monitoring.
   * This endpoint helps distinguish between:
   * - Game actively running (heartbeat recent)
   * - Game stuck/crashed (heartbeat stale)
   * - Game waiting on slow AI (activity recent, heartbeat recent)
   */
  private async handleHealth(): Promise<Response> {
    const state = await this.loadState();
    const now = Date.now();
    
    // Calculate time since last heartbeat
    const heartbeatAge = state.heartbeat ? now - state.heartbeat : null;
    const activityAge = state.lastActivity ? now - state.lastActivity : null;
    
    // Health thresholds
    const HEARTBEAT_STALE_THRESHOLD = 60_000;  // 1 minute without heartbeat = stale
    const ACTIVITY_WARN_THRESHOLD = 5 * 60_000; // 5 min without activity = warning
    const ZERO_EVENTS_WARN_THRESHOLD = 2 * 60_000; // 2 min with 0 events = warning
    const ZERO_EVENTS_CRITICAL_THRESHOLD = 5 * 60_000; // 5 min with 0 events = critical
    
    // Calculate game duration
    const gameDuration = state.startedAt ? now - state.startedAt : 0;
    
    // Determine health status
    let healthStatus: 'healthy' | 'warning' | 'critical' | 'idle' | 'completed';
    let healthMessage: string;
    
    if (state.status === 'completed') {
      healthStatus = 'completed';
      healthMessage = 'Game completed successfully';
    } else if (state.status === 'failed') {
      healthStatus = 'critical';
      healthMessage = `Game failed: ${state.error || 'Unknown error'}`;
    } else if (state.status === 'idle') {
      healthStatus = 'idle';
      healthMessage = 'No game running';
    } else if (state.status === 'running') {
      // Game is supposed to be running - check various conditions
      
      // Critical: 0 events after 5 minutes - likely stuck on first AI call
      if (this.eventLog.length === 0 && gameDuration > ZERO_EVENTS_CRITICAL_THRESHOLD) {
        healthStatus = 'critical';
        healthMessage = `No events after ${Math.round(gameDuration / 1000)}s - AI provider may be down`;
      }
      // Critical: Heartbeat stale - game process crashed
      else if (heartbeatAge !== null && heartbeatAge > HEARTBEAT_STALE_THRESHOLD) {
        healthStatus = 'critical';
        healthMessage = `Heartbeat stale (${Math.round(heartbeatAge / 1000)}s ago), game may be stuck`;
      }
      // Warning: 0 events after 2 minutes
      else if (this.eventLog.length === 0 && gameDuration > ZERO_EVENTS_WARN_THRESHOLD) {
        healthStatus = 'warning';
        healthMessage = `Waiting for first event (${Math.round(gameDuration / 1000)}s elapsed)`;
      }
      // Warning: No heartbeat yet
      else if (heartbeatAge === null) {
        healthStatus = 'warning';
        healthMessage = 'Game starting, no heartbeat yet';
      }
      // Warning: Long wait for AI
      else if (activityAge && activityAge > ACTIVITY_WARN_THRESHOLD) {
        healthStatus = 'warning';
        healthMessage = `Waiting on AI (last activity ${Math.round(activityAge / 1000)}s ago)`;
      }
      // Healthy
      else {
        healthStatus = 'healthy';
        healthMessage = 'Game running normally';
      }
    } else {
      healthStatus = 'warning';
      healthMessage = `Unknown status: ${state.status}`;
    }
    
    const response = {
      status: state.status,
      healthStatus,
      healthMessage,
      gameId: state.gameId,
      heartbeat: {
        timestamp: state.heartbeat,
        ageMs: heartbeatAge,
        isStale: heartbeatAge !== null && heartbeatAge > HEARTBEAT_STALE_THRESHOLD,
      },
      activity: {
        timestamp: state.lastActivity,
        ageMs: activityAge,
      },
      execution: {
        currentPhase: state.currentPhase,
        currentRound: state.currentRound,
        startedAt: state.startedAt,
        durationMs: state.startedAt ? now - state.startedAt : null,
      },
      eventCount: this.eventLog.length,
      sessionCount: this.sessions.length,
    };
    
    // Return 200 for healthy/warning, 503 for critical
    const httpStatus = healthStatus === 'critical' ? 503 : 200;
    return Response.json(response, { status: httpStatus });
  }

  /**
   * Run the game to completion.
   * Supports resumption from saved state after DO eviction.
   */
  private async runGame(gameId: string, batchId: string, config: GameConfig): Promise<void> {
    const gameLog = this.log.child({ gameId, batchId });
    const startTime = Date.now();
    
    // Start heartbeat to prove game is actively running
    this.startHeartbeat();
    
    // Check if we have a saved game state to resume from (R2 or legacy DO storage)
    const savedGameState = await this.loadSerializedGameState();
    const isResuming = savedGameState !== undefined;
    
    gameLog.info('Game starting', { 
      seed: config.seed,
      playerCount: config.playerCount,
      mafiaCount: config.mafiaCount,
      models: config.teams.map(t => t.modelId).join(','),
      isResuming,
      resumeRound: savedGameState?.round,
      resumePhase: savedGameState?.phase,
    });

    // Load event log from DO storage if resuming (faster than R2)
    if (isResuming) {
      const storedEvents = await this.ctx.storage.get<GameEvent[]>(STORAGE_KEYS.EVENT_LOG);
      if (storedEvents) {
        this.eventLog = storedEvents;
        this.strippedEventLog = storedEvents;
        this.lastR2StreamIndex = storedEvents.length;
        gameLog.info('Loaded event log from DO storage', { eventCount: this.eventLog.length });
      }
    } else {
      // Reset event logs for new game
      this.eventLog = [];
      this.strippedEventLog = [];
    }

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
    let eventCount = this.eventLog.length;

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
      
      // Log phase transitions and update current phase/round tracking
      if (event.type === 'phase_start') {
        gameLog.info('Phase started', { 
          phase: event.phase, 
          round: event.round,
          eventCount,
          discountPricing,
        });
        // Track current phase/round for health monitoring
        await this.saveState({
          currentPhase: event.phase,
          currentRound: event.round,
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
      
      // Add stripped event to DO storage log (avoids SQLITE_TOOBIG with large prompts)
      const strippedEvent = stripEventForStorage(event);
      this.strippedEventLog.push(strippedEvent);
      
      // Persist ONLY the last N events to DO storage to avoid 128KB SQLite limit
      // Full event history is preserved in R2 stream (see streamEventsToR2)
      // This is sufficient for WebSocket sync of late-joining clients
      const eventsToStore = this.strippedEventLog.slice(-GameRunner.MAX_DO_STORAGE_EVENTS);
      await this.ctx.storage.put(STORAGE_KEYS.EVENT_LOG, eventsToStore);

      // Stream to R2 incrementally (every 10 events or on important events)
      // Reduced from 30 to 10 for better persistence
      const shouldStream = 
        this.eventLog.length - this.lastR2StreamIndex >= 10 ||
        event.type === 'elimination' ||
        event.type === 'game_end';
      
      if (shouldStream) {
        try {
          await this.streamEventsToR2(gameId);
          gameLog.debug('Events streamed to R2', { 
            eventCount: this.eventLog.length,
            streamedFrom: this.lastR2StreamIndex,
          });
        } catch (error) {
          // R2 stream failed - log but don't fail the game
          // Events are still in memory and DO storage
          logErrorWithStack(gameLog, 'Failed to stream events to R2', error, {
            eventCount: this.eventLog.length,
          });
        }
      }

      // Broadcast to connected WebSocket clients (with stripped event for large responses)
      this.broadcast({
        type: 'EVENT',
        event: stripEventForStorage(event),
        gameId,
      });
    };

    // Phase checkpoint callback - saves game state to R2 after each phase
    // This allows resumption from the last completed phase after DO eviction
    // Using R2 eliminates the 128KB DO storage limit - no more stripping needed!
    const onPhaseComplete = async (serializedState: SerializedGameState) => {
      gameLog.debug('Phase checkpoint', { 
        phase: serializedState.phase, 
        round: serializedState.round,
        eventCount: serializedState.events.length,
        conversationCount: serializedState.conversationHistory.length,
      });
      
      try {
        // Save FULL state to R2 (no size limits!)
        // This replaces the old 128KB-limited DO storage approach
        await this.saveCheckpoint(serializedState);
        
        // Update health tracking in DO (tiny data, no limit concerns)
        await this.saveState({
          currentPhase: serializedState.phase,
          currentRound: serializedState.round,
          lastActivity: Date.now(),
        });
      } catch (error) {
        // Don't crash the game for a checkpoint save failure
        // Game continues in memory and will be saved on next phase
        logErrorWithStack(gameLog, 'Failed to save checkpoint to R2', error, {
          phase: serializedState.phase,
          round: serializedState.round,
        });
      }
    };

    // Create and run the game with live streaming and checkpointing
    gameLog.info('Creating game instance', { isResuming });
    const game = new Game(config, aiAdapter, {
      gameId,
      onEvent,
      onPhaseComplete,
      // Only include resumeFrom if we have saved state (exactOptionalPropertyTypes compliance)
      ...(savedGameState && { resumeFrom: savedGameState }),
    });
    
    try {
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

      // Persist results to D1/R2 (R2 transcript replaces streaming file)
      gameLog.debug('Persisting results to D1/R2');
      await this.persistResults(result, batchId);

      // Update state
      await this.saveState({
        status: 'completed',
        completedAt: Date.now(),
        currentPhase: null,
        currentRound: null,
      });
      gameLog.info('State saved as completed');

      // Clean up checkpoint data (no longer needed after completion)
      // Keep event log for WebSocket clients that may still be connected
      await Promise.all([
        this.ctx.storage.delete(STORAGE_KEYS.GAME_STATE), // Legacy key
        this.ctx.storage.delete(STORAGE_KEYS.CHECKPOINT_META), // New R2 pointer
      ]);
      gameLog.debug('Cleaned up checkpoint data');

      // Broadcast completion status
      this.broadcast({
        type: 'STATUS',
        status: 'completed',
        gameId,
      });
    } finally {
      // Always stop heartbeat when game ends (success or failure)
      this.stopHeartbeat();
    }
  }

  /**
   * Stream events to R2 incrementally for running games.
   * This provides persistence without DO storage limits.
   * Uses a separate file from the final transcript to avoid conflicts.
   */
  private async streamEventsToR2(gameId: string): Promise<void> {
    const transcripts = this.env.TRANSCRIPTS;
    const streamKey = `games/${gameId}/events-stream.json`;
    
    // Write all events accumulated so far
    const streamData = {
      gameId,
      eventCount: this.eventLog.length,
      events: this.eventLog,
      streamedAt: Date.now(),
    };
    
    await transcripts.put(streamKey, JSON.stringify(streamData), {
      httpMetadata: { contentType: 'application/json' },
    });
    
    this.lastR2StreamIndex = this.eventLog.length;
  }

  /**
   * Load events from R2 stream for running games that resumed after DO hibernation.
   */
  private async loadEventsFromR2Stream(gameId: string): Promise<GameEvent[]> {
    try {
      const streamKey = `games/${gameId}/events-stream.json`;
      const streamObj = await this.env.TRANSCRIPTS.get(streamKey);
      if (streamObj) {
        const data = await streamObj.json() as { events: GameEvent[] };
        return data.events ?? [];
      }
    } catch (error) {
      this.log.warn('Failed to load events from R2 stream', { 
        error: error instanceof Error ? error.message : String(error),
        gameId,
      });
    }
    return [];
  }

  /**
   * Persist game results to D1 and R2.
   * IDEMPOTENT: Uses atomic INSERT ... ON CONFLICT with WHERE clause to prevent double-counting.
   * Uses db.batch() for atomic D1 operations to prevent partial data states.
   * R2 write happens BEFORE D1 to ensure transcript exists if game record exists.
   * 
   * TEST GAMES: Games using test/* models skip D1 persistence to avoid polluting
   * production data. R2 transcript is still written for debugging.
   */
  private async persistResults(result: GameResult, batchId: string): Promise<void> {
    const db = this.env.DB;
    const transcripts = this.env.TRANSCRIPTS;
    
    // Get current state to retrieve traceId
    const state = await this.loadState();
    const traceId = state.traceId;

    // Calculate cost using per-model pricing
    const modelIds = result.participants.map(p => p.modelId);
    const costUsd = calculateGameCost(modelIds, result.tokenUsage.total);
    
    // Check if this is a test game (using mock models)
    // Skip D1 persistence for test games to avoid polluting leaderboard/stats
    const isTestGame = modelIds.some(id => isTestModel(id));
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

    // Clean up the incremental stream file (no longer needed after final transcript)
    try {
      await transcripts.delete(`games/${result.id}/events-stream.json`);
    } catch {
      // Ignore cleanup errors - stream file may not exist
    }

    // Skip D1 persistence for test games to avoid polluting production data
    if (isTestGame) {
      this.log.info('Skipping D1 persistence for test game', { 
        gameId: result.id, 
        testModels: modelIds.filter(id => isTestModel(id)).join(','),
      });
      console.log(`[${traceId || 'no-trace'}] Test game ${result.id} completed - skipping D1 persistence`);
      return;
    }

    // 2. ATOMIC idempotency check: Update game to 'completed' only if not already completed
    // This prevents race conditions where two processes might try to complete the same game
    const updateResult = await db.prepare(`
      UPDATE games 
      SET winner = ?, rounds = ?, duration_ms = ?, total_tokens = ?, status = 'completed',
          persona_theme = ?, trace_id = COALESCE(?, trace_id)
      WHERE id = ? AND status != 'completed'
    `).bind(
      result.winner,
      result.rounds,
      result.durationMs,
      result.tokenUsage.total,
      result.config.personaTheme ?? 'noir',
      traceId ?? null,
      result.id
    ).run();

    // If no rows were updated, the game was already completed - skip leaderboard updates
    if (updateResult.meta.changes === 0) {
      // Check if game exists but was already completed, or doesn't exist at all
      const existing = await db.prepare('SELECT status FROM games WHERE id = ?').bind(result.id).first<{ status: string }>();
      if (existing?.status === 'completed') {
        console.log(`[${traceId || 'no-trace'}] Game ${result.id} already completed, skipping to avoid double-counting`);
        return;
      }
      // Game doesn't exist - insert it fresh (shouldn't happen in normal flow but handle gracefully)
    }

    // 3. Build remaining D1 statements for batch execution
    const statements: D1PreparedStatement[] = [];

    // Insert game record if it doesn't exist (for edge case where UPDATE didn't find a row)
    // This is a no-op if the row already exists from insertRunningGame or the UPDATE above
    statements.push(
      db.prepare(
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, seed, persona_theme, trace_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO NOTHING`
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

    // Update leaderboard for each participant (only reached if game wasn't already completed)
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

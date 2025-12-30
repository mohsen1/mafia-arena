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
import { createProvidersForGame, type CompletionResponse, type RuntimeAPIKeys } from './ai/index.js';
import { isTestModel } from './ai/providers/MockE2EProvider.js';
import { generateSeed } from '../engine/utils/random.js';
import { getGameStateFromKV } from './utils/workflow-sync.js';

// =============================================================================
// DEPRECATED: Legacy Suspense Pattern Types
// These types are kept only for backwards compatibility with legacy code paths.
// New games should use MafiaWorkflow instead of GameRunner for game execution.
// GameRunner should only be used for WebSocket broadcasting.
// =============================================================================

/** @deprecated Use MafiaWorkflow instead */
interface CachedAIResponse {
  response?: CompletionResponse;
  error?: string;
  isFatal?: boolean;
  timestamp: number;
}

/** @deprecated Use MafiaWorkflow instead - this error should never be thrown in the new architecture */
class SuspenseError extends Error {
  readonly name = 'SuspenseError';
  readonly requestId: string;
  readonly modelId: string;
  readonly context: {
    gameId: string;
    round: number;
    phase: string;
    playerId: string;
    actionType: string;
  };

  constructor(message: string) {
    super(message);
    this.requestId = '';
    this.modelId = '';
    this.context = { gameId: '', round: 0, phase: '', playerId: '', actionType: '' };
  }
}

/** @deprecated Use WorkflowAIProvider instead */
class GameAIAdapter {
  constructor(_providers: Map<string, unknown>, _options?: unknown) {
    // Constructor only - throws at runtime if used
  }

  async getAction(): Promise<never> {
    throw new Error('GameAIAdapter is deprecated. Use WorkflowAIProvider with MafiaWorkflow instead.');
  }
}
import { calculateExactCost, type ModelPricing } from './utils/budget.js';
import { parsePricingFromConfig, DEFAULT_PRICING } from './ai/models.js';
import { createLogger, logErrorWithStack, type Logger } from './utils/logger.js';
import { decryptKey, validateEncryptionSecret } from './utils/crypto.js';
import { PROVIDER_TO_ENV_KEY } from './routes/keys.js';

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
  /** @deprecated Use CHECKPOINT_META instead - kept for migration cleanup */
  GAME_STATE: 'gameState',
  /** Active heartbeat timestamp - proves game is actively running */
  HEARTBEAT: 'heartbeat',
  /** Current phase being executed (for debugging stuck games) */
  CURRENT_PHASE: 'currentPhase',
  /** Current round being executed */
  CURRENT_ROUND: 'currentRound',
  /** R2 checkpoint pointer - replaces GAME_STATE to avoid 128KB limit */
  CHECKPOINT_META: 'checkpointMeta',
  /** Cached AI responses from queue worker (for suspense pattern) */
  AI_RESPONSES: 'aiResponses',
  /** Reason game is suspended (waiting for AI) - helps debug stuck games */
  SUSPENSE_REASON: 'suspenseReason',
  /** When game started waiting for current AI call (for per-call timeout) */
  SUSPENSE_STARTED_AT: 'suspenseStartedAt',
  /** Persistent event count (survives DO restart, used by health check) */
  PERSISTED_EVENT_COUNT: 'persistedEventCount',
  /** Encrypted user API keys - persisted to survive DO eviction */
  USER_KEYS_ENCRYPTED: 'userKeysEncrypted',
} as const;

/**
 * Encrypted user API keys stored in DO storage.
 * Keys are stored encrypted to persist across DO eviction/hibernation.
 */
interface EncryptedUserKeys {
  [provider: string]: {
    encrypted: string;
    iv: string;
  };
}

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
 * Max events to keep in memory for WebSocket streaming.
 * Full event log is persisted to R2. This cap prevents hitting the 128MB DO memory limit.
 * 500 events * ~5KB average = ~2.5MB which is safe.
 */
const MAX_IN_MEMORY_EVENTS = 500;

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
  /** Reason game is suspended - helps identify which model/player is blocking */
  suspenseReason: string | null;
  /** When game started waiting for current AI call (for per-call timeout) */
  suspenseStartedAt: number | null;
  /** Persistent event count for health checks (survives DO restart) */
  persistedEventCount: number;
}

/** WebSocket message types for live streaming */
interface WsMessage {
  type: 'SYNC' | 'EVENT' | 'STATUS' | 'ERROR' | 'PROGRESS';
  events?: GameEvent[] | undefined;
  event?: GameEvent | undefined;
  status?: GameRunnerState['status'] | undefined;
  error?: string | undefined;
  gameId?: string | undefined;
  /** Game start timestamp (ms since epoch) */
  startedAt?: number | undefined;
  /** Duration in ms for failed/completed games */
  durationMs?: number | undefined;
  /** Current suspense reason - which model/player game is waiting for */
  suspenseReason?: string | null | undefined;
  /** When game started waiting for current AI call */
  suspenseStartedAt?: number | null | undefined;
  /** AI progress info for UI */
  aiProgress?: {
    cachedResponses: number;
    expectedPlayers: number | null;
    progressText: string;
  } | undefined;
  /** Current round (for PROGRESS messages) */
  round?: number | undefined;
  /** Current phase (for PROGRESS messages) */
  phase?: string | undefined;
  /** Progress information for UI */
  progress?: {
    current: number;
    total: number;
    label: string;
    pendingPlayers: string[];
  } | undefined;
  /** What we're actively waiting for */
  waitingFor?: {
    playerName: string;
    modelId: string;
    actionType: string;
  } | null | undefined;
}

export class GameRunner extends DurableObject<Env> {
  private stateCache: GameRunnerState | null = null;
  
  /** Connected WebSocket clients for live streaming */
  private sessions: WebSocket[] = [];
  
  /** In-memory event log for live streaming (full events with prompts for R2 transcript) */
  private eventLog: GameEvent[] = [];
  
  /** Index of last event streamed to R2 (for incremental streaming) */
  private lastR2StreamIndex: number = 0;
  
  /** Timestamp of last R2 stream (for throttling to prevent rate limits) */
  private lastR2StreamTime: number = 0;

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
  
  /** 
   * Decrypted user-provided API keys (in-memory cache).
   * Populated from encrypted storage on demand.
   */
  private userApiKeysCache: RuntimeAPIKeys | undefined;

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
            // ZOMBIE PREVENTION: Check if game was already marked failed/completed in D1
            // This can happen if the cleanup cron ran while we were hibernating
            // Wrapped in try-catch for graceful D1 failure handling
            try {
              const existingGame = await this.env.DB.prepare(
                'SELECT status FROM games WHERE id = ?'
              ).bind(state.gameId).first<{ status: string }>();
              
              if (existingGame?.status === 'failed' || existingGame?.status === 'completed') {
                this.log.warn('Game already finalized in D1, not resuming (zombie prevention)', {
                  gameId: state.gameId,
                  d1Status: existingGame.status,
                });
                // Update local state to match D1
                await this.saveState({
                  status: existingGame.status as 'failed' | 'completed',
                  completedAt: Date.now(),
                  error: existingGame.status === 'failed' ? 'Game was marked failed by cleanup' : null,
                });
                return; // Don't resume
              }
            } catch (d1Error) {
              // D1 unavailable - log but proceed with resume attempt
              // Better to risk a zombie than leave game stuck
              this.log.warn('D1 check failed during resume, proceeding anyway', {
                gameId: state.gameId,
                error: d1Error instanceof Error ? d1Error.message : String(d1Error),
              });
            }
            
            this.log.info('Resuming interrupted game', { 
              gameId: state.gameId,
              discountPricing: state.discountPricing,
              lastActive: new Date(lastActive).toISOString(),
            });
            const gameConfig = this.toGameConfig(config, state.seed || 0);
            
            // Ensure D1 record exists (may have been lost if original insert failed)
            // This is idempotent - uses ON CONFLICT DO UPDATE
            // Note: Test games also persist to D1 for E2E test verification
            await this.insertRunningGame(
              state.gameId, 
              state.batchId, 
              gameConfig, 
              state.startedAt,
              state.traceId ?? undefined,
              state.discountPricing ?? false
            );
            
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
    
    const [status, gameId, batchId, startedAt, completedAt, error, seed, traceId, discountPricing, lastActivity, heartbeat, currentPhase, currentRound, suspenseReason, suspenseStartedAt, persistedEventCount] = await Promise.all([
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
      storage.get<string>(STORAGE_KEYS.SUSPENSE_REASON),
      storage.get<number>(STORAGE_KEYS.SUSPENSE_STARTED_AT),
      storage.get<number>(STORAGE_KEYS.PERSISTED_EVENT_COUNT),
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
      suspenseReason: suspenseReason ?? null,
      suspenseStartedAt: suspenseStartedAt ?? null,
      persistedEventCount: persistedEventCount ?? 0,
    };

    return this.stateCache;
  }

  /**
   * Get decrypted user API keys from storage.
   * Keys are stored encrypted and decrypted on-demand for provider creation.
   * Returns undefined if no user keys are stored.
   * Throws an error if keys exist but cannot be decrypted (prevents silent fallback to system keys).
   */
  private async getDecryptedUserKeys(): Promise<RuntimeAPIKeys | undefined> {
    // Return cached keys if available
    if (this.userApiKeysCache) {
      return this.userApiKeysCache;
    }

    // Load encrypted keys from storage
    const encryptedKeys = await this.ctx.storage.get<EncryptedUserKeys>(STORAGE_KEYS.USER_KEYS_ENCRYPTED);
    if (!encryptedKeys || Object.keys(encryptedKeys).length === 0) {
      return undefined;
    }

    // Keys exist in storage - encryption secret MUST be configured
    // If not, throw error to prevent silent fallback to system keys (billing leak)
    if (!validateEncryptionSecret(this.env.ENCRYPTION_SECRET)) {
      const errorMsg = 'User API keys stored but ENCRYPTION_SECRET not configured. Cannot decrypt.';
      this.log.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Decrypt all keys
    const decryptedKeys: RuntimeAPIKeys = {};
    const failedProviders: string[] = [];
    
    for (const [provider, keyData] of Object.entries(encryptedKeys)) {
      try {
        const decrypted = await decryptKey(
          keyData.encrypted,
          keyData.iv,
          this.env.ENCRYPTION_SECRET!
        );
        const envKeyName = PROVIDER_TO_ENV_KEY[provider];
        if (envKeyName) {
          (decryptedKeys as Record<string, string>)[envKeyName] = decrypted;
        }
      } catch (error) {
        this.log.error(`Failed to decrypt ${provider} key`, { 
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        failedProviders.push(provider);
      }
    }

    // If ALL keys failed to decrypt, throw error (likely secret rotation issue)
    if (failedProviders.length === Object.keys(encryptedKeys).length) {
      const errorMsg = `All user API keys failed to decrypt (providers: ${failedProviders.join(', ')}). ` +
        'This may indicate the ENCRYPTION_SECRET was rotated. User must re-add their keys.';
      this.log.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Cache and return if we got any keys
    if (Object.keys(decryptedKeys).length > 0) {
      this.userApiKeysCache = decryptedKeys;
      return decryptedKeys;
    }

    return undefined;
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
    if (state.suspenseReason !== undefined) {
      if (state.suspenseReason === null) {
        updates.push(storage.delete(STORAGE_KEYS.SUSPENSE_REASON).then(() => {}));
      } else {
        updates.push(storage.put(STORAGE_KEYS.SUSPENSE_REASON, state.suspenseReason));
      }
      if (this.stateCache) this.stateCache.suspenseReason = state.suspenseReason;
    }
    if (state.suspenseStartedAt !== undefined) {
      if (state.suspenseStartedAt === null) {
        updates.push(storage.delete(STORAGE_KEYS.SUSPENSE_STARTED_AT).then(() => {}));
      } else {
        updates.push(storage.put(STORAGE_KEYS.SUSPENSE_STARTED_AT, state.suspenseStartedAt));
      }
      if (this.stateCache) this.stateCache.suspenseStartedAt = state.suspenseStartedAt;
    }
    if (state.persistedEventCount !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.PERSISTED_EVENT_COUNT, state.persistedEventCount));
      if (this.stateCache) this.stateCache.persistedEventCount = state.persistedEventCount;
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
   * 
   * OPTIMIZATION: Optionally prunes old AI responses from the suspense cache.
   * Once we checkpoint to R2, we don't need responses from previous rounds
   * since resume will load from the R2 checkpoint, not replay from scratch.
   * 
   * @param pruneResponses - If true, prune AI responses from previous phases.
   *                         Should only be true when called from onPhaseComplete,
   *                         NOT when called from SuspenseError catch (we still need them!)
   */
  private async saveCheckpoint(state: SerializedGameState, pruneResponses = false): Promise<void> {
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
    
    // 4. Optionally prune old AI responses from suspense cache
    // Only prune when a phase COMPLETES (not on suspend, where we still need responses!)
    if (pruneResponses) {
      await this.pruneOldAIResponses(state.round, state.phase);
    }
    
    this.log.debug('Checkpoint saved to R2', { 
      r2Key, 
      round: state.round, 
      phase: state.phase,
      estimatedBytes: JSON.stringify(state).length,
    });
  }
  
  /**
   * Clear ALL cached AI responses after a phase completes.
   * 
   * When a phase completes successfully, all AI responses for that phase
   * have been consumed and are now part of the R2 checkpoint. We can
   * safely clear the cache to free up DO storage space.
   * 
   * Note: Request IDs are hashes (req_HASH), not the raw format, so we
   * can't selectively prune by round/phase. But that's fine - on phase
   * complete, ALL responses are stale anyway.
   */
  private async pruneOldAIResponses(currentRound: number, currentPhase: string): Promise<void> {
    const responses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES);
    if (!responses || responses.size === 0) return;
    
    const originalSize = responses.size;
    
    // Clear ALL responses - they've been consumed for the completed phase
    await this.ctx.storage.delete(STORAGE_KEYS.AI_RESPONSES);
    
    this.log.debug('Cleared AI response cache after phase complete', {
      clearedCount: originalSize,
      completedRound: currentRound,
      completedPhase: currentPhase,
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

        // Internal callback from AI queue worker (suspense pattern)
        case '/internal/ai-callback':
          return await this.handleAICallback(request);

        // Internal punt endpoint for scheduled cleanup (re-trigger stuck games)
        case '/punt':
          return await this.handlePunt();

        // Admin endpoint to resume a failed game
        case '/resume':
          return await this.handleResume();

        // Internal broadcast endpoint from MafiaWorkflow
        case '/internal/broadcast':
          return await this.handleBroadcast(request);

        // Internal progress update endpoint from MafiaWorkflow
        case '/internal/progress':
          return await this.handleProgressUpdate(request);

        default:
          this.log.warn('Unknown path', { path: url.pathname });
          return new Response('Not found', { status: 404 });
      }
    } catch (error) {
      logErrorWithStack(this.log, 'Request handler error', error, { path: url.pathname });
      throw error;
    }
  }

  /** Tracks if a game resume is already in progress (prevents callback storms) */
  private isResuming = false;
  
  /** 
   * Dirty flag: Set when new AI responses arrive while a resume is in progress.
   * When the current resume finishes, if dirty=true, we restart immediately.
   * This ensures no callbacks are lost even if they arrive during an active resume.
   */
  private resumeDirty = false;
  
  /** Debounce interval for game resumes (ms) - prevents rapid-fire callbacks from creating storms */
  private static readonly RESUME_DEBOUNCE_MS = 500;
  
  /** Last resume timestamp for debouncing */
  private lastResumeTime = 0;

  /**
   * Handle AI response callback from queue worker (suspense pattern).
   * 
   * This is called when the queue worker finishes an AI request.
   * We store the response in DO storage, then resume the game.
   * 
   * IMPORTANT: Multiple callbacks may arrive simultaneously (7 players = 7 callbacks).
   * We use debouncing to prevent callback storms that cause:
   * - R2 rate limiting
   * - DO memory overflow
   * - Duplicated work
   */
  private async handleAICallback(request: Request): Promise<Response> {
    try {
      const body = await request.json() as {
        requestId: string;
        response?: CompletionResponse;
        error?: string;
        /** Whether this is a fatal/permanent error (e.g., 404 invalid model) */
        isFatal?: boolean;
      };

      const { requestId, response, error, isFatal } = body;
      this.log.info('Received AI callback', { requestId, hasResponse: !!response, hasError: !!error, isFatal });

      if (error) {
        // AI call failed - store the error in cache so the game can handle it on resume
        this.log.error('AI callback received error', { requestId, error, isFatal });
        
        // Store error in DO storage so adapter sees it on resume
        const responses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES) ?? new Map();
        responses.set(requestId, { 
          error,
          isFatal: isFatal ?? false,
          timestamp: Date.now(),
        });
        await this.ctx.storage.put(STORAGE_KEYS.AI_RESPONSES, responses);
        this.log.debug('Cached AI error', { requestId, isFatal, cacheSize: responses.size });
        
        // Update lastActivity to prevent stale detection
        await this.saveState({ lastActivity: Date.now() });
        
        // Trigger resume so game wakes up and handles the error
        const state = await this.loadState();
        if (state.status === 'running' && state.gameId && state.batchId) {
          const config = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
          if (config && !this.isResuming) {
            this.isResuming = true;
            this.lastResumeTime = Date.now();
            const gameConfig = this.toGameConfig(config, state.seed || 0);
            
            this.ctx.waitUntil(
              this.runGameWithErrorHandling(state.gameId, state.batchId, gameConfig)
                .finally(() => { this.isResuming = false; })
            );
            this.log.info('Triggered resume to handle AI error', { gameId: state.gameId, requestId });
          }
        }
        
        return Response.json({ success: true, requestId, errorStored: true });
      }

      if (!response) {
        return Response.json({ success: false, error: 'Missing response' }, { status: 400 });
      }

      // 1. Store the response in DO storage (always do this)
      const responses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES) ?? new Map();
      responses.set(requestId, { response, timestamp: Date.now() });
      await this.ctx.storage.put(STORAGE_KEYS.AI_RESPONSES, responses);
      this.log.debug('Cached AI response', { requestId, cacheSize: responses.size });

      // 2. Update lastActivity to prevent stale detection
      await this.saveState({ lastActivity: Date.now() });

      // 3. DIRTY FLAG PATTERN: Ensure no callbacks are lost
      // If already resuming, set dirty flag so we retry after current resume finishes
      if (this.isResuming) {
        this.resumeDirty = true;
        this.log.debug('Set dirty flag - resume already in progress', { requestId });
        return Response.json({ success: true, requestId, skipped: 'already_resuming', dirty: true });
      }
      
      // Debounce rapid callbacks (but dirty flag will catch up)
      const now = Date.now();
      const timeSinceLastResume = now - this.lastResumeTime;
      if (timeSinceLastResume < GameRunner.RESUME_DEBOUNCE_MS) {
        this.resumeDirty = true;
        this.log.debug('Set dirty flag - debouncing', { requestId, timeSinceLastResume });
        return Response.json({ success: true, requestId, skipped: 'debounced', dirty: true });
      }

      // 4. Resume the game (in background) with dirty flag check on completion
      const state = await this.loadState();
      if (state.status === 'running' && state.gameId && state.batchId) {
        const config = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
        if (config) {
          this.isResuming = true;
          this.resumeDirty = false; // Clear dirty flag before starting
          this.lastResumeTime = now;
          
          const gameConfig = this.toGameConfig(config, state.seed || 0);
          // Resume game in background, check dirty flag when done
          this.ctx.waitUntil(
            this.runGameWithErrorHandling(state.gameId, state.batchId, gameConfig)
              .finally(() => {
                this.isResuming = false;
                // If dirty flag was set during execution, trigger another resume
                if (this.resumeDirty) {
                  this.log.info('Dirty flag set - triggering follow-up resume');
                  this.resumeDirty = false;
                  // Re-trigger resume via waitUntil (async)
                  this.ctx.waitUntil(this.triggerResumeIfNeeded());
                }
              })
          );
          this.log.info('Game resume triggered', { gameId: state.gameId, cacheSize: responses.size });
        }
      }

      return Response.json({ success: true, requestId });
    } catch (error) {
      logErrorWithStack(this.log, 'Failed to handle AI callback', error);
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  }

  /**
   * Helper to trigger a resume if the game is still running.
   * Used by the dirty flag pattern when callbacks arrive during an active resume.
   */
  private async triggerResumeIfNeeded(): Promise<void> {
    if (this.isResuming) {
      // Another resume started in the meantime, set dirty flag
      this.resumeDirty = true;
      return;
    }
    
    const state = await this.loadState();
    if (state.status !== 'running' || !state.gameId || !state.batchId) {
      return;
    }
    
    const config = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
    if (!config) return;
    
    this.isResuming = true;
    this.resumeDirty = false;
    this.lastResumeTime = Date.now();
    
    const gameConfig = this.toGameConfig(config, state.seed || 0);
    
    try {
      await this.runGameWithErrorHandling(state.gameId, state.batchId, gameConfig);
    } finally {
      this.isResuming = false;
      // Check dirty flag again
      if (this.resumeDirty) {
        this.log.info('Dirty flag set again - triggering another resume');
        this.resumeDirty = false;
        this.ctx.waitUntil(this.triggerResumeIfNeeded());
      }
    }
  }

  /**
   * Handle punt request from scheduled cleanup (re-trigger stuck games).
   * 
   * This is the "Active Punt" mechanism recommended by Gemini:
   * Instead of immediately killing stuck games, we try to resume them.
   * If there are cached AI responses that weren't processed, we can recover.
   */
  private async handlePunt(): Promise<Response> {
    try {
      const state = await this.loadState();
      
      // Only punt running games
      if (state.status !== 'running') {
        return Response.json({ 
          punted: false, 
          reason: `Not running (status: ${state.status})` 
        });
      }
      
      // Check if there are cached AI responses
      const responses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES);
      const cachedCount = responses?.size ?? 0;
      
      this.log.info('Punt request received', { 
        gameId: state.gameId, 
        cachedResponses: cachedCount,
        lastActivity: state.lastActivity,
        currentPhase: state.currentPhase,
      });
      
      // If already resuming, skip
      if (this.isResuming) {
        return Response.json({ 
          punted: false, 
          reason: 'Already resuming' 
        });
      }
      
      // Get config to attempt resume
      const config = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
      if (!config || !state.gameId || !state.batchId) {
        return Response.json({ 
          punted: false, 
          reason: 'Missing config or game identifiers' 
        });
      }
      
      // Attempt to resume the game
      const now = Date.now();
      this.isResuming = true;
      this.lastResumeTime = now;
      
      const gameConfig = this.toGameConfig(config, state.seed || 0);
      
      // Resume game in background
      this.ctx.waitUntil(
        this.runGameWithErrorHandling(state.gameId, state.batchId, gameConfig)
          .finally(() => {
            this.isResuming = false;
          })
      );
      
      this.log.info('Game punted - resume triggered', { 
        gameId: state.gameId, 
        cachedResponses: cachedCount 
      });
      
      return Response.json({ 
        punted: true, 
        reason: `Resume triggered with ${cachedCount} cached responses`,
        cachedResponses: cachedCount,
      });
      
    } catch (error) {
      logErrorWithStack(this.log, 'Failed to handle punt', error);
      return Response.json(
        { punted: false, reason: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  }

  /**
   * Admin endpoint to resume a failed game.
   * Unlike handlePunt, this explicitly allows resuming games marked as 'failed'.
   * The game will resume from the last R2 checkpoint.
   */
  private async handleResume(): Promise<Response> {
    try {
      const state = await this.loadState();
      
      // Allow resuming 'failed' games (primary use case) or 'running' games (stuck)
      if (state.status === 'idle') {
        return Response.json({ 
          success: false, 
          reason: 'Game is idle/not initialized' 
        }, { status: 400 });
      }
      
      if (state.status === 'completed') {
        return Response.json({ 
          success: false, 
          reason: 'Game is already completed' 
        }, { status: 400 });
      }
      
      // Get config to attempt resume
      const config = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
      if (!config || !state.gameId || !state.batchId) {
        return Response.json({ 
          success: false, 
          reason: 'Missing config or game identifiers' 
        }, { status: 500 });
      }

      this.log.info('Manual resume requested', { 
        gameId: state.gameId, 
        previousStatus: state.status,
        previousError: state.error 
      });

      // Reset state to running (clears error)
      await this.saveState({
        status: 'running',
        error: null,
        lastActivity: Date.now(),
        heartbeat: Date.now()
      });

      // Update D1 to reflect running state
      await this.updateGameStatus(state.gameId, 'running', undefined);

      // Prevent concurrent execution if it was somehow already running
      if (this.isResuming) {
        return Response.json({ 
          success: true, 
          message: 'Resume already in progress',
          gameId: state.gameId 
        });
      }

      this.isResuming = true;
      this.lastResumeTime = Date.now();
      
      const gameConfig = this.toGameConfig(config, state.seed || 0);

      // Trigger execution in background
      this.ctx.waitUntil(
        this.runGameWithErrorHandling(state.gameId, state.batchId, gameConfig)
          .finally(() => {
            this.isResuming = false;
          })
      );

      return Response.json({ 
        success: true, 
        message: 'Game resumed from last checkpoint',
        gameId: state.gameId,
        previousStatus: state.status,
        previousError: state.error,
      });

    } catch (error) {
      logErrorWithStack(this.log, 'Failed to resume game', error);
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  }

  /**
   * Get cached AI response from DO storage (for suspense pattern).
   * This is passed to GameAIAdapter as the checkCache function.
   */
  private async getCachedAIResponse(requestId: string): Promise<CachedAIResponse | undefined> {
    const responses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES);
    return responses?.get(requestId);
  }

  /**
   * @deprecated Queue-based AI requests are no longer supported.
   * Use MafiaWorkflow with WorkflowAIProvider instead.
   * This method is kept for backwards compatibility but will throw an error.
   */
  private async queueAIRequest(message: import('./ai/index.js').AIRequestMessage): Promise<void> {
    // Log a warning but don't throw - the game will fail gracefully via SuspenseError timeout
    this.log.error('queueAIRequest called but AI_REQUEST_QUEUE is deprecated', {
      requestId: message.requestId,
      modelId: message.modelId,
      gameId: message.gameId,
    });
    throw new Error('AI_REQUEST_QUEUE is deprecated. Use MafiaWorkflow with WorkflowAIProvider instead.');
  }

  /**
   * Handle WebSocket upgrade for live game streaming.
   */
  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    const url = new URL(request.url);
    // gameId is passed in query string for workflow-based games (where DO might not have state yet)
    const gameIdFromUrl = url.searchParams.get('gameId');
    
    this.log.info('WebSocket upgrade request', { 
      upgradeHeader, 
      sessionCount: this.sessions.length,
      gameIdFromUrl,
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

    // Load stored state to check gameId (may be null for fresh workflow games)
    const state = await this.loadState();
    // Prefer stored gameId, fall back to URL param (needed for workflow games before first broadcast)
    const effectiveGameId = state.gameId || gameIdFromUrl;

    // Load event log from R2 stream if not already loaded (for DO hibernation recovery)
    if (this.eventLog.length === 0 && effectiveGameId && state.status === 'running') {
      const streamedEvents = await this.loadEventsFromR2Stream(effectiveGameId);
      if (streamedEvents.length > 0) {
        this.eventLog = streamedEvents;
        this.lastR2StreamIndex = streamedEvents.length;
        this.log.debug('Loaded events from R2 stream', { eventCount: this.eventLog.length });
      }
    }

    // Send current state and event history to new client
    // Check if we have a lastSyncMessage from workflow (workflow mode)
    if (this.lastSyncMessage) {
      server.send(JSON.stringify(this.lastSyncMessage));
      this.log.info('Sent cached SYNC from workflow', {
        type: this.lastSyncMessage.type,
        status: this.lastSyncMessage.status,
        eventCount: this.lastSyncMessage.events?.length ?? 0,
      });
    } else {
      // Try to get workflow state from KV (for workflow-based games)
      // Use effectiveGameId to support games before DO has received any broadcast
      const kvState = effectiveGameId ? await getGameStateFromKV(this.env, effectiveGameId) : null;
      
      if (kvState && kvState.status !== 'completed' && kvState.status !== 'failed') {
        // Workflow mode - work directly with serialized state (avoid deserializing)
        const events = kvState.state.events;
        const syncMessage: WsMessage = {
          type: 'SYNC',
          events: events.slice(-50), // Last 50 events
          status: kvState.status,
          gameId: effectiveGameId ?? undefined,
          startedAt: events.length > 0 
            ? events[0]?.timestamp 
            : undefined,
        };
        // Cache for subsequent connections in same wake cycle
        this.lastSyncMessage = syncMessage;
        server.send(JSON.stringify(syncMessage));
        this.log.info('Sent SYNC from KV state', { 
          eventCount: events.length, 
          status: kvState.status,
          gameId: effectiveGameId ?? 'unknown',
          phase: kvState.currentPhase,
        });
      } else {
        // Legacy DO mode or no KV state yet - use eventLog and local state
        // For new workflow games, events may be empty (game just started, no KV sync yet)
        const syncMessage: WsMessage = {
          type: 'SYNC',
          events: this.eventLog,
          status: kvState?.status || state.status || 'running',
          gameId: effectiveGameId ?? undefined,
          startedAt: state.startedAt ?? undefined,
          error: state.error ?? undefined,
          durationMs: state.startedAt && state.completedAt 
            ? state.completedAt - state.startedAt 
            : undefined,
        };
        server.send(JSON.stringify(syncMessage));
        this.log.info('Sent SYNC message', { 
          eventCount: this.eventLog.length, 
          status: syncMessage.status,
          gameId: effectiveGameId ?? 'unknown',
          hasError: !!state.error,
          source: 'legacy/empty',
        });
      }
    }

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

  /** Last sync message for late-joining WebSocket clients (workflow mode) */
  private lastSyncMessage: WsMessage | null = null;

  /**
   * Handle broadcast from MafiaWorkflow.
   * Receives state updates from the workflow and broadcasts to WebSocket clients.
   * 
   * HIBERNATION FIX: Persists gameId to storage so DO can recover identity
   * after hibernation and query KV for game state.
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    try {
      const message = await request.json<WsMessage>();
      
      // Store for late joiners (in-memory cache)
      this.lastSyncMessage = message;
      
      // CRITICAL: Persist identity to storage for hibernation recovery
      // Without this, waking up from hibernation results in null gameId,
      // causing handleWebSocket to fail its KV lookup.
      if (message.gameId) {
        const currentState = await this.loadState();
        
        // Only write if gameId changed or status changed (avoid unnecessary writes)
        if (currentState.gameId !== message.gameId || 
            (message.status && currentState.status !== message.status)) {
          await this.saveState({
            gameId: message.gameId,
            status: message.status ?? 'running',
            lastActivity: Date.now(),
            heartbeat: Date.now(),
          });
          this.log.debug('Persisted identity for hibernation recovery', {
            gameId: message.gameId,
            status: message.status,
          });
        }
      }
      
      // Broadcast to all connected clients
      this.broadcast(message);
      
      this.log.debug('Broadcast from workflow', { 
        type: message.type, 
        status: message.status,
        sessionCount: this.sessions.length,
      });
      
      return new Response('OK', { status: 200 });
    } catch (error) {
      this.log.error('Failed to handle broadcast', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return new Response('Bad Request', { status: 400 });
    }
  }

  /**
   * Handle progress update from MafiaWorkflow.
   * This is called more frequently than broadcast (before/after each AI action)
   * to provide real-time "Waiting for X" status to connected clients.
   * 
   * Unlike broadcast, this is a lightweight update that doesn't persist full state.
   */
  private async handleProgressUpdate(request: Request): Promise<Response> {
    try {
      const data = await request.json<{
        gameId: string;
        phase: string;
        round: number;
        progress: {
          current: number;
          total: number;
          label: string;
          pendingPlayers: string[];
        };
        waitingFor?: {
          playerName: string;
          modelId: string;
          actionType: string;
        } | null;
        timestamp: number;
      }>();
      
      // Store in DO storage for late-joining clients (no rate limit)
      await this.ctx.storage.put('progress', data);
      
      // Broadcast to all connected WebSocket clients
      const message: WsMessage = {
        type: 'PROGRESS',
        gameId: data.gameId,
        status: 'running',
        round: data.round,
        phase: data.phase,
        progress: data.progress,
        waitingFor: data.waitingFor,
      };
      
      this.broadcast(message);
      
      this.log.debug('Progress update broadcast', { 
        phase: data.phase,
        progress: data.progress.label,
        waitingFor: data.waitingFor?.playerName,
        sessionCount: this.sessions.length,
      });
      
      return new Response('OK', { status: 200 });
    } catch (error) {
      this.log.error('Failed to handle progress update', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return new Response('Bad Request', { status: 400 });
    }
  }

  /**
   * Get current events (for polling fallback).
   * For completed games, serves full data from R2 transcript.
   * For running games, serves from DO storage, KV, or R2 stream fallback.
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
    
    // For idle state, check KV for workflow state (workflow-based games after DO hibernation)
    if (state.status === 'idle' && state.gameId) {
      const kvState = await getGameStateFromKV(this.env, state.gameId);
      if (kvState) {
        // Work directly with serialized state - avoid deserializing
        const events = kvState.state.events;
        // Cache events in memory for subsequent requests (spread to make mutable copy)
        this.eventLog = [...events];
        return Response.json({
          status: kvState.status,
          gameId: state.gameId,
          eventCount: events.length,
          events: events.slice(-50), // Last 50 events for size
          startedAt: events.length > 0 
            ? events[0]?.timestamp 
            : undefined,
        });
      }
    }
    
    // For running games, load events from R2 stream if not already in memory
    if (this.eventLog.length === 0 && state.gameId && state.status === 'running') {
      const streamedEvents = await this.loadEventsFromR2Stream(state.gameId);
      if (streamedEvents.length > 0) {
        this.eventLog = streamedEvents;
        this.lastR2StreamIndex = streamedEvents.length;
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
        /** Encrypted user API keys (optional - uses system keys if not provided) */
        encryptedUserKeys?: EncryptedUserKeys;
      };

      const { gameId, batchId, config, background = false, traceId, encryptedUserKeys } = body;
      
      // Store encrypted user API keys in DO storage (persists across eviction)
      if (encryptedUserKeys && Object.keys(encryptedUserKeys).length > 0) {
        await this.ctx.storage.put(STORAGE_KEYS.USER_KEYS_ENCRYPTED, encryptedUserKeys);
        this.log.debug('Stored encrypted user keys', { providers: Object.keys(encryptedUserKeys).join(',') });
      }
      
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

      // Reset event log (events are streamed to R2 for persistence)
      this.eventLog = [];
      this.lastR2StreamIndex = 0;

      // Insert 'running' record into D1 immediately so game appears in lists
      // Note: Test games (test/*) also persist to D1 for E2E test verification
      const modelIds = config.teams.map(t => t.modelId);
      const isTestGame = modelIds.some(id => isTestModel(id));
      await this.insertRunningGame(gameId, batchId, gameConfig, startedAt, traceId);
      if (isTestGame) {
        gameLog.debug('Test game inserted into D1', { testModels: modelIds.filter(id => isTestModel(id)).join(',') });
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
   * - Zombie games (running status but no activity for 1+ hour)
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
    
    // Zombie detection thresholds - games that appear running but are actually stuck
    // Use different thresholds for standard vs discount pricing games
    const ZOMBIE_THRESHOLD_STANDARD = 60 * 60_000; // 1 hour for standard games
    const ZOMBIE_THRESHOLD_DISCOUNT = 48 * 60 * 60_000; // 48 hours for discount pricing (batch API)
    const zombieThreshold = state.discountPricing ? ZOMBIE_THRESHOLD_DISCOUNT : ZOMBIE_THRESHOLD_STANDARD;
    
    // Calculate game duration
    const gameDuration = state.startedAt ? now - state.startedAt : 0;
    
    // Effective event count: use in-memory log if available, fall back to persisted count
    // This handles DO restarts where in-memory log is lost but events are in R2
    const effectiveEventCount = this.eventLog.length > 0 
      ? this.eventLog.length 
      : state.persistedEventCount;
    
    // Check for zombie state - game is technically "running" but hasn't had activity
    // for an extended period (1 hour for standard, 48 hours for discount)
    const lastActive = state.lastActivity ?? state.startedAt ?? 0;
    const timeSinceActivity = lastActive ? now - lastActive : 0;
    const isZombie = state.status === 'running' && timeSinceActivity > zombieThreshold;
    
    // Determine health status
    let healthStatus: 'healthy' | 'warning' | 'critical' | 'idle' | 'completed';
    let healthMessage: string;
    let recommendedAction: 'none' | 'punt' | 'fail' | undefined;
    
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
      
      // Critical: Zombie game - running but no activity for threshold period
      if (isZombie) {
        healthStatus = 'critical';
        const thresholdHours = Math.round(zombieThreshold / (60 * 60_000));
        healthMessage = `Zombie detected: no activity for ${Math.round(timeSinceActivity / (60 * 60_000))}h (threshold: ${thresholdHours}h)`;
        recommendedAction = 'fail';
      }
      // Critical: 0 events after 5 minutes - likely stuck on first AI call
      // Use persistedEventCount if in-memory log is empty (DO may have restarted)
      else if (effectiveEventCount === 0 && gameDuration > ZERO_EVENTS_CRITICAL_THRESHOLD) {
        healthStatus = 'critical';
        healthMessage = `No events after ${Math.round(gameDuration / 1000)}s - AI provider may be down`;
        recommendedAction = 'punt';
      }
      // Critical: Heartbeat stale - game process crashed
      else if (heartbeatAge !== null && heartbeatAge > HEARTBEAT_STALE_THRESHOLD) {
        healthStatus = 'critical';
        healthMessage = `Heartbeat stale (${Math.round(heartbeatAge / 1000)}s ago), game may be stuck`;
        recommendedAction = 'punt';
      }
      // Warning: 0 events after 2 minutes
      else if (effectiveEventCount === 0 && gameDuration > ZERO_EVENTS_WARN_THRESHOLD) {
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
    
    // Get AI response cache stats for "waiting for AI" visualization
    const aiResponses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES);
    const cachedResponseCount = aiResponses?.size ?? 0;
    
    // Get config to know expected player count
    const config = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
    const expectedPlayers = config?.playerCount ?? null;
    
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
      eventCount: effectiveEventCount,
      inMemoryEventCount: this.eventLog.length,
      persistedEventCount: state.persistedEventCount,
      sessionCount: this.sessions.length,
      // AI response progress for "Waiting for AI (3/7 responses)" visualization
      aiProgress: {
        cachedResponses: cachedResponseCount,
        expectedPlayers,
        // If we have a phase like 'discussion', each player needs 1 response
        // This gives a rough progress indication
        progressText: expectedPlayers 
          ? `${cachedResponseCount}/${expectedPlayers} AI responses`
          : `${cachedResponseCount} AI responses cached`,
      },
      // Shows which model/player the game is waiting for (helps debug stuck games)
      suspenseReason: state.suspenseReason,
      // Zombie detection fields for external monitoring/cleanup
      zombie: {
        isZombie,
        timeSinceActivityMs: timeSinceActivity,
        thresholdMs: zombieThreshold,
        discountPricing: state.discountPricing,
      },
      // Recommended action for unhealthy games
      recommendedAction,
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

    // Load event log from R2 if resuming
    if (isResuming) {
      const streamedEvents = await this.loadEventsFromR2Stream(gameId);
      if (streamedEvents.length > 0) {
        this.eventLog = streamedEvents;
        this.lastR2StreamIndex = streamedEvents.length;
        gameLog.info('Loaded event log from R2 stream', { eventCount: this.eventLog.length });
      }
    } else {
      // Reset event log for new game
      this.eventLog = [];
    }

    // Get discountPricing from config for activity tracking and provider configuration
    const discountPricing = (await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG))?.discountPricing ?? false;

    // Get all unique model IDs from the config
    const modelIds = config.teams.map((t) => t.modelId);

    // Create AI providers for all models
    // Pass discountPricing to use longer timeouts and more retries
    // Pass userApiKeys if provided (for user-provided API keys)
    const userApiKeys = await this.getDecryptedUserKeys();
    const hasUserKeys = userApiKeys !== undefined;
    gameLog.debug('Creating AI providers', { 
      modelIds: modelIds.join(','), 
      discountPricing,
      keySource: hasUserKeys ? 'user' : 'system',
    });
    const providers = createProvidersForGame(modelIds, this.env, { 
      discountPricing,
      userKeys: userApiKeys,
    });
    
    // Get traceId for request correlation
    const traceId = this.stateCache?.traceId;
    
    // Check if this is a test game (skip suspense mode for tests)
    // Test models run synchronously without queue-based AI requests
    const isTestGame = modelIds.some(id => isTestModel(id));
    
    // Create AI adapter - only enable suspense mode for production games
    // Test games run synchronously without the queue worker
    const aiAdapter = new GameAIAdapter(providers, isTestGame ? {} : {
      suspenseMode: {
        checkCache: this.getCachedAIResponse.bind(this),
        queueRequest: this.queueAIRequest.bind(this),
        gameId,
        // Only include traceId if it has a value (exactOptionalPropertyTypes)
        ...(traceId && { traceId }),
        // Pass discountPricing for batch API routing (40-50% cost savings)
        ...(discountPricing && { discountPricing }),
      },
    });

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
          // Use waitUntil to ensure background update completes
          this.ctx.waitUntil(this.updateLastActivityInD1(gameId));
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
      
      // Cap in-memory log to prevent 128MB DO memory limit
      // Old events are preserved in R2 stream, so this is safe
      if (this.eventLog.length > MAX_IN_MEMORY_EVENTS) {
        // Keep the most recent events and trim the oldest
        const trimCount = this.eventLog.length - MAX_IN_MEMORY_EVENTS;
        this.eventLog.splice(0, trimCount);
        this.log.debug('Trimmed old events from memory', { 
          trimCount, 
          remaining: this.eventLog.length,
        });
      }

      // Stream to R2 incrementally (every 10 events or on important events)
      // R2 is our persistence layer for events.
      // NOTE: We increased from 3 to 10 to reduce R2 rate limit issues
      const eventsSinceLastStream = this.eventLog.length - this.lastR2StreamIndex;
      const shouldStream = 
        eventsSinceLastStream >= 10 ||
        event.type === 'elimination' ||
        event.type === 'game_end';
      
      // Also throttle by time - don't stream more than once per second
      const timeSinceLastStream = now - this.lastR2StreamTime;
      const canStream = timeSinceLastStream >= 1000; // 1 second minimum between streams
      
      if (shouldStream && canStream) {
        try {
          await this.streamEventsToR2(gameId);
          this.lastR2StreamTime = now;
          gameLog.debug('Events streamed to R2', { 
            eventCount: this.eventLog.length,
            streamedFrom: this.lastR2StreamIndex,
          });
        } catch (error) {
          // R2 rate limit errors are non-fatal - events are in memory
          // They'll be persisted on the next stream or final transcript
          if (String(error).includes('10058')) {
            gameLog.warn('R2 rate limited, will retry later', { eventCount: this.eventLog.length });
          } else {
            logErrorWithStack(gameLog, 'Failed to stream events to R2', error, {
              eventCount: this.eventLog.length,
            });
          }
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
        // Prune old AI responses since phase completed - they're now in the checkpoint
        await this.saveCheckpoint(serializedState, true /* pruneResponses */);
        
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
        suspenseReason: null, // Clear suspense reason on completion
        suspenseStartedAt: null, // Clear suspense timestamp on completion
        persistedEventCount: this.eventLog.length, // Final event count
      });
      gameLog.info('State saved as completed');

      // Clean up checkpoint data and AI response cache (no longer needed after completion)
      // Keep event log for WebSocket clients that may still be connected
      await Promise.all([
        this.ctx.storage.delete(STORAGE_KEYS.GAME_STATE), // Legacy key
        this.ctx.storage.delete(STORAGE_KEYS.CHECKPOINT_META), // New R2 pointer
        this.ctx.storage.delete(STORAGE_KEYS.AI_RESPONSES), // Suspense pattern cache
      ]);
      gameLog.debug('Cleaned up checkpoint and AI response cache');
      
      // Clean up R2 temporary files (Claim Check payloads, checkpoints, event streams)
      // These are no longer needed after the final transcript is written
      this.ctx.waitUntil(this.cleanupR2TempFiles(gameId, gameLog));

      // Broadcast completion status (clear suspense fields)
      this.broadcast({
        type: 'STATUS',
        status: 'completed',
        gameId,
        suspenseReason: null,
        suspenseStartedAt: null,
      });
    } catch (error) {
      // Handle SuspenseError - game is waiting for AI response
      if (error instanceof SuspenseError) {
        // Build suspense reason for debugging stuck games
        const suspenseReason = `Waiting for ${error.modelId} (${error.context.playerId}, ${error.context.actionType}) in round ${error.context.round} ${error.context.phase}`;
        
        gameLog.info('Game suspended waiting for AI', {
          requestId: error.requestId,
          modelId: error.modelId,
          round: error.context.round,
          phase: error.context.phase,
          playerId: error.context.playerId,
          actionType: error.context.actionType,
          suspenseReason,
        });
        
        // Save suspense reason and timestamp for monitoring/debugging/timeout
        await this.saveState({ 
          suspenseReason,
          suspenseStartedAt: Date.now(),
        });
        
        // CRITICAL: Save checkpoint before suspending!
        // This ensures the game can resume from its current state.
        // SuspenseError can be thrown BEFORE onPhaseComplete fires,
        // so we must save the checkpoint here.
        //
        // FIX: If checkpoint save fails, we CANNOT safely suspend because
        // the DO will revert to old state on resume, causing duplicate events.
        // We must throw an error to fail the game rather than create duplicates.
        const currentState = game.getState();
        const serializedState: SerializedGameState = {
          players: currentState.players,
          phase: currentState.phase,
          round: currentState.round ?? 1,
          seed: config.seed ?? 0,
          conversationHistory: currentState.conversationHistory,
          gameId,
          events: currentState.events,
          config,
        };
        
        try {
          await this.saveCheckpoint(serializedState);
          gameLog.debug('Saved checkpoint on suspend', { 
            round: serializedState.round, 
            phase: serializedState.phase 
          });
        } catch (checkpointError) {
          // CRITICAL FIX: Do NOT swallow this error!
          // If we can't save state, we can't suspend safely (leads to duplicates).
          // Instead, throw a fatal error that will fail the game.
          logErrorWithStack(gameLog, 'FATAL: Failed to save suspend checkpoint - cannot safely suspend', checkpointError);
          
          // Clear the pending AI request since we can't wait for it
          const aiResponses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES);
          if (aiResponses) {
            aiResponses.delete(error.requestId);
            await this.ctx.storage.put(STORAGE_KEYS.AI_RESPONSES, aiResponses);
          }
          
          throw new Error(`Critical persistence failure during suspend: ${checkpointError instanceof Error ? checkpointError.message : String(checkpointError)}`);
        }
        
        // Update activity timestamp and persist event count
        await this.saveState({ 
          lastActivity: Date.now(),
          persistedEventCount: this.eventLog.length,
        });
        
        // Stop heartbeat - we're intentionally suspending
        this.stopHeartbeat();
        
        // Get AI response cache for progress indicator
        const aiResponses = await this.ctx.storage.get<Map<string, CachedAIResponse>>(STORAGE_KEYS.AI_RESPONSES);
        const cachedResponseCount = aiResponses?.size ?? 0;
        const playerConfig = await this.ctx.storage.get<GameQueueConfig>(STORAGE_KEYS.CONFIG);
        const expectedPlayers = playerConfig?.playerCount ?? null;
        
        // Broadcast status update to clients with suspense info
        this.broadcast({
          type: 'STATUS',
          status: 'running',
          gameId,
          suspenseReason,
          suspenseStartedAt: Date.now(),
          aiProgress: {
            cachedResponses: cachedResponseCount,
            expectedPlayers,
            progressText: expectedPlayers 
              ? `${cachedResponseCount}/${expectedPlayers} AI responses`
              : `${cachedResponseCount} AI responses cached`,
          },
        });
        
        // Return - DO will hibernate, callback will wake it up
        return;
      }
      
      // Re-throw other errors to be handled by runGameWithErrorHandling
      throw error;
    } finally {
      // Always stop heartbeat when game ends (success or failure)
      // Note: For SuspenseError, we already stopped it above before returning
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
   * Clean up temporary R2 files after game completes.
   * This includes Claim Check payloads, checkpoints, and event streams.
   * The final transcript is preserved.
   */
  private async cleanupR2TempFiles(gameId: string, gameLog: Logger): Promise<void> {
    try {
      const prefix = `games/${gameId}/`;
      const listed = await this.env.TRANSCRIPTS.list({ prefix });
      
      const filesToDelete: string[] = [];
      for (const obj of listed.objects) {
        // Keep the final transcript, delete everything else
        if (!obj.key.endsWith('/transcript.json')) {
          filesToDelete.push(obj.key);
        }
      }
      
      if (filesToDelete.length === 0) {
        gameLog.debug('No R2 temp files to clean up');
        return;
      }
      
      // Delete files in parallel (up to 10 at a time to avoid rate limits)
      const batchSize = 10;
      for (let i = 0; i < filesToDelete.length; i += batchSize) {
        const batch = filesToDelete.slice(i, i + batchSize);
        await Promise.all(batch.map(key => this.env.TRANSCRIPTS.delete(key)));
      }
      
      gameLog.info('Cleaned up R2 temp files', { 
        deletedCount: filesToDelete.length,
        files: filesToDelete.slice(0, 5).join(', ') + (filesToDelete.length > 5 ? '...' : ''),
      });
    } catch (error) {
      // Don't fail the game for cleanup errors
      gameLog.warn('Failed to clean up R2 temp files', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
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

    // Fetch model pricing from DB for accurate cost calculation
    const modelIds = [...new Set(result.participants.map(p => p.modelId))];
    const pricingMap = new Map<string, ModelPricing>();
    
    // Batch fetch model configs for all unique models
    for (const modelId of modelIds) {
      try {
        const modelRow = await db.prepare('SELECT config FROM models WHERE id = ?')
          .bind(modelId)
          .first<{ config: string | null }>();
        pricingMap.set(modelId, parsePricingFromConfig(modelRow?.config ?? null));
      } catch {
        // Model not found in DB - use default pricing
        pricingMap.set(modelId, DEFAULT_PRICING);
      }
    }
    
    // Calculate per-participant costs using exact input/output tokens and model-specific pricing
    let totalCostUsd = 0;
    const participantCosts = new Map<string, number>();
    
    for (const participant of result.participants) {
      const pricing = pricingMap.get(participant.modelId) ?? DEFAULT_PRICING;
      const cost = calculateExactCost(
        participant.tokensUsed.input,
        participant.tokensUsed.output,
        pricing
      );
      participantCosts.set(`${participant.modelId}_${participant.team}`, cost);
      totalCostUsd += cost;
    }
    
    const costUsd = totalCostUsd;
    
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

    // Note: Test games (test/*) persist to D1 in E2E tests to verify full lifecycle.
    // The D1 instance in tests is in-memory and isolated.
    if (isTestGame) {
      this.log.debug('Test game persisting to D1', { 
        gameId: result.id, 
        testModels: modelIds.filter(id => isTestModel(id)).join(','),
      });
    }

    // 2. ATOMIC idempotency check: Update game to 'completed' only if not already completed
    // This prevents race conditions where two processes might try to complete the same game
    const updateResult = await db.prepare(`
      UPDATE games 
      SET winner = ?, rounds = ?, duration_ms = ?, total_tokens = ?, cost_usd = ?, status = 'completed',
          persona_theme = ?, trace_id = COALESCE(?, trace_id)
      WHERE id = ? AND status != 'completed'
    `).bind(
      result.winner,
      result.rounds,
      result.durationMs,
      result.tokenUsage.total,
      costUsd,
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
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, cost_usd, status, seed, persona_theme, trace_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        costUsd,
        'completed',
        result.config.seed ?? null,
        result.config.personaTheme ?? 'noir',
        traceId ?? null,
        createdAt
      )
    );

    // Insert or update game participants with token splits (may already exist from insertRunningGame)
    for (const participant of result.participants) {
      statements.push(
        db.prepare(
          `INSERT INTO game_participants (id, game_id, model_id, team, player_count, won, input_tokens, output_tokens)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET 
             won = excluded.won, 
             player_count = excluded.player_count,
             input_tokens = excluded.input_tokens,
             output_tokens = excluded.output_tokens`
        ).bind(
          `${result.id}_${participant.modelId}_${participant.team}`,
          result.id,
          participant.modelId,
          participant.team,
          participant.playerCount,
          participant.won ? 1 : 0,
          participant.tokensUsed.input,
          participant.tokensUsed.output
        )
      );
    }

    // Update leaderboard for each participant with cost tracking (only reached if game wasn't already completed)
    for (const participant of result.participants) {
      // Get the participant's cost from our pre-calculated map
      const participantCost = participantCosts.get(`${participant.modelId}_${participant.team}`) ?? 0;
      
      statements.push(
        db.prepare(
          `INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens, cost_usd, updated_at)
           VALUES (?, ?, 1, ?, ?, ?, ?)
           ON CONFLICT (model_id, team) DO UPDATE SET
             games_played = games_played + 1,
             games_won = games_won + excluded.games_won,
             total_tokens = total_tokens + excluded.total_tokens,
             cost_usd = COALESCE(cost_usd, 0) + excluded.cost_usd,
             updated_at = excluded.updated_at`
        ).bind(
          participant.modelId,
          participant.team,
          participant.won ? 1 : 0,
          participant.tokensUsed.total,
          participantCost,
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

    // Update ELO ratings incrementally (only for non-self-play games)
    const mafiaParticipant = result.participants.find(p => p.team === 'mafia');
    const townParticipant = result.participants.find(p => p.team === 'town');
    
    if (mafiaParticipant && townParticipant && mafiaParticipant.modelId !== townParticipant.modelId) {
      // Fetch current ELO ratings
      const [mafiaModel, townModel] = await Promise.all([
        db.prepare('SELECT elo_rating, elo_games_played FROM models WHERE id = ?')
          .bind(mafiaParticipant.modelId)
          .first<{ elo_rating: number | null; elo_games_played: number | null }>(),
        db.prepare('SELECT elo_rating, elo_games_played FROM models WHERE id = ?')
          .bind(townParticipant.modelId)
          .first<{ elo_rating: number | null; elo_games_played: number | null }>(),
      ]);

      const INITIAL_RATING = 1500;
      const mafiaElo = mafiaModel?.elo_rating ?? INITIAL_RATING;
      const townElo = townModel?.elo_rating ?? INITIAL_RATING;
      const mafiaGames = mafiaModel?.elo_games_played ?? 0;
      const townGames = townModel?.elo_games_played ?? 0;

      // K-factor: higher for newer players (more volatile ratings)
      const getKFactor = (games: number): number => {
        if (games < 30) return 32;
        if (games < 100) return 24;
        return 16;
      };

      const mafiaK = getKFactor(mafiaGames);
      const townK = getKFactor(townGames);

      // Expected scores based on current ELO
      const mafiaExpected = 1 / (1 + Math.pow(10, (townElo - mafiaElo) / 400));
      const townExpected = 1 - mafiaExpected;

      // Actual scores (1 for win, 0 for loss)
      const mafiaActual = result.winner === 'mafia' ? 1 : 0;
      const townActual = result.winner === 'town' ? 1 : 0;

      // New ELO ratings
      const newMafiaElo = Math.round(mafiaElo + mafiaK * (mafiaActual - mafiaExpected));
      const newTownElo = Math.round(townElo + townK * (townActual - townExpected));

      // Update models table with new ELO ratings
      statements.push(
        db.prepare(`
          UPDATE models SET 
            elo_rating = ?,
            elo_games_played = ?,
            elo_peak = MAX(COALESCE(elo_peak, ?), ?),
            elo_updated_at = ?
          WHERE id = ?
        `).bind(newMafiaElo, mafiaGames + 1, newMafiaElo, newMafiaElo, createdAt, mafiaParticipant.modelId)
      );

      statements.push(
        db.prepare(`
          UPDATE models SET 
            elo_rating = ?,
            elo_games_played = ?,
            elo_peak = MAX(COALESCE(elo_peak, ?), ?),
            elo_updated_at = ?
          WHERE id = ?
        `).bind(newTownElo, townGames + 1, newTownElo, newTownElo, createdAt, townParticipant.modelId)
      );
    }

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

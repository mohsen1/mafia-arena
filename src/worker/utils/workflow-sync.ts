/**
 * Workflow state synchronization utilities.
 * 
 * Provides helpers for syncing workflow state to KV for frontend visibility.
 * The frontend can poll KV to show game progress even while the workflow is running.
 */

import type { Env } from '../types.js';
import { GameState, type SerializedGameState, type GameEvent } from '../../engine/index.js';

/** KV key prefix for game state */
const KV_PREFIX = 'game-state:';

/** TTL for game state in KV (24 hours) */
const STATE_TTL_SECONDS = 24 * 60 * 60;

/** 
 * Maximum KV value size in bytes (Cloudflare KV limit is 25MB, but Workflows has 128KB limit)
 * We use 100KB as a safe threshold to leave room for JSON overhead and metadata
 */
const MAX_KV_VALUE_SIZE = 100 * 1024;

/**
 * Maximum number of events to include in KV state.
 * For 11-player games with rich personas, each event can be ~2-5KB.
 * 30 events * 5KB = 150KB which is too large.
 * We limit to 20 events which should be ~100KB max.
 */
const MAX_EVENTS_IN_KV = 20;

/**
 * Progress information for UI display.
 */
export interface GameProgress {
  /** Number of actions completed in current phase */
  current: number;
  /** Total actions expected in current phase */
  total: number;
  /** Human-readable label (e.g., "Waiting for 3 players") */
  label: string;
  /** Names of players we're waiting for */
  pendingPlayers: string[];
}

/**
 * Information about what the game is currently waiting for.
 */
export interface WaitingFor {
  /** Player name (display name) */
  playerName: string;
  /** Model ID being used */
  modelId: string;
  /** Type of action we're waiting for */
  actionType: 'introduction' | 'discussion' | 'vote' | 'night_action';
}

/**
 * Batch API status for games using discount pricing.
 */
export interface BatchStatus {
  /** Whether game is waiting for batch API */
  isWaitingForBatch: boolean;
  /** Provider name (openai, anthropic) */
  provider?: string;
  /** When batch was submitted */
  submittedAt?: number;
  /** How many times we've polled */
  pollCount?: number;
  /** Estimated hours remaining */
  estimatedWaitHours?: number;
}

/**
 * Serialized game state with additional workflow metadata.
 */
export interface WorkflowGameState {
  /** Serialized game engine state */
  state: SerializedGameState;
  /** Workflow execution status */
  status: 'running' | 'completed' | 'failed';
  /** Current phase being executed */
  currentPhase?: string | undefined;
  /** Current round number */
  currentRound?: number | undefined;
  /** Error message if failed */
  error?: string | undefined;
  /** Timestamp of last update */
  updatedAt: number;
  /** Whether game is waiting for batch API (discount pricing) - DEPRECATED: use batchStatus */
  batchPending?: boolean | undefined;
  /** Estimated wait time in hours for batch processing - DEPRECATED: use batchStatus */
  estimatedWaitHours?: number | undefined;
  /** Progress information for UI */
  progress?: GameProgress | undefined;
  /** What we're actively waiting for (direct flow only) */
  waitingFor?: WaitingFor | null | undefined;
  /** Batch API status (for discountPricing games) */
  batchStatus?: BatchStatus | undefined;
}

/**
 * Options for saving game state to KV.
 */
export interface SaveGameStateOptions {
  /** Current phase being executed */
  currentPhase?: string;
  /** Whether game is waiting for batch API (discount pricing) - DEPRECATED */
  batchPending?: boolean;
  /** Estimated wait time in hours for batch processing - DEPRECATED */
  estimatedWaitHours?: number;
  /** Progress information for UI */
  progress?: GameProgress;
  /** What we're actively waiting for */
  waitingFor?: WaitingFor | null;
  /** Batch API status */
  batchStatus?: BatchStatus;
}

/**
 * Save game state to KV for frontend visibility.
 * 
 * NOTE: KV is for real-time frontend display only. Full state is stored in R2 checkpoints.
 * To avoid hitting Cloudflare's storage limits (128KB for Workflow step.do() returns),
 * we truncate events to keep only the most recent ones.
 * 
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @param state - Current game state
 * @param status - Workflow status
 * @param options - Additional options (currentPhase, batchPending, estimatedWaitHours)
 */
export async function saveGameStateToKV(
  env: Env,
  gameId: string,
  state: GameState,
  status: 'running' | 'completed' | 'failed' = 'running',
  options?: SaveGameStateOptions | string
): Promise<void> {
  // Support legacy signature: saveGameStateToKV(env, gameId, state, status, currentPhase)
  const opts: SaveGameStateOptions = typeof options === 'string' 
    ? { currentPhase: options } 
    : (options ?? {});

  // Get progress from state if not provided
  const progress = opts.progress ?? state.getProgress();
  
  // Serialize state and truncate events to avoid hitting storage limits
  // Full state is always available in R2 checkpoints
  const serialized = state.serialize();
  const truncatedState = truncateStateForKV(serialized);
  
  const workflowState: WorkflowGameState = {
    state: truncatedState,
    status,
    updatedAt: Date.now(),
    currentRound: state.round,
    progress,
    ...(opts.currentPhase && { currentPhase: opts.currentPhase }),
    ...(opts.batchPending !== undefined && { batchPending: opts.batchPending }),
    ...(opts.estimatedWaitHours !== undefined && { estimatedWaitHours: opts.estimatedWaitHours }),
    ...(opts.waitingFor !== undefined && { waitingFor: opts.waitingFor }),
    ...(opts.batchStatus && { batchStatus: opts.batchStatus }),
  };

  // Double-check size before writing (safety net)
  const jsonStr = JSON.stringify(workflowState);
  if (jsonStr.length > MAX_KV_VALUE_SIZE) {
    console.warn(`[workflow-sync] KV state still too large (${jsonStr.length} bytes), truncating more`);
    // Aggressive truncation: keep only last 5 events
    workflowState.state = {
      ...truncatedState,
      events: truncatedState.events.slice(-5),
    };
  }

  await env.RATE_LIMIT.put(
    `${KV_PREFIX}${gameId}`,
    JSON.stringify(workflowState),
    { expirationTtl: STATE_TTL_SECONDS }
  );
}

/**
 * Truncate serialized state to fit within KV storage limits.
 * Keeps only recent events since full state is always in R2.
 */
function truncateStateForKV(state: SerializedGameState): SerializedGameState {
  const eventCount = state.events.length;
  
  if (eventCount <= MAX_EVENTS_IN_KV) {
    return state;
  }
  
  // Keep only the most recent events
  const truncatedEvents = state.events.slice(-MAX_EVENTS_IN_KV);
  
  return {
    ...state,
    events: truncatedEvents,
  };
}

/**
 * Save error state to KV.
 * 
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @param error - Error message
 * @param state - Last known game state (optional)
 */
export async function saveErrorStateToKV(
  env: Env,
  gameId: string,
  error: string,
  state?: GameState | SerializedGameState
): Promise<void> {
  // Serialize if state is a GameState, otherwise use directly if already serialized
  const serializedState = state
    ? ('serialize' in state ? state.serialize() : state)
    : undefined;
  
  // Truncate state to fit KV limits (same as running state)
  const truncatedState = serializedState 
    ? truncateStateForKV(serializedState) 
    : undefined;
  
  const workflowState: WorkflowGameState = {
    state: truncatedState!,
    status: 'failed',
    error,
    updatedAt: Date.now(),
  };

  // Only save if we have state, otherwise just log the error
  if (truncatedState) {
    await env.RATE_LIMIT.put(
      `${KV_PREFIX}${gameId}`,
      JSON.stringify(workflowState),
      { expirationTtl: STATE_TTL_SECONDS }
    );
  }
}

/**
 * Get game state from KV.
 * 
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @returns Workflow game state or null if not found
 */
export async function getGameStateFromKV(
  env: Env,
  gameId: string
): Promise<WorkflowGameState | null> {
  const data = await env.RATE_LIMIT.get(`${KV_PREFIX}${gameId}`);
  if (!data) {
    return null;
  }
  return JSON.parse(data) as WorkflowGameState;
}

/**
 * Delete game state from KV.
 * 
 * @param env - Worker environment
 * @param gameId - Game identifier
 */
export async function deleteGameStateFromKV(
  env: Env,
  gameId: string
): Promise<void> {
  await env.RATE_LIMIT.delete(`${KV_PREFIX}${gameId}`);
}

/**
 * Get recent events from state for broadcasting.
 * Limits to last N events to avoid bandwidth issues.
 * 
 * @param events - All game events
 * @param limit - Maximum events to return (default: 50)
 * @returns Recent events
 */
export function getRecentEvents(
  events: readonly GameEvent[],
  limit: number = 50
): GameEvent[] {
  if (events.length <= limit) {
    return [...events];
  }
  return events.slice(-limit) as GameEvent[];
}

// =============================================================================
// R2-based Checkpoint System for Large State
// =============================================================================
// Cloudflare Workflows has a ~1MB limit per step.do() return value.
// For games with many rounds/discussions, the serialized GameState can exceed this.
// These utilities save state to R2 and return only a small reference.

/** R2 key prefix for workflow checkpoints */
const CHECKPOINT_PREFIX = 'checkpoints/';

/**
 * Checkpoint metadata returned from step.do() instead of full state.
 * Small enough to never hit the 1MB limit.
 */
export interface CheckpointRef {
  /** R2 key where full state is stored */
  key: string;
  /** Current round number */
  round: number;
  /** Current phase */
  phase: string;
  /** Number of events at checkpoint */
  eventCount: number;
  /** Timestamp of checkpoint */
  timestamp: number;
}

/**
 * Save game state to R2 as a checkpoint and return a small reference.
 * Use this inside step.do() to avoid returning large state.
 * 
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @param phase - Current phase name (used in checkpoint key)
 * @param state - Game state to checkpoint
 * @returns Small checkpoint reference to return from step.do()
 */
export async function saveCheckpointToR2(
  env: Env,
  gameId: string,
  phase: string,
  state: GameState
): Promise<CheckpointRef> {
  const timestamp = Date.now();
  const key = `${CHECKPOINT_PREFIX}${gameId}/${state.round}-${phase}-${timestamp}.json`;
  
  const serialized = state.serialize();
  await env.TRANSCRIPTS.put(key, JSON.stringify(serialized), {
    customMetadata: {
      gameId,
      round: String(state.round),
      phase,
      eventCount: String(state.events.length),
    },
  });
  
  return {
    key,
    round: state.round,
    phase,
    eventCount: state.events.length,
    timestamp,
  };
}

/**
 * Load game state from R2 checkpoint.
 * 
 * @param env - Worker environment
 * @param checkpoint - Checkpoint reference from step.do()
 * @returns Deserialized game state
 * @throws Error if checkpoint not found
 */
export async function loadCheckpointFromR2(
  env: Env,
  checkpoint: CheckpointRef
): Promise<GameState> {
  const obj = await env.TRANSCRIPTS.get(checkpoint.key);
  if (!obj) {
    throw new Error(`Checkpoint not found: ${checkpoint.key}`);
  }
  
  const serialized = await obj.json() as SerializedGameState;
  return GameState.deserialize(serialized);
}

/**
 * Clean up old checkpoints for a completed game.
 * Call this after game completion to free R2 storage.
 * 
 * @param env - Worker environment
 * @param gameId - Game identifier
 */
export async function cleanupCheckpoints(
  env: Env,
  gameId: string
): Promise<void> {
  const prefix = `${CHECKPOINT_PREFIX}${gameId}/`;
  const listed = await env.TRANSCRIPTS.list({ prefix });
  
  // Delete all checkpoints for this game
  await Promise.all(
    listed.objects.map(obj => env.TRANSCRIPTS.delete(obj.key))
  );
}

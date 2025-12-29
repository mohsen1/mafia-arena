/**
 * Workflow state synchronization utilities.
 * 
 * Provides helpers for syncing workflow state to KV for frontend visibility.
 * The frontend can poll KV to show game progress even while the workflow is running.
 */

import type { Env } from '../types.js';
import type { GameState, SerializedGameState, GameEvent } from '../../engine/index.js';

/** KV key prefix for game state */
const KV_PREFIX = 'game-state:';

/** TTL for game state in KV (24 hours) */
const STATE_TTL_SECONDS = 24 * 60 * 60;

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
  /** Error message if failed */
  error?: string | undefined;
  /** Timestamp of last update */
  updatedAt: number;
  /** Whether game is waiting for batch API (discount pricing) */
  batchPending?: boolean | undefined;
  /** Estimated wait time in hours for batch processing */
  estimatedWaitHours?: number | undefined;
}

/**
 * Options for saving game state to KV.
 */
export interface SaveGameStateOptions {
  /** Current phase being executed */
  currentPhase?: string;
  /** Whether game is waiting for batch API (discount pricing) */
  batchPending?: boolean;
  /** Estimated wait time in hours for batch processing */
  estimatedWaitHours?: number;
}

/**
 * Save game state to KV for frontend visibility.
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

  const workflowState: WorkflowGameState = {
    state: state.serialize(),
    status,
    updatedAt: Date.now(),
    ...(opts.currentPhase && { currentPhase: opts.currentPhase }),
    ...(opts.batchPending !== undefined && { batchPending: opts.batchPending }),
    ...(opts.estimatedWaitHours !== undefined && { estimatedWaitHours: opts.estimatedWaitHours }),
  };

  await env.RATE_LIMIT.put(
    `${KV_PREFIX}${gameId}`,
    JSON.stringify(workflowState),
    { expirationTtl: STATE_TTL_SECONDS }
  );
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
  
  const workflowState: WorkflowGameState = {
    state: serializedState!,
    status: 'failed',
    error,
    updatedAt: Date.now(),
  };

  // Only save if we have state, otherwise just log the error
  if (serializedState) {
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


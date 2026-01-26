/**
 * Workflow state synchronization utilities.
 * 
 * Provides helpers for syncing workflow state to KV for frontend visibility.
 * The frontend can poll KV to show game progress even while the workflow is running.
 */

import type { Env } from '../types.js';
import { GameState, type SerializedGameState, type GameEvent } from '../../engine/index.js';
import type { Team } from '../../engine/types.js';
import { STORAGE_LIMITS, KV_TTL, RETRY, GAME } from '../config/constants.js';

/** KV key prefix for game state */
const KV_PREFIX = 'game-state:';

/** TTL for game state in KV (24 hours) */
const STATE_TTL_SECONDS = KV_TTL.GAME_STATE;

/** KV value size limit (from centralized constants) */
const MAX_KV_VALUE_SIZE = STORAGE_LIMITS.KV_SAFE_SIZE;

/** Maximum number of events to include in KV state */
const MAX_EVENTS_IN_KV = STORAGE_LIMITS.MAX_EVENTS_IN_KV;

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
  // If state is undefined, create minimal serialized state for error reporting
  const serializedState = state
    ? ('serialize' in state ? state.serialize() : state)
    : {
        events: [],
        players: [],
        round: 0,
        phase: 'introduction' as const,
        conversationHistory: [],
        gameId,
        config: {
          playerCount: 0,
          mafiaCount: 0,
          teams: [],
          maxRounds: GAME.DEFAULT_MAX_ROUNDS,
          discussionEnabled: true,
        },
        seed: 0,
      } as SerializedGameState;
  
  // Truncate state to fit KV limits (same as running state)
  const truncatedState = truncateStateForKV(serializedState);
  
  const workflowState: WorkflowGameState = {
    state: truncatedState,
    status: 'failed',
    error,
    updatedAt: Date.now(),
  };

  // Always save error state to KV so frontend can display the error
  await env.RATE_LIMIT.put(
    `${KV_PREFIX}${gameId}`,
    JSON.stringify(workflowState),
    { expirationTtl: STATE_TTL_SECONDS }
  );
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

// =============================================================================
// R2-based Incremental Event Streaming for Live Games
// =============================================================================
// Live games need full event history accessible from R2, not just last 20 from KV.
// These utilities stream events incrementally to R2 in JSONL format.

/** R2 key prefix for live event streams */
const EVENT_STREAM_PREFIX = 'event-streams/';

/** Maximum retry attempts for concurrent writes */
const MAX_WRITE_RETRIES = RETRY.MAX_ATTEMPTS;

/** Delay between retries (exponential backoff base) */
const RETRY_DELAY_MS = 100;

/** Maximum event stream size in bytes (50MB) */
const MAX_EVENT_STREAM_SIZE = 50 * 1024 * 1024;

/** Maximum number of events in stream (10000 events) */
const MAX_EVENT_STREAM_EVENTS = 10000;

/** Number of events to keep when truncating (1000 most recent) */
const EVENT_STREAM_TRUNCATION_SIZE = 1000;

/**
 * Result of appending events to R2.
 * Provides detailed success/failure information instead of silently returning 0.
 */
export interface AppendEventsResult {
  /** Whether the append operation succeeded */
  success: boolean;
  /** Number of events successfully written */
  eventsWritten: number;
  /** Error message if operation failed */
  error?: string;
  /** Whether the stream was truncated due to size limits */
  truncated?: boolean;
}

/**
 * Append events to R2 event stream incrementally.
 * Events are stored in JSONL format (one JSON event per line) for efficient streaming.
 *
 * This function:
 * - Handles concurrent appends with retry logic
 * - Enforces size limits to prevent unbounded memory growth
 * - Truncates to most recent events when limits are exceeded
 * - Returns detailed success/failure information
 *
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @param events - Array of events to append (will be added to existing stream)
 * @returns AppendEventsResult with success/failure details
 */
export async function appendEventsToR2(
  env: Env,
  gameId: string,
  events: readonly GameEvent[]
): Promise<AppendEventsResult> {
  if (events.length === 0) {
    return { success: true, eventsWritten: 0 };
  }

  const key = `${EVENT_STREAM_PREFIX}${gameId}.jsonl`;

  // Convert events to JSONL format (one JSON per line)
  const newLines = events.map(event => JSON.stringify(event)).join('\n') + '\n';
  const newSizeInBytes = new TextEncoder().encode(newLines).length;

  // Retry logic for handling concurrent writes
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt++) {
    try {
      // Fetch existing content
      const existing = await env.TRANSCRIPTS.get(key);

      if (existing) {
        const existingText = await existing.text();
        const existingSize = new TextEncoder().encode(existingText).length;
        const existingEventCount = countEventsInJSONL(existingText);

        // Check if appending would exceed limits
        const wouldExceedSize = (existingSize + newSizeInBytes) > MAX_EVENT_STREAM_SIZE;
        const wouldExceedEventCount = (existingEventCount + events.length) > MAX_EVENT_STREAM_EVENTS;

        let combinedContent: string;
        let actualEventsWritten = events.length;
        let wasTruncated = false;

        if (wouldExceedSize || wouldExceedEventCount) {
          // Truncate to last N events from existing + new events
          const existingEvents = existingText.split('\n').filter(line => line.trim().length > 0);
          const allEvents = [...existingEvents, ...events.map(e => JSON.stringify(e))];

          // Keep only the most recent EVENT_STREAM_TRUNCATION_SIZE events
          const truncatedEvents = allEvents.slice(-EVENT_STREAM_TRUNCATION_SIZE);
          combinedContent = truncatedEvents.join('\n') + '\n';
          actualEventsWritten = events.length; // Still wrote all new events (some old ones removed)
          wasTruncated = true;

          console.warn(`[workflow-sync] Truncated event stream for game ${gameId}: ` +
            `${allEvents.length} events -> ${truncatedEvents.length} events ` +
            `(${wouldExceedSize ? 'size limit' : 'event count limit'})`);
        } else {
          // Safe to append without truncation
          combinedContent = existingText + newLines;
        }

        await env.TRANSCRIPTS.put(key, combinedContent, {
          customMetadata: {
            gameId,
            eventCount: String(countEventsInJSONL(combinedContent)),
            lastUpdated: String(Date.now()),
          },
        });

        return {
          success: true,
          eventsWritten: actualEventsWritten,
          truncated: wasTruncated,
        };
      } else {
        // Create new stream
        await env.TRANSCRIPTS.put(key, newLines, {
          customMetadata: {
            gameId,
            eventCount: String(events.length),
            lastUpdated: String(Date.now()),
          },
        });

        return {
          success: true,
          eventsWritten: events.length,
          truncated: false,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this isn't the last attempt, wait before retrying
      if (attempt < MAX_WRITE_RETRIES - 1) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, attempt)));
      }
    }
  }

  // All retries failed - return detailed error information
  const errorMsg = `Failed to append events after ${MAX_WRITE_RETRIES} attempts: ${lastError?.message}`;
  console.error(`[workflow-sync] ${errorMsg}`, {
    gameId,
    eventCount: events.length,
    error: lastError?.message,
  });

  return {
    success: false,
    eventsWritten: 0,
    error: errorMsg,
  };
}

/**
 * Count number of events in a JSONL string.
 */
function countEventsInJSONL(jsonl: string): number {
  const lines = jsonl.split('\n').filter(line => line.trim().length > 0);
  return lines.length;
}

/**
 * Read all events from R2 event stream.
 *
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @returns Array of all events, or empty array if stream doesn't exist
 * @throws Error if stream exceeds maximum size limit
 */
export async function readEventsFromR2(
  env: Env,
  gameId: string
): Promise<GameEvent[]> {
  const key = `${EVENT_STREAM_PREFIX}${gameId}.jsonl`;
  const obj = await env.TRANSCRIPTS.get(key);

  if (!obj) {
    return [];
  }

  const text = await obj.text();

  // Check size limit to prevent memory issues
  const sizeInBytes = new TextEncoder().encode(text).length;
  if (sizeInBytes > MAX_EVENT_STREAM_SIZE) {
    throw new Error(
      `Event stream exceeds maximum size of ${MAX_EVENT_STREAM_SIZE} bytes ` +
      `(actual: ${sizeInBytes} bytes). Stream may need to be truncated.`
    );
  }

  const lines = text.split('\n').filter(line => line.trim().length > 0);

  // Also check event count limit
  if (lines.length > MAX_EVENT_STREAM_EVENTS) {
    throw new Error(
      `Event stream exceeds maximum event count of ${MAX_EVENT_STREAM_EVENTS} ` +
      `(actual: ${lines.length} events). Stream may need to be truncated.`
    );
  }

  return lines.map(line => JSON.parse(line) as GameEvent);
}

/**
 * Clean up event stream for a completed game.
 * Optionally truncates to keep only recent events to reduce storage.
 *
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @param keepRecentEvents - Number of recent events to keep (default: all)
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupEventStream(
  env: Env,
  gameId: string,
  keepRecentEvents?: number
): Promise<void> {
  const key = `${EVENT_STREAM_PREFIX}${gameId}.jsonl`;
  const obj = await env.TRANSCRIPTS.get(key);

  if (!obj) {
    return; // No stream to clean up
  }

  const text = await obj.text();
  const lines = text.split('\n').filter(line => line.trim().length > 0);

  // If keepRecentEvents is specified, truncate
  if (keepRecentEvents !== undefined && lines.length > keepRecentEvents) {
    const truncatedLines = lines.slice(-keepRecentEvents);
    const truncatedContent = truncatedLines.join('\n') + '\n';

    await env.TRANSCRIPTS.put(key, truncatedContent, {
      customMetadata: {
        gameId,
        eventCount: String(truncatedLines.length),
        lastUpdated: String(Date.now()),
        cleaned: 'true',
      },
    });

    console.info(`[workflow-sync] Cleaned up event stream for game ${gameId}: ` +
      `${lines.length} events -> ${truncatedLines.length} events`);
  }
}

/**
 * Update in-progress transcript in R2.
 * This allows live games to access the full event history, not just the last 20 events from KV.
 *
 * The transcript is stored at "transcript-in-progress.json" during the game,
 * and renamed to "transcript.json" on completion.
 *
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @param state - Current game state
 * @param startTime - Game start timestamp (ms)
 * @returns Promise that resolves when transcript is updated
 */
export async function updateTranscriptProgress(
  env: Env,
  gameId: string,
  state: GameState,
  startTime: number
): Promise<void> {
  const durationMs = Date.now() - startTime;

  const inProgressTranscript = {
    gameId,
    status: 'in-progress' as const,
    rounds: state.round,
    events: state.events,
    durationMs,
    timestamp: Date.now(),
  };

  await env.TRANSCRIPTS.put(
    `games/${gameId}/transcript-in-progress.json`,
    JSON.stringify(inProgressTranscript, null, 2),
    {
      customMetadata: {
        gameId,
        status: 'in-progress',
        rounds: String(state.round),
        eventCount: String(state.events.length),
      },
    }
  );
}

/**
 * Finalize transcript by renaming from "transcript-in-progress.json" to "transcript.json".
 * This should be called on game completion.
 *
 * @param env - Worker environment
 * @param gameId - Game identifier
 * @param state - Final game state
 * @param winner - Winning team
 * @param startTime - Game start timestamp (ms)
 * @returns Promise that resolves when transcript is finalized
 */
export async function finalizeTranscript(
  env: Env,
  gameId: string,
  state: GameState,
  winner: Team,
  startTime: number
): Promise<void> {
  const durationMs = Date.now() - startTime;

  const finalTranscript = {
    gameId,
    winner,
    rounds: state.round,
    events: state.events,
    durationMs,
    timestamp: Date.now(),
  };

  // Write final transcript
  await env.TRANSCRIPTS.put(
    `games/${gameId}/transcript.json`,
    JSON.stringify(finalTranscript, null, 2),
    {
      customMetadata: {
        gameId,
        winner,
        rounds: String(state.round),
      },
    }
  );

  // Delete in-progress transcript
  await env.TRANSCRIPTS.delete(`games/${gameId}/transcript-in-progress.json`);

  // Clean up event stream (keep last 2000 events for storage efficiency)
  await cleanupEventStream(env, gameId, 2000);
}

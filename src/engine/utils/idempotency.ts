/**
 * Idempotency utilities for game event emission.
 * 
 * These helpers ensure that game events are not duplicated when a game
 * resumes after suspension (SuspenseError). This is critical for the
 * suspend/resume pattern used with AI providers.
 * 
 * KEY PRINCIPLE: Every side-effect (event emission) should be conditional
 * on its own history. The GameState.events is the single source of truth.
 */

import type { GameState } from '../GameState.js';
import type { GameEvent, Phase, AICallEvent } from '../types.js';

/** Callback type for emitting events */
export type EventEmitter = (event: GameEvent) => Promise<void>;

/**
 * Ensures a phase_start event exists for the given phase and round.
 * If it already exists (from a previous run before suspension), returns false.
 * If it doesn't exist, emits the event and returns true.
 * 
 * @param state Current game state
 * @param phase The phase to check/emit
 * @param emit Event emitter callback
 * @returns true if event was emitted, false if already existed
 */
export async function ensurePhaseStart(
  state: GameState,
  phase: Phase,
  emit: EventEmitter
): Promise<boolean> {
  const exists = state.events.some(e =>
    e.type === 'phase_start' &&
    e.phase === phase &&
    e.round === state.round
  );

  if (exists) {
    return false;
  }

  const event: GameEvent = {
    type: 'phase_start',
    phase,
    round: state.round,
    timestamp: Date.now(),
  };

  await emit(event);
  return true;
}

/**
 * Checks if a player has already completed a specific action in this round.
 * Used for single-action phases like voting.
 * 
 * @param state Current game state
 * @param playerId Player to check
 * @param phase Phase to check
 * @param actionType Action type to check for
 * @returns true if player has already acted
 */
export function hasPlayerActed(
  state: GameState,
  playerId: string,
  phase: Phase,
  actionType: AICallEvent['actionType']
): boolean {
  return state.events.some(e =>
    e.type === 'ai_call' &&
    e.playerId === playerId &&
    e.round === state.round &&
    e.phase === phase &&
    e.actionType === actionType
  );
}

/**
 * Counts how many times a player has acted in a specific phase/action this round.
 * Used for multi-round phases like day discussion where each player speaks
 * multiple times (once per discussion round).
 * 
 * @param state Current game state
 * @param playerId Player to check
 * @param phase Phase to check
 * @param actionType Action type to count
 * @returns Number of times player has acted
 */
export function countPlayerActions(
  state: GameState,
  playerId: string,
  phase: Phase,
  actionType: AICallEvent['actionType']
): number {
  return state.events.filter(e =>
    e.type === 'ai_call' &&
    e.playerId === playerId &&
    e.round === state.round &&
    e.phase === phase &&
    e.actionType === actionType
  ).length;
}

/**
 * Checks if a player should act in a multi-round discussion.
 * Returns true if the player has NOT yet spoken in the given discussion round.
 * 
 * @param state Current game state
 * @param playerId Player to check
 * @param phase Phase to check (day_discussion or night for mafia chat)
 * @param actionType Action type (discussion or mafia_discussion)
 * @param discussionRound The current discussion round (1-indexed)
 * @returns true if player should act, false if they already have
 */
export function shouldPlayerActInDiscussionRound(
  state: GameState,
  playerId: string,
  phase: Phase,
  actionType: 'discussion' | 'mafia_discussion',
  discussionRound: number
): boolean {
  const existingCount = countPlayerActions(state, playerId, phase, actionType);
  return existingCount < discussionRound;
}

/**
 * Gets the existing vote for a player in this round, if any.
 * Used to restore votes when resuming a partially-completed vote phase.
 * 
 * @param state Current game state
 * @param playerId Player to check
 * @param phase Phase to check (day_vote or night)
 * @returns The target player ID if vote exists, undefined otherwise
 */
export function getExistingVote(
  state: GameState,
  playerId: string,
  phase: Phase
): string | null | undefined {
  const voteEvent = state.events.find(e =>
    e.type === 'vote' &&
    e.voterId === playerId &&
    e.phase === phase &&
    e.round === state.round
  );

  if (voteEvent && voteEvent.type === 'vote') {
    return voteEvent.targetId;
  }
  return undefined;
}


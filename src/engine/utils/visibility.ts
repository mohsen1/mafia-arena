/**
 * State visibility utilities.
 * Determines what each player can see during the game.
 */

import { GameState } from '../GameState.js';
import type { Player, VisibleGameState, VisiblePlayer, VisibleDeadPlayer } from '../types.js';

/**
 * Options for getting visible state with multi-round discussion context.
 */
export interface VisibleStateOptions {
  /** Current discussion sub-round (1-indexed) */
  currentDiscussionRound?: number;
  /** Total discussion rounds for this phase */
  totalDiscussionRounds?: number;
}

/**
 * Get the visible game state for a specific player.
 * Players can only see appropriate information based on their role.
 * Town players cannot see mafia-only messages.
 */
export function getVisibleState(
  state: GameState,
  player: Player,
  options?: VisibleStateOptions
): VisibleGameState {
  const alivePlayers: VisiblePlayer[] = state.alivePlayers.map((p) => ({
    id: p.id,
    name: p.name,
    persona: p.persona,
  }));

  const deadPlayers: VisibleDeadPlayer[] = state.deadPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team, // Roles are revealed on death
    persona: p.persona,
  }));

  // Mafia can see their teammates
  const teammates =
    player.team === 'mafia'
      ? state.aliveMafia
          .filter((p) => p.id !== player.id)
          .map((p) => p.id)
      : undefined;

  // Filter conversation history by visibility
  // Town only sees public messages, Mafia sees public messages in conversationHistory
  const publicHistory = state.getCurrentRoundPublicConversation();

  // Mafia also gets access to their private strategy chat
  const mafiaHistory =
    player.team === 'mafia'
      ? state.getCurrentRoundMafiaConversation()
      : undefined;

  return {
    round: state.round,
    phase: state.phase,
    alivePlayers,
    deadPlayers,
    conversationHistory: publicHistory,
    mafiaHistory,
    teammates,
    currentDiscussionRound: options?.currentDiscussionRound,
    totalDiscussionRounds: options?.totalDiscussionRounds,
  };
}

/**
 * Get list of valid kill targets for mafia.
 * Returns only alive town members.
 */
export function getValidKillTargets(state: GameState): readonly Player[] {
  return state.aliveTown;
}

/**
 * Get list of valid elimination vote targets.
 * Returns all alive players (you can't vote for yourself in elimination).
 */
export function getValidEliminationTargets(
  state: GameState,
  voterId: string
): readonly Player[] {
  return state.alivePlayers.filter((p) => p.id !== voterId);
}

/**
 * Format player list for prompt.
 */
export function formatPlayerList(players: readonly Player[]): string {
  return players.map((p) => `- ${p.name} (${p.id})`).join('\n');
}


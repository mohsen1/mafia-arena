/**
 * State visibility utilities.
 * Determines what each player can see during the game.
 */

import { GameState } from '../GameState.js';
import type { Player, VisibleGameState, VisiblePlayer, VisibleDeadPlayer } from '../types.js';

/**
 * Get the visible game state for a specific player.
 * Players can only see appropriate information based on their role.
 */
export function getVisibleState(state: GameState, player: Player): VisibleGameState {
  const alivePlayers: VisiblePlayer[] = state.alivePlayers.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  const deadPlayers: VisibleDeadPlayer[] = state.deadPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team, // Roles are revealed on death
  }));

  // Mafia can see their teammates
  const teammates =
    player.team === 'mafia'
      ? state.aliveMafia
          .filter((p) => p.id !== player.id)
          .map((p) => p.id)
      : undefined;

  return {
    round: state.round,
    phase: state.phase,
    alivePlayers,
    deadPlayers,
    conversationHistory: state.getCurrentRoundConversation(),
    teammates,
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


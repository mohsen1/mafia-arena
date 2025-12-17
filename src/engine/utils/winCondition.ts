/**
 * Win condition checking.
 */

import type { GameState } from '../GameState.js';
import type { Team } from '../types.js';

/**
 * Check if the game has ended and return the winning team.
 * Returns null if the game should continue.
 *
 * Win conditions:
 * - Mafia wins: When mafia count >= town count
 * - Town wins: When all mafia are eliminated
 */
export function checkWinCondition(state: GameState): Team | null {
  const mafiaCount = state.aliveMafia.length;
  const townCount = state.aliveTown.length;

  // Town wins when all mafia are eliminated
  if (mafiaCount === 0) {
    return 'town';
  }

  // Mafia wins when they equal or outnumber town
  // This is because mafia can coordinate to guarantee victory
  if (mafiaCount >= townCount) {
    return 'mafia';
  }

  // Game continues
  return null;
}

/**
 * Get a human-readable explanation of the win condition.
 */
export function explainWinCondition(state: GameState, winner: Team): string {
  const mafiaCount = state.aliveMafia.length;
  const townCount = state.aliveTown.length;

  if (winner === 'town') {
    return 'All Mafia members have been eliminated. Town wins!';
  }

  if (mafiaCount === townCount) {
    return `Mafia (${mafiaCount}) equals Town (${townCount}). Mafia wins by majority!`;
  }

  return `Mafia (${mafiaCount}) outnumbers Town (${townCount}). Mafia wins!`;
}


/**
 * Shared game utilities for player sorting and display.
 */

import type { PlayerInfo } from '~/lib/game-types';

/**
 * Sorts players: Mafia first, then by Alive status, then alphabetically.
 */
export function sortPlayers(players: PlayerInfo[]): PlayerInfo[] {
  return [...players].sort((a, b) => {
    if (a.team !== b.team) return a.team === 'mafia' ? -1 : 1;
    if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
    return a.playerName.localeCompare(b.playerName);
  });
}


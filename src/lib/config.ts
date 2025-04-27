// import type { Role /*, GameSettings */ } from "./types/game"; // OLD IMPORT
import { RoleName } from "./engine/interfaces/IRole"; // NEW IMPORT (Use regular import for enum values)

// Define some default settings for creating a new game
export const DEFAULT_GAME_SETTINGS = {
  // Use RoleName enum keys
  roleDistribution: {
    [RoleName.Mafia]: 2, // Changed Werewolf to Mafia to match engine RoleName enum
    [RoleName.Seer]: 1,
    [RoleName.Doctor]: 1,
    [RoleName.Villager]: 5,
  } as Record<RoleName, number>, // Explicitly type
  discussionRoundsPerPlayer: 1, // TBD how to implement discussion rounds fully
  aiModel: process.env.OPENAI_MODEL || "gemma2-9b-it", // Default model
};

/**
 * Calculates the total number of players from a role distribution.
 * @param roleDistribution A record mapping roles to counts.
 * @returns The total number of players.
 */
export function calculateNumPlayers(
  roleDistribution: Readonly<Record<RoleName, number>>, // Use RoleName
): number {
  return Object.values(roleDistribution).reduce((sum, count) => sum + count, 0);
}

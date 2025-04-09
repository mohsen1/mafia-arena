import { GameSettings, Role } from "@/lib/types/game";

// Define some default settings for creating a new game
export const DEFAULT_GAME_SETTINGS = {
  roleDistribution: {
    Werewolf: 2,
    Seer: 1,
    Doctor: 1,
    Villager: 5,
  },
  discussionRoundsPerPlayer: 1, // TBD how to implement discussion rounds fully
  aiModel: process.env.OPENAI_MODEL || "gemma2-9b-it", // Default model
};

/**
 * Calculates the total number of players from a role distribution.
 * @param roleDistribution A record mapping roles to counts.
 * @returns The total number of players.
 */
export function calculateNumPlayers(
  roleDistribution: Readonly<Record<Role, number>>,
): number {
  return Object.values(roleDistribution).reduce((sum, count) => sum + count, 0);
}

import { RoleName } from "./engine/interfaces/IRole";

// Define some default settings for creating a new game
export const DEFAULT_GAME_SETTINGS = {
  roleDistribution: {
    [RoleName.Mafia]: 2,
    [RoleName.Seer]: 1,
    [RoleName.Doctor]: 1,
    [RoleName.Villager]: 5,
  } as Record<RoleName, number>,
  discussionRoundsPerPlayer: 1,
  aiModel: process.env.OPENAI_MODEL || "gemma2-9b-it",
};

/**
 * Calculates the total number of players from a role distribution.
 * @param roleDistribution A record mapping roles to counts.
 * @returns The total number of players.
 */
export function calculateNumPlayers(
  roleDistribution: Readonly<Record<RoleName, number>>,
): number {
  return Object.values(roleDistribution).reduce((sum, count) => sum + count, 0);
}

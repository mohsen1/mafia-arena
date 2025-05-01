/**
 * Utility functions for the Mafia game
 */

import type { IRole } from "../interfaces/IRole";
import { MafiaRole } from "../roles/MafiaRole";
import { DoctorRole } from "../roles/DoctorRole";
import { SeerRole } from "../roles/SeerRole";
import { VillagerRole } from "../roles/VillagerRole";

/**
 * Wait for a specified number of milliseconds
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after the specified time
 */
export const delay = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Choose a random element from an array
 * @param array The array to select from
 * @returns A random element from the array, or undefined if array is empty
 */
export function getRandomElement<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Shuffle an array in-place using Fisher-Yates algorithm
 * @param array The array to shuffle
 * @returns The same array, shuffled
 */
export function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Assigns roles to players based on the total player count.
 * Ensures a basic distribution (e.g., Mafia, Doctor, Seer, Villagers).
 * Shuffles the roles randomly.
 *
 * @param playerCount The total number of players in the game.
 * @returns An array of IRole instances, shuffled.
 * @throws Error if role assignment logic results in negative villagers or fewer than 3 players.
 */
export function assignRoles(playerCount: number): IRole[] {
    if (playerCount < 3) {
        throw new Error("Cannot assign roles for fewer than 3 players.");
    }
    const rolesToAssign: IRole[] = [];
    // Example distribution: Adjust ratios as needed for balance
    const mafiaCount = Math.max(1, Math.floor(playerCount / 3.5)); 
    const doctorCount = playerCount >= 5 ? 1 : 0;
    const seerCount = playerCount >= 4 ? 1 : 0;
    const villagerCount = playerCount - mafiaCount - doctorCount - seerCount;

    if (villagerCount < 0) {
        throw new Error(`Role assignment error: Negative villager count (${villagerCount}) for ${playerCount} players.`);
    }
    
    for (let i = 0; i < mafiaCount; i++) rolesToAssign.push(new MafiaRole());
    if (doctorCount > 0) rolesToAssign.push(new DoctorRole());
    if (seerCount > 0) rolesToAssign.push(new SeerRole());
    for (let i = 0; i < villagerCount; i++) rolesToAssign.push(new VillagerRole());
    
    // Shuffle roles for randomness
    for (let i = rolesToAssign.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rolesToAssign[i], rolesToAssign[j]] = [rolesToAssign[j], rolesToAssign[i]];
    }
    
    return rolesToAssign;
}

// Add other utility functions here as needed

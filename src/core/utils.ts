/**
 * Utility functions for the Mafia game
 */

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

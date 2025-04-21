"use strict";
/**
 * Utility functions for the Mafia game
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.delay = void 0;
exports.getRandomElement = getRandomElement;
exports.shuffleArray = shuffleArray;
/**
 * Wait for a specified number of milliseconds
 * @param ms Milliseconds to wait
 * @returns Promise that resolves after the specified time
 */
const delay = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
exports.delay = delay;
/**
 * Choose a random element from an array
 * @param array The array to select from
 * @returns A random element from the array, or undefined if array is empty
 */
function getRandomElement(array) {
    if (array.length === 0)
        return undefined;
    return array[Math.floor(Math.random() * array.length)];
}
/**
 * Shuffle an array in-place using Fisher-Yates algorithm
 * @param array The array to shuffle
 * @returns The same array, shuffled
 */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

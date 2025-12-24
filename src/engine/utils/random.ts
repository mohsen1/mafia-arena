/**
 * Seeded Random Number Generator for reproducible games.
 * Uses a simple but effective mulberry32 algorithm.
 * 
 * This is critical for benchmark validity - researchers must be able
 * to replay exact games given the same seed.
 */

/**
 * Random number generator interface for dependency injection.
 */
export interface RandomGenerator {
  /** Returns a random number in [0, 1) */
  random(): number;
  /** Returns a random integer in [0, max) */
  randomInt(max: number): number;
  /** Shuffles an array in place using Fisher-Yates */
  shuffle<T>(array: T[]): T[];
  /** Returns a new shuffled copy of the array */
  shuffled<T>(array: readonly T[]): T[];
}

/**
 * Create a random number generator.
 * 
 * @param seed - Optional seed for deterministic output. If omitted, uses Math.random().
 * @returns A RandomGenerator instance
 */
export function createRNG(seed?: number): RandomGenerator {
  // Create the base random function
  const random = seed !== undefined 
    ? mulberry32(seed) 
    : () => Math.random();
  
  return {
    random,
    
    randomInt(max: number): number {
      return Math.floor(random() * max);
    },
    
    shuffle<T>(array: T[]): T[] {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j]!, array[i]!];
      }
      return array;
    },
    
    shuffled<T>(array: readonly T[]): T[] {
      const result = [...array];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    },
  };
}

/**
 * Create a seeded random number generator using mulberry32 algorithm.
 * Returns a function that produces deterministic random numbers [0, 1).
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  
  return function (): number {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a random seed from current time and Math.random().
 */
export function generateSeed(): number {
  return Math.floor(Date.now() * Math.random()) | 0;
}

// Legacy exports for backward compatibility
/** @deprecated Use createRNG(seed) instead */
export const createSeededRandom = (seed: number) => createRNG(seed).random;

/** @deprecated Use createRNG(seed) instead */
export const createRandomGenerator = (seed: number) => createRNG(seed);

/** @deprecated Use createRNG() instead */
export const createDefaultRandomGenerator = () => createRNG();

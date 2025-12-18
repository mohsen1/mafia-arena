/**
 * Seeded Random Number Generator for reproducible games.
 * Uses a simple but effective mulberry32 algorithm.
 * 
 * This is critical for benchmark validity - researchers must be able
 * to replay exact games given the same seed.
 */

/**
 * Create a seeded random number generator.
 * Returns a function that produces deterministic random numbers [0, 1).
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed;
  
  return function mulberry32(): number {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
 * Create a random generator from a seed.
 */
export function createRandomGenerator(seed: number): RandomGenerator {
  const random = createSeededRandom(seed);
  
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
 * Create a random generator using Math.random() (non-deterministic).
 * Used when no seed is provided for backward compatibility.
 */
export function createDefaultRandomGenerator(): RandomGenerator {
  return {
    random: () => Math.random(),
    
    randomInt(max: number): number {
      return Math.floor(Math.random() * max);
    },
    
    shuffle<T>(array: T[]): T[] {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j]!, array[i]!];
      }
      return array;
    },
    
    shuffled<T>(array: readonly T[]): T[] {
      const result = [...array];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j]!, result[i]!];
      }
      return result;
    },
  };
}

/**
 * Generate a random seed from current time and Math.random().
 */
export function generateSeed(): number {
  return Math.floor(Date.now() * Math.random()) | 0;
}


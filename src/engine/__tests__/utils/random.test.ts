/**
 * Tests for seeded random number generator.
 * Critical for benchmark reproducibility.
 */

import { describe, it, expect } from 'vitest';
import { 
  createSeededRandom, 
  createRandomGenerator, 
  createDefaultRandomGenerator,
  generateSeed 
} from '../../utils/random.js';

describe('Seeded Random Number Generator', () => {
  describe('createSeededRandom', () => {
    it('should produce deterministic results with same seed', () => {
      const seed = 12345;
      const rng1 = createSeededRandom(seed);
      const rng2 = createSeededRandom(seed);

      // Generate 10 numbers from each
      const results1 = Array.from({ length: 10 }, () => rng1());
      const results2 = Array.from({ length: 10 }, () => rng2());

      expect(results1).toEqual(results2);
    });

    it('should produce different results with different seeds', () => {
      const rng1 = createSeededRandom(12345);
      const rng2 = createSeededRandom(54321);

      const results1 = Array.from({ length: 10 }, () => rng1());
      const results2 = Array.from({ length: 10 }, () => rng2());

      expect(results1).not.toEqual(results2);
    });

    it('should produce values in [0, 1) range', () => {
      const rng = createSeededRandom(42);
      
      for (let i = 0; i < 1000; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should produce uniform distribution', () => {
      const rng = createSeededRandom(12345);
      const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      
      for (let i = 0; i < 10000; i++) {
        const value = rng();
        const bucket = Math.floor(value * 10);
        buckets[bucket]!++;
      }

      // Each bucket should have roughly 1000 values (10%)
      // Allow 15% deviation
      for (const count of buckets) {
        expect(count).toBeGreaterThan(850);
        expect(count).toBeLessThan(1150);
      }
    });
  });

  describe('createRandomGenerator', () => {
    it('should create a generator with all methods', () => {
      const rng = createRandomGenerator(12345);
      
      expect(typeof rng.random).toBe('function');
      expect(typeof rng.randomInt).toBe('function');
      expect(typeof rng.shuffle).toBe('function');
      expect(typeof rng.shuffled).toBe('function');
    });

    it('randomInt should produce values in [0, max) range', () => {
      const rng = createRandomGenerator(12345);
      
      for (let max = 1; max <= 10; max++) {
        for (let i = 0; i < 100; i++) {
          const value = rng.randomInt(max);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(max);
          expect(Number.isInteger(value)).toBe(true);
        }
      }
    });

    it('shuffle should produce deterministic results', () => {
      const rng1 = createRandomGenerator(12345);
      const rng2 = createRandomGenerator(12345);
      
      const arr1 = [1, 2, 3, 4, 5];
      const arr2 = [1, 2, 3, 4, 5];
      
      rng1.shuffle(arr1);
      rng2.shuffle(arr2);
      
      expect(arr1).toEqual(arr2);
    });

    it('shuffle should modify array in place', () => {
      const rng = createRandomGenerator(12345);
      const original = [1, 2, 3, 4, 5];
      const arr = [...original];
      
      const result = rng.shuffle(arr);
      
      expect(result).toBe(arr); // Same reference
      // Check that it's actually shuffled (extremely unlikely to be same order with seed 12345)
      expect(arr).not.toEqual(original);
      // Check all elements are present
      expect(arr.sort()).toEqual(original.sort());
    });

    it('shuffled should return new array', () => {
      const rng = createRandomGenerator(12345);
      const original = [1, 2, 3, 4, 5];
      const arr = [1, 2, 3, 4, 5];
      
      const result = rng.shuffled(arr);
      
      expect(result).not.toBe(arr); // Different reference
      expect(arr).toEqual(original); // Original unchanged
      // Check all elements are present
      expect([...result].sort()).toEqual(original);
    });

    it('shuffled should produce deterministic results', () => {
      const rng1 = createRandomGenerator(42);
      const rng2 = createRandomGenerator(42);
      
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      const result1 = rng1.shuffled(arr);
      const result2 = rng2.shuffled(arr);
      
      expect(result1).toEqual(result2);
    });
  });

  describe('createDefaultRandomGenerator', () => {
    it('should create a working generator', () => {
      const rng = createDefaultRandomGenerator();
      
      // Should produce valid values
      const value = rng.random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      
      const intValue = rng.randomInt(10);
      expect(intValue).toBeGreaterThanOrEqual(0);
      expect(intValue).toBeLessThan(10);
    });

    it('should produce non-deterministic results', () => {
      const rng1 = createDefaultRandomGenerator();
      const rng2 = createDefaultRandomGenerator();
      
      // Generate many values - extremely unlikely to be identical
      const results1 = Array.from({ length: 100 }, () => rng1.random());
      const results2 = Array.from({ length: 100 }, () => rng2.random());
      
      expect(results1).not.toEqual(results2);
    });
  });

  describe('generateSeed', () => {
    it('should return a number', () => {
      const seed = generateSeed();
      expect(typeof seed).toBe('number');
    });

    it('should return an integer', () => {
      const seed = generateSeed();
      expect(Number.isInteger(seed)).toBe(true);
    });

    it('should produce different seeds on subsequent calls', () => {
      const seeds = new Set<number>();
      
      for (let i = 0; i < 100; i++) {
        seeds.add(generateSeed());
      }
      
      // At least 90 unique seeds out of 100 (allows for rare collisions)
      expect(seeds.size).toBeGreaterThan(90);
    });
  });
});

describe('Reproducibility', () => {
  it('should allow exact game replay with same seed', () => {
    const seed = 12345;
    
    // Simulate a game sequence
    function simulateGameSequence(gameSeed: number): string[] {
      const rng = createRandomGenerator(gameSeed);
      const players = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'];
      const events: string[] = [];
      
      // Shuffle players
      const shuffled = rng.shuffled(players);
      events.push(`Order: ${shuffled.join(', ')}`);
      
      // Simulate some votes
      for (let round = 0; round < 3; round++) {
        const roundOrder = rng.shuffled(shuffled);
        events.push(`Round ${round}: ${roundOrder.join(', ')}`);
        
        // Random target selection
        const targetIdx = rng.randomInt(shuffled.length);
        events.push(`Target: ${shuffled[targetIdx]}`);
      }
      
      return events;
    }
    
    const game1 = simulateGameSequence(seed);
    const game2 = simulateGameSequence(seed);
    
    expect(game1).toEqual(game2);
  });
});


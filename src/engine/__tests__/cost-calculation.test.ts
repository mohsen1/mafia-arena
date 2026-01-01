/**
 * Unit tests for cost calculation and batch discounts.
 * 
 * Tests the cost accuracy fixes from Plan 14:
 * - calculateExactCost function
 * - Per-participant batch discount logic
 * - Conservative batch discount estimation
 */

import { describe, it, expect } from 'vitest';
import { calculateExactCost, type ModelPricing } from '../../worker/utils/budget.js';
// estimateCost requires DB access - tested in e2e tests
// import { estimateCost } from '../../worker/batch/service.js';
import { BATCH_PROVIDER_MAP, CONSERVATIVE_BATCH_DISCOUNT } from '../../worker/services/ModelRegistry.js';
// import type { BatchConfig } from '../../worker/types.js';

describe('Cost Calculation', () => {
  describe('calculateExactCost', () => {
    it('should calculate cost correctly with standard pricing', () => {
      const pricing: ModelPricing = { input: 0.001, output: 0.003 };
      const cost = calculateExactCost(1000, 500, pricing);
      
      // 1000 input tokens * 0.001/1K + 500 output tokens * 0.003/1K
      // = 1 * 0.001 + 0.5 * 0.003 = 0.001 + 0.0015 = 0.0025
      expect(cost).toBeCloseTo(0.0025);
    });

    it('should calculate cost correctly with expensive model pricing', () => {
      // Claude 3 Opus pricing: $15/1M input, $75/1M output
      const pricing: ModelPricing = { input: 0.015, output: 0.075 };
      const cost = calculateExactCost(100_000, 10_000, pricing);
      
      // 100K input * 0.015/1K + 10K output * 0.075/1K
      // = 100 * 0.015 + 10 * 0.075 = 1.5 + 0.75 = 2.25
      expect(cost).toBeCloseTo(2.25);
    });

    it('should handle zero tokens', () => {
      const pricing: ModelPricing = { input: 0.001, output: 0.003 };
      const cost = calculateExactCost(0, 0, pricing);
      expect(cost).toBe(0);
    });

    it('should handle zero pricing (free models)', () => {
      const pricing: ModelPricing = { input: 0, output: 0 };
      const cost = calculateExactCost(100_000, 50_000, pricing);
      expect(cost).toBe(0);
    });
  });

  describe('BATCH_PROVIDER_MAP', () => {
    it('should have correct discount for Anthropic (50%)', () => {
      const info = BATCH_PROVIDER_MAP['anthropic'];
      expect(info).toBeDefined();
      expect(info?.discount).toBe(50);
      expect(info?.provider).toBe('anthropic');
    });

    it('should have correct discount for OpenAI (50%)', () => {
      const info = BATCH_PROVIDER_MAP['openai'];
      expect(info).toBeDefined();
      expect(info?.discount).toBe(50);
      expect(info?.provider).toBe('openai');
    });

    it('should have correct discount for Google (50%)', () => {
      const info = BATCH_PROVIDER_MAP['google'];
      expect(info).toBeDefined();
      expect(info?.discount).toBe(50);
      expect(info?.provider).toBe('google');
    });

    it('should have correct discount for Fireworks (40%)', () => {
      const info = BATCH_PROVIDER_MAP['fireworks'];
      expect(info).toBeDefined();
      expect(info?.discount).toBe(40);
      expect(info?.provider).toBe('fireworks');
    });

    it('should have conservative discount set to 40 (Fireworks = lowest)', () => {
      expect(CONSERVATIVE_BATCH_DISCOUNT).toBe(40);
    });
  });

  describe('Batch Discount Application Logic', () => {
    it('should apply 50% discount for Anthropic batch pricing', () => {
      const basePricing: ModelPricing = { input: 0.015, output: 0.075 };
      const discount = BATCH_PROVIDER_MAP['anthropic']!.discount;
      const discountMultiplier = 1 - (discount / 100);
      
      const discountedPricing: ModelPricing = {
        input: basePricing.input * discountMultiplier,
        output: basePricing.output * discountMultiplier,
      };
      
      expect(discountedPricing.input).toBeCloseTo(0.0075); // 50% off
      expect(discountedPricing.output).toBeCloseTo(0.0375); // 50% off
      
      const baseCost = calculateExactCost(100_000, 10_000, basePricing);
      const discountedCost = calculateExactCost(100_000, 10_000, discountedPricing);
      
      expect(discountedCost).toBeCloseTo(baseCost * 0.5);
    });

    it('should apply 40% discount for Fireworks batch pricing', () => {
      const basePricing: ModelPricing = { input: 0.001, output: 0.003 };
      const discount = BATCH_PROVIDER_MAP['fireworks']!.discount;
      const discountMultiplier = 1 - (discount / 100);
      
      const discountedPricing: ModelPricing = {
        input: basePricing.input * discountMultiplier,
        output: basePricing.output * discountMultiplier,
      };
      
      expect(discountedPricing.input).toBeCloseTo(0.0006); // 40% off
      expect(discountedPricing.output).toBeCloseTo(0.0018); // 40% off
      
      const baseCost = calculateExactCost(100_000, 10_000, basePricing);
      const discountedCost = calculateExactCost(100_000, 10_000, discountedPricing);
      
      expect(discountedCost).toBeCloseTo(baseCost * 0.6);
    });
  });

  // estimateCost requires DB/env access - tested in e2e tests instead
  describe.skip('estimateCost', () => {
    const createMockConfig = (overrides: Partial<unknown> = {}): unknown => ({
      name: 'Test Batch',
      totalGames: 10,
      gameConfig: {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        contextLevel: 'windowed',
        personaConstraints: 'moderate',
      },
      createdBy: 'test-user',
      userId: 'user-123',
      ...overrides,
    });

    it('should return higher cost for non-batch games', () => {
      const configNoBatch = createMockConfig({ useBatchAPI: false });
      const configBatch = createMockConfig({ useBatchAPI: true });
      
      const estimateNoBatch = estimateCost(configNoBatch);
      const estimateBatch = estimateCost(configBatch);
      
      // Batch should be cheaper (40% discount = 60% of original)
      expect(estimateBatch.estimatedCostUsd).toBeLessThan(estimateNoBatch.estimatedCostUsd);
    });

    it('should apply conservative 40% discount for batch games', () => {
      const configNoBatch = createMockConfig({ useBatchAPI: false });
      const configBatch = createMockConfig({ useBatchAPI: true });
      
      const estimateNoBatch = estimateCost(configNoBatch);
      const estimateBatch = estimateCost(configBatch);
      
      // With 40% discount, batch cost should be 60% of non-batch
      const expectedRatio = 1 - (CONSERVATIVE_BATCH_DISCOUNT / 100);
      const actualRatio = estimateBatch.estimatedCostUsd / estimateNoBatch.estimatedCostUsd;
      
      expect(actualRatio).toBeCloseTo(expectedRatio);
    });

    it('should track useBatchAPI flag in returned estimate', () => {
      const configNoBatch = createMockConfig({ useBatchAPI: false });
      const configBatch = createMockConfig({ useBatchAPI: true });
      
      expect(estimateCost(configNoBatch).useBatchAPI).toBe(false);
      expect(estimateCost(configBatch).useBatchAPI).toBe(true);
    });

    it('should scale cost with total games', () => {
      const config10 = createMockConfig({ totalGames: 10 });
      const config100 = createMockConfig({ totalGames: 100 });
      
      const estimate10 = estimateCost(config10);
      const estimate100 = estimateCost(config100);
      
      // 100 games should be ~10x the cost of 10 games
      expect(estimate100.estimatedCostUsd / estimate10.estimatedCostUsd).toBeCloseTo(10);
    });

    it('should increase estimate for discussion-enabled games', () => {
      const configNoDiscussion = createMockConfig({
        gameConfig: {
          ...createMockConfig().gameConfig,
          discussionEnabled: false,
        },
      });
      const configWithDiscussion = createMockConfig({
        gameConfig: {
          ...createMockConfig().gameConfig,
          discussionEnabled: true,
        },
      });
      
      const estimateNoDiscussion = estimateCost(configNoDiscussion);
      const estimateWithDiscussion = estimateCost(configWithDiscussion);
      
      // Discussion enabled should cost more
      expect(estimateWithDiscussion.estimatedCostUsd).toBeGreaterThan(
        estimateNoDiscussion.estimatedCostUsd
      );
    });
  });
});


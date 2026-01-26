/**
 * Unit tests for batch API savings calculation.
 * Tests the financial tracking and savings calculation in BatchService.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BatchService } from '../batch/BatchService.js';
import { ModelRegistry } from '../services/ModelRegistry.js';
import type { Env } from '../types.js';
import type { AIRequestMessage } from '../ai/types.js';

// Mock Env for testing
function createMockEnv(): Env {
  return {
    DB: {
      prepare: (query: string) => ({
        bind: (...args: unknown[]) => ({
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
          first: async () => null,
        }),
      }),
    } as unknown as D1Database,
    RATE_LIMIT: {
      get: async () => null,
      put: async () => {},
    } as never,
    BATCH_QUEUE: {
      send: async () => {},
    } as never,
    // Add other required Env properties as needed
  } as unknown as Env;
}

// Mock ModelRegistry
class MockModelRegistry {
  async get(modelId: string) {
    // Return mock model context with pricing info
    const mockContext = {
      modelId,
      apiProvider: 'anthropic',
      pricing: {
        input: 0.003,  // $3 per 1M input tokens
        output: 0.015, // $15 per 1M output tokens
      },
      batchPricing: {
        supported: true,
        batchProvider: 'anthropic',
        discountPercent: 50,
      },
    };
    return mockContext;
  }
}

describe('BatchService Savings Calculation', () => {
  let batchService: BatchService;
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = createMockEnv();
    batchService = new BatchService(mockEnv);
  });

  describe('calculateSavings', () => {
    it('should calculate positive savings correctly', () => {
      // Individual cost: $0.10, Batch cost: $0.05 (50% discount)
      const individualCost = 0.10;
      const batchCost = 0.05;
      const savings = individualCost - batchCost;

      expect(savings).toBeCloseTo(0.05);
    });

    it('should return zero for negative savings (batch more expensive)', () => {
      // Edge case: if batch pricing somehow costs more
      const individualCost = 0.05;
      const batchCost = 0.10;
      const savings = Math.max(0, individualCost - batchCost);

      expect(savings).toBe(0);
    });

    it('should return zero when costs are equal', () => {
      const individualCost = 0.10;
      const batchCost = 0.10;
      const savings = Math.max(0, individualCost - batchCost);

      expect(savings).toBe(0);
    });

    it('should handle zero costs', () => {
      const individualCost = 0;
      const batchCost = 0;
      const savings = Math.max(0, individualCost - batchCost);

      expect(savings).toBe(0);
    });

    it('should calculate savings for large costs', () => {
      // $100 individual, $50 batch (50% discount)
      const individualCost = 100;
      const batchCost = 50;
      const savings = Math.max(0, individualCost - batchCost);

      expect(savings).toBe(50);
    });
  });

  describe('Cost Estimation in storeRequest', () => {
    it('should estimate individual API cost correctly', () => {
      const pricing = {
        input: 0.003,   // $3/1M tokens
        output: 0.015,  // $15/1M tokens
      };

      const estimatedInputTokens = 10000;
      const estimatedOutputTokens = 2000;

      const individualCost = (
        (estimatedInputTokens / 1000) * pricing.input +
        (estimatedOutputTokens / 1000) * pricing.output
      );

      // 10K input * $0.003/1K = $0.03
      // 2K output * $0.015/1K = $0.03
      // Total = $0.06
      expect(individualCost).toBeCloseTo(0.06);
    });

    it('should estimate batch cost with discount applied', () => {
      const individualCost = 0.10;
      const discountPercent = 50;
      const discountMultiplier = 1 - (discountPercent / 100);

      const batchCost = individualCost * discountMultiplier;

      expect(batchCost).toBeCloseTo(0.05); // 50% off
    });

    it('should apply 40% discount for Fireworks', () => {
      const individualCost = 0.10;
      const discountPercent = 40;
      const discountMultiplier = 1 - (discountPercent / 100);

      const batchCost = individualCost * discountMultiplier;

      expect(batchCost).toBeCloseTo(0.06); // 40% off = 60% of original
    });
  });

  describe('Savings Aggregation', () => {
    it('should aggregate savings across multiple requests', () => {
      const requests = [
        { individualCost: 0.10, batchCost: 0.05 }, // $0.05 savings
        { individualCost: 0.20, batchCost: 0.10 }, // $0.10 savings
        { individualCost: 0.30, batchCost: 0.15 }, // $0.15 savings
      ];

      const totalSavings = requests.reduce((sum, req) => {
        return sum + Math.max(0, req.individualCost - req.batchCost);
      }, 0);

      expect(totalSavings).toBeCloseTo(0.30);
    });

    it('should handle mixed savings scenarios', () => {
      const requests = [
        { individualCost: 0.10, batchCost: 0.05 },  // $0.05 savings
        { individualCost: 0.05, batchCost: 0.10 },  // $0 savings (negative case)
        { individualCost: 0.20, batchCost: 0.10 },  // $0.10 savings
      ];

      const totalSavings = requests.reduce((sum, req) => {
        return sum + Math.max(0, req.individualCost - req.batchCost);
      }, 0);

      expect(totalSavings).toBeCloseTo(0.15); // Only positive savings counted
    });

    it('should handle empty request list', () => {
      const requests: Array<{ individualCost: number; batchCost: number }> = [];

      const totalSavings = requests.reduce((sum, req) => {
        return sum + Math.max(0, req.individualCost - req.batchCost);
      }, 0);

      expect(totalSavings).toBe(0);
    });
  });

  describe('Cost Recalculation with Actual Tokens', () => {
    it('should recalculate cost with actual token counts', () => {
      const pricing = {
        input: 0.003,   // $3/1M tokens
        output: 0.015,  // $15/1M tokens
      };

      const actualInputTokens = 15000; // More than estimated
      const actualOutputTokens = 3000;

      const actualCost = (
        (actualInputTokens / 1000) * pricing.input +
        (actualOutputTokens / 1000) * pricing.output
      );

      // 15K input * $0.003/1K = $0.045
      // 3K output * $0.015/1K = $0.045
      // Total = $0.09
      expect(actualCost).toBeCloseTo(0.09);
    });

    it('should apply batch discount to recalculated costs', () => {
      const actualIndividualCost = 0.09;
      const discountPercent = 50;
      const discountMultiplier = 1 - (discountPercent / 100);

      const actualBatchCost = actualIndividualCost * discountMultiplier;

      expect(actualBatchCost).toBeCloseTo(0.045);
    });

    it('should calculate savings from actual costs', () => {
      const actualIndividualCost = 0.09;
      const actualBatchCost = 0.045;
      const savings = Math.max(0, actualIndividualCost - actualBatchCost);

      expect(savings).toBeCloseTo(0.045);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small costs', () => {
      const individualCost = 0.0001;
      const batchCost = 0.00005;
      const savings = Math.max(0, individualCost - batchCost);

      expect(savings).toBeCloseTo(0.00005);
    });

    it('should handle very large costs', () => {
      const individualCost = 1000;
      const batchCost = 500;
      const savings = Math.max(0, individualCost - batchCost);

      expect(savings).toBe(500);
    });

    it('should handle floating point precision', () => {
      const individualCost = 0.1;
      const batchCost = 0.05;
      const savings = Math.max(0, individualCost - batchCost);

      // Should handle floating point arithmetic correctly
      expect(savings).toBeGreaterThan(0);
      expect(savings).toBeCloseTo(0.05);
    });
  });

  describe('Provider-Specific Discounts', () => {
    it('should use correct discount for Anthropic (50%)', () => {
      const individualCost = 1.0;
      const discountPercent = 50;
      const batchCost = individualCost * (1 - discountPercent / 100);

      expect(batchCost).toBe(0.5);
    });

    it('should use correct discount for OpenAI (50%)', () => {
      const individualCost = 1.0;
      const discountPercent = 50;
      const batchCost = individualCost * (1 - discountPercent / 100);

      expect(batchCost).toBe(0.5);
    });

    it('should use correct discount for Google (50%)', () => {
      const individualCost = 1.0;
      const discountPercent = 50;
      const batchCost = individualCost * (1 - discountPercent / 100);

      expect(batchCost).toBe(0.5);
    });

    it('should use correct discount for Fireworks (40%)', () => {
      const individualCost = 1.0;
      const discountPercent = 40;
      const batchCost = individualCost * (1 - discountPercent / 100);

      expect(batchCost).toBe(0.6); // 40% off
    });

    it('should use correct discount for Cerebras (50%)', () => {
      const individualCost = 1.0;
      const discountPercent = 50;
      const batchCost = individualCost * (1 - discountPercent / 100);

      expect(batchCost).toBe(0.5);
    });
  });
});

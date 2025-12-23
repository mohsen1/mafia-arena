/**
 * Cost calculation utilities for AI API calls.
 * 
 * CANONICAL PRICING SOURCE: /api/models endpoint (worker/routes/models.ts)
 * 
 * Models and pricing are stored in the database and synced from OpenRouter.
 * This file provides FALLBACK defaults for quick client-side estimates only.
 * 
 * For accurate costs:
 * 1. Fetch /api/models to get per-model pricing and defaults.pricing
 * 2. Use the defaults.pricing from API response for unknown models
 * 
 * These hardcoded values should match worker/ai/models.ts DEFAULT_PRICING
 * to ensure consistency when API is unavailable.
 */

// Default pricing if model not found (per 1K tokens, USD)
// Must match: src/worker/ai/models.ts DEFAULT_PRICING
const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

// Default batch pricing (50% of standard default)
const DEFAULT_BATCH_PRICING = { input: 0.0005, output: 0.0015 };

/**
 * Calculate the cost of an AI API call using default pricing.
 */
export function calculateCost(
  modelId: string,
  tokens: { input: number; output: number }
): number {
  const pricing = DEFAULT_PRICING;
  return (tokens.input / 1000) * pricing.input + (tokens.output / 1000) * pricing.output;
}

/**
 * Calculate the cost of a batch AI API call (typically 50% cheaper).
 */
export function calculateBatchCost(
  modelId: string,
  tokens: { input: number; output: number }
): number {
  const pricing = DEFAULT_BATCH_PRICING;
  return (tokens.input / 1000) * pricing.input + (tokens.output / 1000) * pricing.output;
}

/**
 * Calculate cost from total tokens (rough estimate).
 */
export function calculateCostFromTotal(modelId: string, totalTokens: number): number {
  // Assume 70% input, 30% output ratio
  const inputTokens = totalTokens * 0.7;
  const outputTokens = totalTokens * 0.3;
  return calculateCost(modelId, { input: inputTokens, output: outputTokens });
}

/**
 * Format cost as a currency string.
 */
export function formatCost(cost: number): string {
  if (cost < 0.0001) {
    return 'FREE';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Get the pricing info for a model.
 * Returns default pricing - for accurate pricing, fetch from /api/models.
 */
export function getModelPricing(modelId: string): { input: number; output: number } {
  return DEFAULT_PRICING;
}

/**
 * Get the batch pricing info for a model.
 */
export function getModelBatchPricing(modelId: string): { input: number; output: number } {
  return DEFAULT_BATCH_PRICING;
}

/**
 * Calculate total cost from a list of AI call events.
 */
export function calculateTotalCost(
  events: Array<{
    modelId: string;
    tokensUsed?: { input: number; output: number };
  }>
): number {
  return events.reduce((total, event) => {
    if (event.tokensUsed) {
      return total + calculateCost(event.modelId, event.tokensUsed);
    }
    return total;
  }, 0);
}

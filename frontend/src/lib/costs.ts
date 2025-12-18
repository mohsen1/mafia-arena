/**
 * Cost calculation utilities for AI API calls.
 */

// Cost per 1K tokens by model (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
};

// Default pricing if model not found
const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

/**
 * Calculate the cost of an AI API call.
 */
export function calculateCost(
  modelId: string,
  tokens: { input: number; output: number }
): number {
  const pricing = PRICING[modelId] || DEFAULT_PRICING;
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
    return '<$0.0001';
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Get the pricing info for a model.
 */
export function getModelPricing(modelId: string): { input: number; output: number } {
  return PRICING[modelId] || DEFAULT_PRICING;
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


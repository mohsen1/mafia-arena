/**
 * Cost calculation utilities for AI API calls.
 * Updated pricing from official docs - December 2025
 */

// Cost per 1K tokens by model (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI GPT-5.2 series (frontier models)
  'gpt-5.2': { input: 0.003, output: 0.012 },
  'gpt-5.2-pro': { input: 0.006, output: 0.024 },
  'gpt-5-mini': { input: 0.0003, output: 0.0012 },
  'gpt-5-nano': { input: 0.0001, output: 0.0004 },

  // Anthropic Claude 4.5 series
  'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001': { input: 0.001, output: 0.005 },
  'claude-opus-4-5-20251101': { input: 0.005, output: 0.025 },

  // Google Gemini 3.x series (preview)
  'gemini-3-pro-preview': { input: 0.00125, output: 0.005 },
  'gemini-3-flash-preview': { input: 0.0003, output: 0.0012 },

  // Google Gemini 2.5 series
  'gemini-2.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
  'gemini-2.5-flash-lite': { input: 0.0001, output: 0.0004 },

  // Google Gemini 2.0 series
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
  'gemini-2.0-flash-lite': { input: 0.00005, output: 0.0002 },
};

// Default pricing if model not found
const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

// Batch API pricing per 1K tokens (USD) - typically 50% discount
const BATCH_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI GPT-5.2 Batch API (50% discount)
  'gpt-5.2': { input: 0.0015, output: 0.006 },
  'gpt-5.2-pro': { input: 0.003, output: 0.012 },
  'gpt-5-mini': { input: 0.00015, output: 0.0006 },
  'gpt-5-nano': { input: 0.00005, output: 0.0002 },

  // Anthropic Claude 4.5 Batch (~50% discount)
  'claude-sonnet-4-5-20250929': { input: 0.0015, output: 0.0075 },
  'claude-haiku-4-5-20251001': { input: 0.0005, output: 0.0025 },
  'claude-opus-4-5-20251101': { input: 0.0025, output: 0.0125 },

  // Google Gemini 3.x Batch (~50% discount)
  'gemini-3-pro-preview': { input: 0.000625, output: 0.0025 },
  'gemini-3-flash-preview': { input: 0.00015, output: 0.0006 },

  // Google Gemini 2.5 Batch (~50% discount)
  'gemini-2.5-pro': { input: 0.000625, output: 0.0025 },
  'gemini-2.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.5-flash-lite': { input: 0.00005, output: 0.0002 },

  // Google Gemini 2.0 Batch (~50% discount)
  'gemini-2.0-flash': { input: 0.00005, output: 0.0002 },
  'gemini-2.0-flash-lite': { input: 0.000025, output: 0.0001 },
};

// Default batch pricing (50% of standard default)
const DEFAULT_BATCH_PRICING = { input: 0.0005, output: 0.0015 };

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
 * Calculate the cost of a batch AI API call (typically 50% cheaper).
 */
export function calculateBatchCost(
  modelId: string,
  tokens: { input: number; output: number }
): number {
  const pricing = BATCH_PRICING[modelId] || DEFAULT_BATCH_PRICING;
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
 * Get the batch pricing info for a model.
 */
export function getModelBatchPricing(modelId: string): { input: number; output: number } {
  return BATCH_PRICING[modelId] || DEFAULT_BATCH_PRICING;
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

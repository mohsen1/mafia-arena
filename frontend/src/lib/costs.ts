/**
 * Cost calculation utilities for AI API calls.
 * 
 * NOTE: This file should be kept in sync with src/worker/ai/models.ts
 * in the worker directory. For a more robust solution, fetch pricing
 * from /api/models at runtime.
 */

// Cost per 1K tokens by model (USD)
const PRICING: Record<string, { input: number; output: number }> = {
  // Amazon Nova
  'amazon/nova-2-lite-v1': { input: 0.00006, output: 0.00024 },
  'amazon/nova-lite-v1': { input: 0.00006, output: 0.00024 },
  'amazon/nova-premier-v1': { input: 0.003, output: 0.012 },
  'amazon/nova-pro-v1': { input: 0.0008, output: 0.0032 },

  // Anthropic Claude
  'anthropic/claude-sonnet-4.5': { input: 0.015, output: 0.075 },

  // Google Gemini
  'google/gemini-2.5-flash-lite-preview-09-2025': { input: 0.000075, output: 0.0003 },
  'google/gemini-2.5-flash-preview-09-2025': { input: 0.00015, output: 0.0006 },
  'google/gemini-2.5-pro': { input: 0.00125, output: 0.005 },
  'google/gemini-2.5-pro-preview-05-06': { input: 0.00125, output: 0.005 },
  'google/gemini-3-flash-preview': { input: 0.000075, output: 0.0003 },
  'google/gemini-3-pro-preview': { input: 0.00125, output: 0.005 },

  // Meta Llama 4
  'meta-llama/llama-4-maverick': { input: 0.002, output: 0.006 },
  'meta-llama/llama-4-scout': { input: 0.0005, output: 0.0015 },

  // MiniMax
  'minimax/minimax-01': { input: 0.001, output: 0.001 },
  'minimax/minimax-m1': { input: 0.0005, output: 0.0005 },

  // Mistral
  'mistralai/devstral-2512': { input: 0.002, output: 0.006 },
  'mistralai/devstral-2512:free': { input: 0, output: 0 },
  'mistralai/ministral-14b-2512': { input: 0.0001, output: 0.0001 },
  'mistralai/ministral-8b-2512': { input: 0.00005, output: 0.00005 },
  'mistralai/mistral-large-2512': { input: 0.002, output: 0.006 },

  // Moonshot Kimi
  'moonshotai/kimi-k2-0905': { input: 0.001, output: 0.001 },
  'moonshotai/kimi-k2-0905:exacto': { input: 0.001, output: 0.001 },
  'moonshotai/kimi-k2-thinking': { input: 0.002, output: 0.002 },

  // NVIDIA Nemotron
  'nvidia/nemotron-3-nano-30b-a3b': { input: 0.0001, output: 0.0001 },

  // OpenAI GPT-5.2
  'openai/gpt-5.2': { input: 0.01, output: 0.03 },
  'openai/gpt-5.2-pro': { input: 0.03, output: 0.09 },

  // Qwen
  'qwen/qwen-plus-2025-07-28': { input: 0.0004, output: 0.0004 },
  'qwen/qwen-plus-2025-07-28:thinking': { input: 0.0008, output: 0.0008 },
  'qwen/qwen-turbo': { input: 0.0002, output: 0.0002 },
  'qwen/qwen3-30b-a3b-instruct-2507': { input: 0.0001, output: 0.0001 },
  'qwen/qwen3-next-80b-a3b-instruct': { input: 0.0003, output: 0.0003 },
  'qwen/qwen3-vl-235b-a22b-instruct': { input: 0.0005, output: 0.0005 },
  'qwen/qwen3-vl-235b-a22b-thinking': { input: 0.001, output: 0.001 },
  'qwen/qwen3-vl-30b-a3b-instruct': { input: 0.0001, output: 0.0001 },
  'qwen/qwen3-vl-32b-instruct': { input: 0.0001, output: 0.0001 },

  // xAI Grok
  'x-ai/grok-4-fast': { input: 0.002, output: 0.006 },
  'x-ai/grok-4.1-fast': { input: 0.002, output: 0.006 },

  // Xiaomi MiMo
  'xiaomi/mimo-v2-flash:free': { input: 0, output: 0 },
};

// Default pricing if model not found
const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

// Batch API pricing per 1K tokens (USD) - typically 50% discount
const BATCH_PRICING: Record<string, { input: number; output: number }> = Object.fromEntries(
  Object.entries(PRICING).map(([id, { input, output }]) => [
    id,
    { input: input * 0.5, output: output * 0.5 },
  ])
);

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
    return 'FREE';
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

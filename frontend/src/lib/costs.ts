/**
 * Cost calculation utilities for AI API calls.
 * 
 * CANONICAL PRICING SOURCE: /api/models endpoint
 * 
 * These are fallback defaults for quick client-side estimates when API is unavailable.
 * For accurate costs, fetch /api/models to get per-model pricing.
 */

/** Default pricing per 1K tokens (USD) - fallback when API unavailable */
const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

/**
 * Calculate the cost of an AI API call using default pricing.
 * For accurate per-model pricing, use data from /api/models endpoint.
 */
export function calculateCost(
  _modelId: string,
  tokens: { input: number; output: number }
): number {
  return (tokens.input / 1000) * DEFAULT_PRICING.input + 
         (tokens.output / 1000) * DEFAULT_PRICING.output;
}

/**
 * Calculate cost from total tokens (rough estimate).
 * Assumes 70% input, 30% output ratio.
 */
export function calculateCostFromTotal(_modelId: string, totalTokens: number): number {
  const inputTokens = totalTokens * 0.7;
  const outputTokens = totalTokens * 0.3;
  return calculateCost('', { input: inputTokens, output: outputTokens });
}

/**
 * Format cost as a currency string.
 */
export function formatCost(cost: number): string {
  if (cost < 0.0001) return 'FREE';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Calculate total cost from a list of AI call events.
 */
export function calculateTotalCost(
  events: Array<{ modelId: string; tokensUsed?: { input: number; output: number } }>
): number {
  return events.reduce((total, event) => {
    if (event.tokensUsed) {
      return total + calculateCost(event.modelId, event.tokensUsed);
    }
    return total;
  }, 0);
}

/**
 * Cost utilities for displaying game costs.
 * 
 * COST TRACKING STRATEGY:
 * - New games: cost_usd is stored in DB, fetched via API
 * - Old games: cost_usd may be NULL, use fallback estimate
 * 
 * For accurate costs, the API now returns cost_usd calculated using model-specific pricing.
 */

/** Default pricing per 1K tokens (USD) - fallback for old games without cost_usd */
const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

/**
 * Get the cost to display for a game.
 * Prefers stored cost_usd from API, falls back to estimate for old games.
 * 
 * @param costUsd - The cost_usd from the API (may be null/0 for old games)
 * @param totalTokens - Total tokens for fallback calculation
 * @returns Cost in USD
 */
export function getDisplayCost(costUsd: number | null | undefined, totalTokens: number): number {
  // Use stored cost if available and non-zero
  if (costUsd && costUsd > 0) {
    return costUsd;
  }
  // Fallback to estimate for old games
  return calculateCostFromTotal('', totalTokens);
}

/**
 * Calculate the cost of an AI API call using default pricing.
 * @deprecated Use getDisplayCost with API-provided cost_usd for accuracy.
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
 * Uses 75/25 input/output ratio (based on typical game patterns).
 * 
 * Used as fallback for old games where cost_usd is not stored.
 */
export function calculateCostFromTotal(_modelId: string, totalTokens: number): number {
  const inputTokens = totalTokens * 0.75;
  const outputTokens = totalTokens * 0.25;
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
 * @deprecated Use API-provided cost_usd for accuracy.
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

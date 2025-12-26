/**
 * Cost calculation utilities.
 * Calculates AI API costs based on token usage and model pricing.
 * 
 * COST TRACKING SYSTEM:
 * - Model pricing is stored in the DB (models.config.pricing)
 * - Use calculateExactCost() with DB-fetched pricing for accurate costs
 * - calculateCostFromTotal() is a fallback for rough estimates (old games)
 */

import { DEFAULT_PRICING } from '../ai/models.js';

/** Pricing structure per 1K tokens */
export interface ModelPricing {
  /** Cost per 1K input tokens in USD */
  input: number;
  /** Cost per 1K output tokens in USD */
  output: number;
}

/**
 * Calculate exact cost using specific pricing and token counts.
 * This is the primary cost calculation function - use DB-fetched pricing.
 * 
 * @param inputTokens - Actual input tokens used
 * @param outputTokens - Actual output tokens used  
 * @param pricing - Model-specific pricing from database (per 1K tokens)
 * @returns Cost in USD
 */
export function calculateExactCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing
): number {
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

/**
 * Calculate the cost of an AI call using default pricing.
 * @deprecated Use calculateExactCost with DB-fetched pricing for accuracy.
 */
export function calculateCost(
  _modelId: string,
  tokens: { input: number; output: number }
): number {
  return calculateExactCost(tokens.input, tokens.output, DEFAULT_PRICING);
}

/**
 * Calculate cost from total tokens (rough estimate).
 * Uses a 75/25 input/output ratio estimate.
 * 
 * Used as fallback for:
 * - Old games where input/output split was not recorded
 * - Frontend estimates when DB pricing unavailable
 */
export function calculateCostFromTotal(_modelId: string, totalTokens: number): number {
  // Assume 75% input, 25% output ratio (based on typical game patterns)
  const inputTokens = totalTokens * 0.75;
  const outputTokens = totalTokens * 0.25;
  return calculateExactCost(inputTokens, outputTokens, DEFAULT_PRICING);
}

/**
 * Calculate average cost for a game involving multiple models.
 * @deprecated Use per-participant cost calculation in GameRunner.
 */
export function calculateGameCost(modelIds: string[], totalTokens: number): number {
  if (modelIds.length === 0) {
    return calculateCostFromTotal('default', totalTokens);
  }
  
  // Fallback: use default pricing for rough estimate
  return calculateCostFromTotal(modelIds[0]!, totalTokens);
}

/**
 * Get the default pricing info.
 * @deprecated Fetch pricing from database for accuracy.
 */
export function getModelPricing(_modelId: string): ModelPricing {
  return DEFAULT_PRICING;
}

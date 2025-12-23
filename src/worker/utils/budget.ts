/**
 * Cost calculation utilities.
 * Calculates AI API costs based on token usage and model pricing.
 * 
 * Uses default pricing since model-specific pricing is now in the database.
 * For accurate costs, pricing should be fetched from the DB at runtime.
 */

import { DEFAULT_PRICING } from '../ai/models.js';

/**
 * Calculate the cost of an AI call using default pricing.
 * For accurate per-model pricing, use database lookup.
 */
export function calculateCost(
  _modelId: string,
  tokens: { input: number; output: number }
): number {
  // Use default pricing - model-specific pricing is in DB
  const costs = DEFAULT_PRICING;
  return (tokens.input / 1000) * costs.input + (tokens.output / 1000) * costs.output;
}

/**
 * Calculate cost from total tokens (rough estimate).
 * Uses a 70/30 input/output ratio estimate.
 */
export function calculateCostFromTotal(_modelId: string, totalTokens: number): number {
  const pricing = DEFAULT_PRICING;
  // Assume 70% input, 30% output ratio
  const inputTokens = totalTokens * 0.7;
  const outputTokens = totalTokens * 0.3;
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

/**
 * Calculate average cost for a game involving multiple models.
 */
export function calculateGameCost(modelIds: string[], totalTokens: number): number {
  if (modelIds.length === 0) {
    return calculateCostFromTotal('default', totalTokens);
  }
  
  // All models use same default pricing now
  return calculateCostFromTotal(modelIds[0]!, totalTokens);
}

/**
 * Get the pricing info for a model.
 * Returns default pricing - model-specific pricing is in DB.
 */
export function getModelPricing(_modelId: string): { input: number; output: number } {
  return DEFAULT_PRICING;
}

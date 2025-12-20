/**
 * Budget control utilities.
 * Prevents runaway API costs by enforcing daily spending limits.
 */

import { MODEL_PRICING, DEFAULT_PRICING } from '../ai/models.js';

// Daily budget in USD
const DAILY_BUDGET_USD = 10.0;

// Average cost per token (used for rough estimates from total tokens)
const AVG_COST_PER_TOKEN = 0.000002; // $0.002 per 1K tokens average

interface BudgetCheckResult {
  allowed: boolean;
  spent: number;
  remaining: number;
  limit: number;
}

/**
 * Check if we're within the daily budget.
 */
export async function checkBudget(db: D1Database): Promise<BudgetCheckResult> {
  const today = new Date().toISOString().split('T')[0];

  const result = await db
    .prepare(
      `SELECT SUM(total_tokens) as tokens 
       FROM games 
       WHERE date(created_at / 1000, 'unixepoch') = ?`
    )
    .bind(today)
    .first<{ tokens: number | null }>();

  const tokens = result?.tokens || 0;
  const estimatedCost = tokens * AVG_COST_PER_TOKEN;
  const remaining = Math.max(0, DAILY_BUDGET_USD - estimatedCost);

  return {
    allowed: estimatedCost < DAILY_BUDGET_USD,
    spent: estimatedCost,
    remaining,
    limit: DAILY_BUDGET_USD,
  };
}

/**
 * Calculate the cost of an AI call.
 */
export function calculateCost(
  modelId: string,
  tokens: { input: number; output: number }
): number {
  const costs = MODEL_PRICING[modelId] || DEFAULT_PRICING;
  return (tokens.input / 1000) * costs.input + (tokens.output / 1000) * costs.output;
}

/**
 * Calculate cost from total tokens (rough estimate).
 * Uses a 70/30 input/output ratio estimate.
 */
export function calculateCostFromTotal(modelId: string, totalTokens: number): number {
  const pricing = MODEL_PRICING[modelId] || DEFAULT_PRICING;
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
  
  // If same model on both sides, use that model's pricing
  const uniqueModels = [...new Set(modelIds)];
  if (uniqueModels.length === 1) {
    return calculateCostFromTotal(uniqueModels[0]!, totalTokens);
  }
  
  // For different models, calculate weighted average
  // Assume tokens are split evenly between models
  const tokensPerModel = totalTokens / uniqueModels.length;
  return uniqueModels.reduce((total, modelId) => {
    return total + calculateCostFromTotal(modelId, tokensPerModel);
  }, 0);
}

/**
 * Get the pricing info for a model.
 */
export function getModelPricing(modelId: string): { input: number; output: number } {
  return MODEL_PRICING[modelId] || DEFAULT_PRICING;
}


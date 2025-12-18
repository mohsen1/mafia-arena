/**
 * Budget control utilities.
 * Prevents runaway API costs by enforcing daily spending limits.
 */

// Daily budget in USD
const DAILY_BUDGET_USD = 10.0;

// Approximate cost per 1K tokens by model
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash': { input: 0.0001, output: 0.0004 },
};

// Average cost per token (used for rough estimates from total tokens)
const AVG_COST_PER_TOKEN = 0.000005; // $0.005 per 1K tokens average

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
  const costs = TOKEN_COSTS[modelId] || { input: 0.001, output: 0.003 };
  return (tokens.input / 1000) * costs.input + (tokens.output / 1000) * costs.output;
}

/**
 * Get the pricing info for a model.
 */
export function getModelPricing(modelId: string): { input: number; output: number } {
  return TOKEN_COSTS[modelId] || { input: 0.001, output: 0.003 };
}


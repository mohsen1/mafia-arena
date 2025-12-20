/**
 * Budget API routes.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { checkBudget } from '../utils/budget.js';

const budget = new Hono<{ Bindings: Env }>();

/**
 * GET /api/budget - Get current budget status.
 */
budget.get('/', async (c) => {
  const env = c.env;
  const budgetStatus = await checkBudget(env.DB);

  return c.json({
    allowed: budgetStatus.allowed,
    spent: budgetStatus.spent.toFixed(4),
    remaining: budgetStatus.remaining.toFixed(4),
    limit: budgetStatus.limit,
    currency: 'USD',
  });
});

export default budget;


-- Remove budget enforcement from system_state
-- Cost tracking remains in daily_stats and games tables
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0015_remove_budget.sql

-- Remove budget-related entries from system_state
DELETE FROM system_state WHERE key = 'daily_budget_usd';


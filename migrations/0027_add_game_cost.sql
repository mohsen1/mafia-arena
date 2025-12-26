-- Add cost tracking columns to games, participants, and leaderboard tables
-- This enables accurate cost calculation using model-specific pricing

-- Add cost_usd to games table (stores calculated cost at game completion)
ALTER TABLE games ADD COLUMN cost_usd REAL DEFAULT 0;

-- Add input/output token tracking to game_participants (for accurate per-model cost calculation)
ALTER TABLE game_participants ADD COLUMN input_tokens INTEGER DEFAULT 0;
ALTER TABLE game_participants ADD COLUMN output_tokens INTEGER DEFAULT 0;

-- Add cost_usd to leaderboard (for efficient cost stats queries)
ALTER TABLE leaderboard ADD COLUMN cost_usd REAL DEFAULT 0;


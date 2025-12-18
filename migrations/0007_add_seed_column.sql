-- Migration: Add seed column for reproducible games
-- This is critical for benchmark validity - researchers must be able to replay exact games

-- Add seed column to games table
ALTER TABLE games ADD COLUMN seed INTEGER;

-- Add index for querying games by seed (for reproducibility verification)
CREATE INDEX IF NOT EXISTS idx_games_seed ON games(seed);


-- Migration: Add incremental ELO rating columns to models table
-- This eliminates O(N) recalculation on every /api/stats/elo request

-- Add ELO rating column to models (default 1500 = starting ELO)
ALTER TABLE models ADD COLUMN elo_rating INTEGER DEFAULT 1500;
ALTER TABLE models ADD COLUMN elo_games_played INTEGER DEFAULT 0;
ALTER TABLE models ADD COLUMN elo_peak INTEGER DEFAULT 1500;
ALTER TABLE models ADD COLUMN elo_updated_at INTEGER;

-- Create index for efficient sorting by ELO
CREATE INDEX IF NOT EXISTS idx_models_elo ON models(elo_rating DESC);


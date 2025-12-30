-- Add columns for smart stale detection
-- discount_pricing: 0 = standard (1h timeout), 1 = discount pricing (24h timeout)
-- last_activity: timestamp of last significant game activity

ALTER TABLE games ADD COLUMN discount_pricing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE games ADD COLUMN last_activity INTEGER;

-- Index for efficient scheduled cleanup queries on running games
CREATE INDEX IF NOT EXISTS idx_games_running_activity 
  ON games(status, discount_pricing, last_activity) 
  WHERE status = 'running';





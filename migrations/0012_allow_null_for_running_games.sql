-- Allow NULL values for columns that aren't known until game completes
-- This enables inserting "running" games before they finish

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- Backup existing data first

-- Create new table with relaxed constraints
CREATE TABLE IF NOT EXISTS games_new (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  config_hash TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  mafia_count INTEGER NOT NULL,
  winner TEXT CHECK (winner IS NULL OR winner IN ('mafia', 'town')),
  rounds INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  seed INTEGER,
  persona_enabled INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER
);

-- Copy data from old table
INSERT INTO games_new 
  SELECT id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, error_message, seed, persona_enabled, created_at, NULL
  FROM games;

-- Drop old table
DROP TABLE games;

-- Rename new table
ALTER TABLE games_new RENAME TO games;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_batch ON games(batch_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);


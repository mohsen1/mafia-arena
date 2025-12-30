-- Add 'failed' status to batches table
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0041_add_failed_batch_status.sql
--
-- This migration adds 'failed' as a valid batch status for when queue processing fails.
-- SQLite doesn't support ALTER TABLE to modify CHECK constraints, so we need to recreate the table.

-- Step 1: Create new table with updated constraint
CREATE TABLE IF NOT EXISTS batches_new (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'cancelled', 'paused', 'failed')),
  total_games INTEGER NOT NULL,
  completed_games INTEGER DEFAULT 0,
  failed_games INTEGER DEFAULT 0,
  config_json TEXT NOT NULL,
  estimated_cost_usd REAL,
  actual_cost_usd REAL DEFAULT 0,
  created_by TEXT DEFAULT 'api',
  created_at INTEGER DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT,
  games_queued INTEGER DEFAULT 0
);

-- Step 2: Copy data from old table to new table
INSERT INTO batches_new (id, name, status, total_games, completed_games, failed_games, config_json, estimated_cost_usd, actual_cost_usd, created_by, created_at, started_at, completed_at, error_message, games_queued)
SELECT id, name, status, total_games, completed_games, failed_games, config_json, estimated_cost_usd, actual_cost_usd, created_by, created_at, started_at, completed_at, error_message, COALESCE(games_queued, 0)
FROM batches;

-- Step 3: Drop the old table
DROP TABLE batches;

-- Step 4: Rename new table to original name
ALTER TABLE batches_new RENAME TO batches;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_created ON batches(created_at DESC);


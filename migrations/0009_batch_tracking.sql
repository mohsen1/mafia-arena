-- Batch job tracking for large-scale game runs
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0009_batch_tracking.sql

-- =============================================================================
-- BATCH JOBS TABLE
-- =============================================================================
-- Tracks large batch runs (up to 10,000 games per batch)

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  name TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'cancelled', 'paused')),
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
  error_message TEXT
);

-- =============================================================================
-- DAILY STATS TABLE
-- =============================================================================
-- Aggregated daily statistics for fast dashboard queries

CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  games_completed INTEGER DEFAULT 0,
  games_failed INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  mafia_wins INTEGER DEFAULT 0,
  town_wins INTEGER DEFAULT 0,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Fast batch status queries
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- Fast batch listing (newest first)
CREATE INDEX IF NOT EXISTS idx_batches_created ON batches(created_at DESC);

-- Fast batch progress queries
CREATE INDEX IF NOT EXISTS idx_games_batch_status ON games(batch_id, status);

-- Fast daily stats lookups
CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date DESC);

-- =============================================================================
-- SYSTEM STATE TABLE (for circuit breaker)
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

-- Initialize default system state
INSERT OR IGNORE INTO system_state (key, value) VALUES ('processing_paused', 'false');
INSERT OR IGNORE INTO system_state (key, value) VALUES ('daily_budget_usd', '10');
INSERT OR IGNORE INTO system_state (key, value) VALUES ('max_concurrent_games', '50');


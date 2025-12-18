-- Error logging table
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0003_error_log.sql

CREATE TABLE IF NOT EXISTS error_log (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  message TEXT NOT NULL,
  stack TEXT,
  context TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Index for querying recent errors
CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_level ON error_log(level);


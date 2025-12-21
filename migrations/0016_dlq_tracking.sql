-- Dead Letter Queue tracking for failed messages
-- Provides visibility and retry capability for failed queue messages
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0016_dlq_tracking.sql

CREATE TABLE IF NOT EXISTS dlq_entries (
  id TEXT PRIMARY KEY,
  queue_name TEXT NOT NULL,
  message_body TEXT NOT NULL,
  error_message TEXT,
  error_stack TEXT,
  attempts INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch()),
  retried_at INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retried', 'discarded'))
);

-- Index for listing pending failures
CREATE INDEX IF NOT EXISTS idx_dlq_status ON dlq_entries(status, created_at DESC);

-- Index for finding entries by queue
CREATE INDEX IF NOT EXISTS idx_dlq_queue ON dlq_entries(queue_name, status);


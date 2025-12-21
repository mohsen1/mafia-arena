-- Add trace_id column for distributed tracing
-- Allows tracking requests across the full system flow
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0017_add_trace_id.sql

-- Add trace_id column to games table
ALTER TABLE games ADD COLUMN trace_id TEXT;

-- Create index for looking up games by trace ID
CREATE INDEX IF NOT EXISTS idx_games_trace_id ON games(trace_id);


-- Add games_queued column to batches table for checkpoint/resume support
-- Tracks how many games have been successfully queued to GAME_QUEUE
-- Allows resuming batch processing from where it left off if worker crashes

ALTER TABLE batches ADD COLUMN games_queued INTEGER NOT NULL DEFAULT 0;

-- Index for efficient batch status queries
CREATE INDEX IF NOT EXISTS idx_batches_status_games 
  ON batches(status, games_queued, total_games);



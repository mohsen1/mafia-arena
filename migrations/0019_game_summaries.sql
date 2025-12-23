-- Game summaries for context window management
-- Stores AI-generated summaries of conversation history when approaching token limits

CREATE TABLE IF NOT EXISTS game_summaries (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  round_start INTEGER NOT NULL,
  round_end INTEGER NOT NULL,
  summary_type TEXT NOT NULL CHECK (summary_type IN ('conversation', 'votes', 'full')),
  summary_text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

-- Index for efficient lookup by game and model
CREATE INDEX IF NOT EXISTS idx_summaries_game_model ON game_summaries(game_id, model_id);

-- Index for efficient lookup by game and round range
CREATE INDEX IF NOT EXISTS idx_summaries_game_rounds ON game_summaries(game_id, round_start, round_end);


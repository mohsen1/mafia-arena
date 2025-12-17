-- Mafia Arena - Initial Database Schema
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0001_initial_schema.sql

-- Models registry
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  display_name TEXT NOT NULL,
  config TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Game metadata
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  batch_id TEXT,
  config_hash TEXT NOT NULL,
  player_count INTEGER NOT NULL,
  mafia_count INTEGER NOT NULL,
  winner TEXT NOT NULL CHECK (winner IN ('mafia', 'town')),
  rounds INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Per-game participation
CREATE TABLE IF NOT EXISTS game_participants (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
  player_count INTEGER NOT NULL,
  won INTEGER NOT NULL CHECK (won IN (0, 1))
);

-- Aggregated leaderboard
CREATE TABLE IF NOT EXISTS leaderboard (
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (model_id, team)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_batch ON games(batch_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_participants_game ON game_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_participants_model ON game_participants(model_id);


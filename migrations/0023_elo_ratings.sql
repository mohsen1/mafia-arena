-- ELO rating system for more accurate model rankings
-- ELO accounts for opponent strength, unlike simple win rate

CREATE TABLE IF NOT EXISTS elo_ratings (
  model_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 1500,
  games_played INTEGER NOT NULL DEFAULT 0,
  peak_rating INTEGER NOT NULL DEFAULT 1500,
  last_updated INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (model_id) REFERENCES models(id)
);

-- Track rating history for trends
CREATE TABLE IF NOT EXISTS elo_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  rating_before INTEGER NOT NULL,
  rating_after INTEGER NOT NULL,
  rating_change INTEGER NOT NULL,
  opponent_rating INTEGER NOT NULL,
  won INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (model_id) REFERENCES models(id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE INDEX IF NOT EXISTS idx_elo_history_model ON elo_history(model_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_game ON elo_history(game_id);





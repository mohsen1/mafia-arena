-- Persona tracking for AI-generated identities
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0005_persona_tracking.sql

-- Store generated personas for each player in each game
CREATE TABLE IF NOT EXISTS game_personas (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
  persona_name TEXT NOT NULL,
  persona_background TEXT NOT NULL,
  persona_personality TEXT NOT NULL,
  persona_occupation TEXT,
  consistency_score REAL,
  name_usage_count INTEGER DEFAULT 0,
  personality_alignment_score REAL,
  inconsistencies TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Game-level persona analysis summary
CREATE TABLE IF NOT EXISTS game_persona_analysis (
  game_id TEXT PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  average_consistency_score REAL NOT NULL,
  mafia_avg_consistency REAL NOT NULL,
  town_avg_consistency REAL NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Aggregated persona patterns per model (for bias analysis)
CREATE TABLE IF NOT EXISTS persona_patterns (
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
  personality_type TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  avg_consistency_score REAL,
  win_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (model_id, team, personality_type)
);

-- Aggregated name patterns (for detecting bias in name choices)
CREATE TABLE IF NOT EXISTS persona_name_patterns (
  model_id TEXT NOT NULL REFERENCES models(id),
  team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
  name_pattern TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (model_id, team, name_pattern)
);

-- Add persona_enabled column to games table
ALTER TABLE games ADD COLUMN persona_enabled INTEGER DEFAULT 0 CHECK (persona_enabled IN (0, 1));
ALTER TABLE games ADD COLUMN persona_constraints TEXT CHECK (persona_constraints IN ('strict', 'moderate', 'free'));

-- Update game_participants to include consistency score
ALTER TABLE game_participants ADD COLUMN consistency_score REAL;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_game_personas_game ON game_personas(game_id);
CREATE INDEX IF NOT EXISTS idx_game_personas_model ON game_personas(model_id);
CREATE INDEX IF NOT EXISTS idx_game_personas_personality ON game_personas(persona_personality);
CREATE INDEX IF NOT EXISTS idx_persona_patterns_model ON persona_patterns(model_id);
CREATE INDEX IF NOT EXISTS idx_persona_name_patterns_model ON persona_name_patterns(model_id);


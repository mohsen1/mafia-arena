-- Add persona_theme column to games table
-- Tracks which theme was used for character personas

ALTER TABLE games ADD COLUMN persona_theme TEXT;

-- Create index for filtering by theme
CREATE INDEX IF NOT EXISTS idx_games_persona_theme ON games(persona_theme);




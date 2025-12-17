-- Update the default value for default_game_theme column to use a valid theme key
ALTER TABLE "user_preferences" 
ALTER COLUMN "default_game_theme" 
SET DEFAULT 'UK_VILLAGE_1900S'; 
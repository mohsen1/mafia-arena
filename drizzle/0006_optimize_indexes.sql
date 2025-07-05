-- Optimize database indexes by removing redundancies

-- Games table: Remove redundant indexes
-- idx_games_owner_id is redundant because idx_games_owner_status already covers owner_id
DROP INDEX IF EXISTS idx_games_owner_id;

-- Game participants: Remove redundant indexes  
-- idx_game_participants_game_id and idx_game_participants_user_id are redundant 
-- because idx_game_participants_game_user covers both columns
DROP INDEX IF EXISTS idx_game_participants_game_id;
DROP INDEX IF EXISTS idx_game_participants_user_id;

-- User API keys: Remove redundant indexes
-- idx_user_api_keys_user_id and idx_user_api_keys_provider are redundant
-- because idx_user_api_keys_user_provider covers both columns
DROP INDEX IF EXISTS idx_user_api_keys_user_id;
DROP INDEX IF EXISTS idx_user_api_keys_provider;

-- User achievements: Remove redundant indexes
-- idx_user_achievements_user_id and idx_user_achievements_achievement_id are redundant
-- because idx_user_achievements_user_achievement covers both columns
DROP INDEX IF EXISTS idx_user_achievements_user_id;
DROP INDEX IF EXISTS idx_user_achievements_achievement_id;

-- Add comment explaining index strategy
COMMENT ON INDEX idx_games_owner_status IS 'Composite index for filtering games by owner and status';
COMMENT ON INDEX idx_game_participants_game_user IS 'Composite index for participant lookups';
COMMENT ON INDEX idx_user_api_keys_user_provider IS 'Composite index for API key lookups';
COMMENT ON INDEX idx_user_achievements_user_achievement IS 'Composite index for achievement lookups'; 
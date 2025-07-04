-- Add indexes for better query performance

-- Games table indexes
CREATE INDEX IF NOT EXISTS idx_games_owner_id ON games(owner_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_owner_status ON games(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at DESC);

-- Game participants indexes
CREATE INDEX IF NOT EXISTS idx_game_participants_game_id ON game_participants(game_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_user_id ON game_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_game_participants_game_user ON game_participants(game_id, user_id);

-- User API keys indexes
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(provider);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_provider ON user_api_keys(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_active ON user_api_keys(is_active);

-- Game statistics indexes
CREATE INDEX IF NOT EXISTS idx_game_statistics_user_id ON game_statistics(user_id);
CREATE INDEX IF NOT EXISTS idx_game_statistics_game_id ON game_statistics(game_id);
CREATE INDEX IF NOT EXISTS idx_game_statistics_created_at ON game_statistics(created_at DESC);

-- User stats summary indexes
CREATE INDEX IF NOT EXISTS idx_user_stats_summary_user_id ON user_stats_summary(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_summary_win_rate ON user_stats_summary(win_rate DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_summary_total_games ON user_stats_summary(total_games DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_summary_total_wins ON user_stats_summary(total_wins DESC);

-- User achievements indexes
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements(achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_achievement ON user_achievements(user_id, achievement_id);

-- User preferences indexes
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Sessions indexes for faster auth lookups
CREATE INDEX IF NOT EXISTS idx_session_user_id ON session("userId");
CREATE INDEX IF NOT EXISTS idx_session_expires ON session(expires);

-- Accounts indexes
CREATE INDEX IF NOT EXISTS idx_account_user_id ON account("userId"); 
-- Consolidate Gemini 3 Flash model variants
-- Merge "google/gemini-3-flash-preview" into "google/gemini-3-flash"
-- Both are the same model, just with different IDs created at different times

-- Step 1: Update game_participants to point to canonical ID
UPDATE game_participants 
SET model_id = 'google/gemini-3-flash' 
WHERE model_id = 'google/gemini-3-flash-preview';

-- Step 2: Merge leaderboard stats
-- For each team, combine the stats from both model IDs
INSERT OR REPLACE INTO leaderboard (model_id, team, games_played, games_won, total_tokens, updated_at, cost_usd)
SELECT 
  'google/gemini-3-flash' as model_id,
  team,
  SUM(games_played) as games_played,
  SUM(games_won) as games_won,
  SUM(total_tokens) as total_tokens,
  MAX(updated_at) as updated_at,
  SUM(cost_usd) as cost_usd
FROM leaderboard 
WHERE model_id IN ('google/gemini-3-flash', 'google/gemini-3-flash-preview')
GROUP BY team;

-- Step 3: Remove the old preview leaderboard entries (now merged)
DELETE FROM leaderboard WHERE model_id = 'google/gemini-3-flash-preview';

-- Step 4: Delete the preview model entry from models table
DELETE FROM models WHERE id = 'google/gemini-3-flash-preview';

-- Step 5: Ensure the canonical model has the correct display name (no Preview)
UPDATE models 
SET display_name = 'Gemini 3 Flash' 
WHERE id = 'google/gemini-3-flash';


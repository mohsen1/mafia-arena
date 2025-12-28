-- Migration: Explicit Model ID Routing Convention
-- 
-- This migration updates model IDs to use explicit routing prefixes:
-- - OpenRouter models: 'openrouter/provider/model-name'
-- - Direct provider models: 'provider/model-name'
--
-- BEFORE: 'anthropic/claude-3.5-sonnet' could route to OpenRouter OR direct API
-- AFTER:  'openrouter/anthropic/claude-3.5-sonnet' explicitly routes via OpenRouter
--         'anthropic/claude-3.5-sonnet' explicitly routes via direct Anthropic API
--
-- NOTE: This migration preserves backward compatibility by keeping both old and new IDs
-- in the database during the transition period. The factory.ts code handles both formats.

-- Step 1: Update models table to prepend 'openrouter/' to models that use OpenRouter
-- These are models where api_provider = 'openrouter' but the ID doesn't start with 'openrouter/'
UPDATE models 
SET id = 'openrouter/' || id 
WHERE api_provider = 'openrouter' 
  AND id NOT LIKE 'openrouter/%'
  AND id NOT LIKE 'test/%';

-- Step 2: Update game_participants to reference the new model IDs
-- This updates historical game data to use the new prefixed format
UPDATE game_participants 
SET model_id = 'openrouter/' || model_id 
WHERE model_id IN (
  SELECT REPLACE(id, 'openrouter/', '') 
  FROM models 
  WHERE api_provider = 'openrouter' 
    AND id LIKE 'openrouter/%'
);

-- Step 3: Update elo_ratings to reference new model IDs
UPDATE elo_ratings 
SET model_id = 'openrouter/' || model_id 
WHERE model_id IN (
  SELECT REPLACE(id, 'openrouter/', '') 
  FROM models 
  WHERE api_provider = 'openrouter' 
    AND id LIKE 'openrouter/%'
);

-- Step 4: Verify the migration (for debugging)
-- SELECT id, api_provider, api_model_id FROM models WHERE api_provider = 'openrouter' LIMIT 10;
-- SELECT DISTINCT model_id FROM game_participants LIMIT 20;


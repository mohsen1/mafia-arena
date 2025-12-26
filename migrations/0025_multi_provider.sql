-- Multi-Provider Architecture Migration
-- Adds support for multiple API providers beyond OpenRouter
-- 
-- PROVIDERS SUPPORTED:
-- - openrouter: OpenRouter API (aggregator for many models)
-- - openai: Direct OpenAI API
-- - anthropic: Direct Anthropic API
-- - google: Direct Google Gemini API
-- - cerebras: Cerebras API (OpenAI-compatible)
-- - minimax: Minimax API
-- - fireworks: Fireworks AI API (OpenAI-compatible)

-- Step 1: Add new columns for multi-provider support
-- api_provider: Which API gateway to use for requests
-- api_model_id: The model ID to send to that specific API

ALTER TABLE models ADD COLUMN api_provider TEXT DEFAULT 'openrouter';
ALTER TABLE models ADD COLUMN api_model_id TEXT;

-- Step 2: Rename 'provider' to 'family' to clarify its purpose
-- 'family' represents the model creator/family (e.g., google, openai, meta)
-- Used for UI grouping and color coding, NOT for API routing

ALTER TABLE models RENAME COLUMN provider TO family;

-- Step 3: Update existing rows to have proper api_model_id
-- For OpenRouter models, api_model_id is the same as id
UPDATE models SET api_model_id = id WHERE api_provider = 'openrouter' OR api_provider IS NULL;
UPDATE models SET api_provider = 'openrouter' WHERE api_provider IS NULL;

-- Step 4: Create index for faster provider-based queries
CREATE INDEX IF NOT EXISTS idx_models_api_provider ON models(api_provider);

-- Step 5: Create a providers registry table for dynamic provider management
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  api_type TEXT NOT NULL CHECK (api_type IN ('openai_compatible', 'anthropic', 'google', 'custom')),
  base_url TEXT,
  is_aggregator INTEGER DEFAULT 0,
  supports_streaming INTEGER DEFAULT 1,
  supports_function_calling INTEGER DEFAULT 1,
  config TEXT,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Seed default providers
INSERT OR IGNORE INTO providers (id, display_name, api_type, base_url, is_aggregator, config) VALUES
  ('openrouter', 'OpenRouter', 'openai_compatible', 'https://openrouter.ai/api/v1', 1, '{"rateLimit": 200}'),
  ('openai', 'OpenAI', 'openai_compatible', 'https://api.openai.com/v1', 0, NULL),
  ('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com/v1', 0, NULL),
  ('google', 'Google (Gemini)', 'google', 'https://generativelanguage.googleapis.com/v1beta', 0, NULL),
  ('cerebras', 'Cerebras', 'openai_compatible', 'https://api.cerebras.ai/v1', 0, NULL),
  ('minimax', 'MiniMax', 'custom', 'https://api.minimax.chat/v1', 0, NULL),
  ('fireworks', 'Fireworks AI', 'openai_compatible', 'https://api.fireworks.ai/inference/v1', 0, NULL);


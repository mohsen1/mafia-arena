-- Add missing direct API models to fix leaderboard foreign key issues
-- The DIRECT_PROVIDER_MODELS in models.ts uses these IDs, but they weren't all in the DB
-- This migration syncs all direct provider models with proper api_provider routing
-- 
-- Run with: wrangler d1 execute mafia-arena --remote --file=./migrations/0042_add_anthropic_direct_models.sql

-- ============================================================================
-- ANTHROPIC MODELS (Direct API)
-- ============================================================================

-- Claude 4.5 family (latest)
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, supports_batch_pricing)
VALUES 
  ('anthropic/claude-opus-4.5', 'Claude Opus 4.5', 'anthropic', 'anthropic', 'claude-opus-4-5-20251101', 
   '{"pricing":{"inputPer1K":0.005,"outputPer1K":0.025},"context_length":200000}', 1),
  ('anthropic/claude-sonnet-4.5', 'Claude Sonnet 4.5', 'anthropic', 'anthropic', 'claude-sonnet-4-5-20250929', 
   '{"pricing":{"inputPer1K":0.003,"outputPer1K":0.015},"context_length":200000}', 1),
  ('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 'anthropic', 'anthropic', 'claude-haiku-4-5-20251001', 
   '{"pricing":{"inputPer1K":0.001,"outputPer1K":0.005},"context_length":200000}', 1);

-- Claude 4 family
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, supports_batch_pricing)
VALUES 
  ('anthropic/claude-opus-4', 'Claude Opus 4', 'anthropic', 'anthropic', 'claude-opus-4-20250514', 
   '{"pricing":{"inputPer1K":0.015,"outputPer1K":0.075},"context_length":200000}', 1),
  ('anthropic/claude-sonnet-4', 'Claude Sonnet 4', 'anthropic', 'anthropic', 'claude-sonnet-4-20250514', 
   '{"pricing":{"inputPer1K":0.003,"outputPer1K":0.015},"context_length":1000000}', 1);

-- Claude 3.5/3.7 family
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, supports_batch_pricing)
VALUES 
  ('anthropic/claude-3.7-sonnet', 'Claude 3.7 Sonnet', 'anthropic', 'anthropic', 'claude-3-7-sonnet-20250219', 
   '{"pricing":{"inputPer1K":0.003,"outputPer1K":0.015},"context_length":200000}', 1),
  ('anthropic/claude-haiku-3.5', 'Claude 3.5 Haiku', 'anthropic', 'anthropic', 'claude-3-5-haiku-20241022', 
   '{"pricing":{"inputPer1K":0.0008,"outputPer1K":0.004},"context_length":200000}', 1);

-- ============================================================================
-- GOOGLE MODELS (Direct API) - Missing from DB
-- ============================================================================

INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, supports_batch_pricing)
VALUES 
  ('google/gemini-3-pro', 'Gemini 3 Pro', 'google', 'google', 'gemini-3-pro-preview', 
   '{"pricing":{"inputPer1K":0.002,"outputPer1K":0.012},"context_length":1048576}', 1),
  ('google/gemini-3-flash', 'Gemini 3 Flash', 'google', 'google', 'gemini-3-flash-preview', 
   '{"pricing":{"inputPer1K":0.0005,"outputPer1K":0.003},"context_length":1048576}', 1);

-- ============================================================================
-- OPENAI MODELS (Direct API) - GPT-5 family missing from DB
-- ============================================================================

INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, supports_batch_pricing)
VALUES 
  ('openai/gpt-5.2-pro', 'GPT-5.2 Pro', 'openai', 'openai', 'gpt-5.2-pro', 
   '{"pricing":{"inputPer1K":0.021,"outputPer1K":0.168},"context_length":400000}', 1),
  ('openai/gpt-5.2', 'GPT-5.2', 'openai', 'openai', 'gpt-5.2', 
   '{"pricing":{"inputPer1K":0.00175,"outputPer1K":0.014},"context_length":400000}', 1),
  ('openai/gpt-5.2-chat', 'GPT-5.2 Chat', 'openai', 'openai', 'gpt-5.2-chat', 
   '{"pricing":{"inputPer1K":0.00175,"outputPer1K":0.014},"context_length":128000}', 1),
  ('openai/gpt-5.1', 'GPT-5.1', 'openai', 'openai', 'gpt-5.1', 
   '{"pricing":{"inputPer1K":0.00125,"outputPer1K":0.01},"context_length":400000}', 1),
  ('openai/gpt-5.1-codex', 'GPT-5.1 Codex', 'openai', 'openai', 'gpt-5.1-codex', 
   '{"pricing":{"inputPer1K":0.00125,"outputPer1K":0.01},"context_length":400000}', 1),
  ('openai/gpt-5', 'GPT-5', 'openai', 'openai', 'gpt-5', 
   '{"pricing":{"inputPer1K":0.00125,"outputPer1K":0.01},"context_length":400000}', 1),
  ('openai/gpt-5-mini', 'GPT-5 Mini', 'openai', 'openai', 'gpt-5-mini', 
   '{"pricing":{"inputPer1K":0.00025,"outputPer1K":0.002},"context_length":400000}', 1);

-- ============================================================================
-- CLEANUP: Remove old inconsistent IDs (dash vs dot versions)
-- ============================================================================

DELETE FROM models WHERE id IN (
  'anthropic/claude-opus-4-5',
  'anthropic/claude-haiku-4-5'
);


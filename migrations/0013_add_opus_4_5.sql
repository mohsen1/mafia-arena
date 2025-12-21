-- Add Claude 4.5 models (Opus and Haiku)
-- Per https://www.anthropic.com/news/claude-opus-4-5
-- Per https://www.anthropic.com/news/claude-haiku-4-5
-- Run with: wrangler d1 execute mafia-arena --remote --file=./migrations/0013_add_opus_4_5.sql

-- Add specific versioned model IDs for Anthropic direct API
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('claude-opus-4-5-20251101', 'anthropic', 'Claude Opus 4.5 (Nov 2025)'),
  ('claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5 (Oct 2025)');

-- Add OpenRouter versions
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('anthropic/claude-opus-4-5', 'openrouter', 'Claude Opus 4.5'),
  ('anthropic/claude-haiku-4-5', 'openrouter', 'Claude Haiku 4.5');

-- Note: Generic aliases already exist from migration 0010
-- Pricing:
--   Opus 4.5: $5 input / $25 output per million tokens
--   Haiku 4.5: $1 input / $5 output per million tokens


-- Update AI models to December 2025 lineup
-- Run with: wrangler d1 execute mafia-arena --remote --file=./migrations/0010_update_models_dec2025.sql
-- Note: Old models are kept for data integrity with existing games

-- Insert new OpenAI GPT-5.2 series
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('gpt-5.2', 'openai', 'GPT-5.2'),
  ('gpt-5.2-pro', 'openai', 'GPT-5.2 Pro'),
  ('gpt-5-mini', 'openai', 'GPT-5 Mini'),
  ('gpt-5-nano', 'openai', 'GPT-5 Nano');

-- Insert new Anthropic Claude 4.5 series (using aliases)
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('claude-sonnet-4-5', 'anthropic', 'Claude Sonnet 4.5'),
  ('claude-haiku-4-5', 'anthropic', 'Claude Haiku 4.5'),
  ('claude-opus-4-5', 'anthropic', 'Claude Opus 4.5');

-- Insert/update Google Gemini 2.0+ series
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('gemini-3-pro-preview', 'google', 'Gemini 3 Pro'),
  ('gemini-3-flash-preview', 'google', 'Gemini 3 Flash'),
  ('gemini-2.5-pro', 'google', 'Gemini 2.5 Pro'),
  ('gemini-2.5-flash', 'google', 'Gemini 2.5 Flash'),
  ('gemini-2.5-flash-lite', 'google', 'Gemini 2.5 Flash Lite'),
  ('gemini-2.0-flash', 'google', 'Gemini 2.0 Flash'),
  ('gemini-2.0-flash-lite', 'google', 'Gemini 2.0 Flash Lite');

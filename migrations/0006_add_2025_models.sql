-- Add 2025 model releases
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0006_add_2025_models.sql

INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  -- OpenAI GPT-5.x series
  ('gpt-5.2', 'openai', 'GPT-5.2'),
  ('gpt-5.2-pro', 'openai', 'GPT-5.2 Pro'),
  ('gpt-5.1', 'openai', 'GPT-5.1'),
  
  -- Anthropic Claude 4.5 series
  ('claude-opus-4.5', 'anthropic', 'Claude Opus 4.5'),
  ('claude-sonnet-4.5', 'anthropic', 'Claude Sonnet 4.5'),
  ('claude-haiku-4.5', 'anthropic', 'Claude Haiku 4.5'),
  
  -- Google Gemini 3.x preview series
  ('gemini-3-pro-preview', 'google', 'Gemini 3 Pro'),
  ('gemini-3-flash-preview', 'google', 'Gemini 3 Flash'),
  ('gemini-2.5-flash', 'google', 'Gemini 2.5 Flash');

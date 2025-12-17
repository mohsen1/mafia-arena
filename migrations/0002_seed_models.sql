-- Seed initial AI models
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0002_seed_models.sql

INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  -- OpenAI
  ('gpt-4o', 'openai', 'GPT-4o'),
  ('gpt-4o-mini', 'openai', 'GPT-4o Mini'),
  ('gpt-4-turbo', 'openai', 'GPT-4 Turbo'),
  
  -- Anthropic
  ('claude-3-5-sonnet-20241022', 'anthropic', 'Claude 3.5 Sonnet'),
  ('claude-3-5-haiku-20241022', 'anthropic', 'Claude 3.5 Haiku'),
  ('claude-3-opus-20240229', 'anthropic', 'Claude 3 Opus'),
  ('claude-3-sonnet-20240229', 'anthropic', 'Claude 3 Sonnet'),
  ('claude-3-haiku-20240307', 'anthropic', 'Claude 3 Haiku'),
  
  -- Google
  ('gemini-1.5-pro', 'google', 'Gemini 1.5 Pro'),
  ('gemini-1.5-flash', 'google', 'Gemini 1.5 Flash'),
  ('gemini-2.0-flash-exp', 'google', 'Gemini 2.0 Flash');


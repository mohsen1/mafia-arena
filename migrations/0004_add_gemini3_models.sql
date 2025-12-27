-- Add new Gemini 3 models
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0004_add_gemini3_models.sql

-- Add new Gemini models
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('gemini-3-pro-preview', 'google', 'Gemini 3 Pro'),
  ('gemini-3-flash-preview', 'google', 'Gemini 3 Flash'),
  ('gemini-2.5-flash', 'google', 'Gemini 2.5 Flash'),
  ('gemini-2.0-flash-lite', 'google', 'Gemini 2.0 Flash Lite');

-- Update gemini-2.0-flash display name (if needed)
UPDATE models SET display_name = 'Gemini 2.0 Flash' WHERE id = 'gemini-2.0-flash';







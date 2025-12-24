-- Normalize Gemini model display names for consistency
-- The old models (gemini-*) should have "Google: " prefix like the new OpenRouter models

-- Old direct API models - add Google prefix
UPDATE models SET display_name = 'Google: Gemini 3 Flash' WHERE id = 'gemini-3-flash-preview';
UPDATE models SET display_name = 'Google: Gemini 2.5 Flash' WHERE id = 'gemini-2.5-flash';
UPDATE models SET display_name = 'Google: Gemini 2.0 Flash' WHERE id = 'gemini-2.0-flash';
UPDATE models SET display_name = 'Google: Gemini 2.0 Flash Exp' WHERE id = 'gemini-2.0-flash-exp';

-- Also update other Google models without proper display names
UPDATE models SET display_name = 'Google: ' || 
  REPLACE(REPLACE(REPLACE(REPLACE(id, 'google/', ''), '-', ' '), ':free', ' (free)'), '  ', ' ')
WHERE id LIKE 'google/%' AND display_name IS NULL;


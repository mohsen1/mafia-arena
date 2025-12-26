-- Normalize model display names: strip redundant "Provider: " prefix
-- since we already store the provider/family in a separate column.
-- This makes the leaderboard cleaner: "Gemini 3 Flash" vs "Google: Gemini 3 Flash"

-- Strip Google prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 9) 
WHERE display_name LIKE 'Google: %';

-- Strip Anthropic prefix  
UPDATE models 
SET display_name = SUBSTR(display_name, 12) 
WHERE display_name LIKE 'Anthropic: %';

-- Strip OpenAI prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 9) 
WHERE display_name LIKE 'OpenAI: %';

-- Strip Meta prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 7) 
WHERE display_name LIKE 'Meta: %';

-- Strip Mistral prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 10) 
WHERE display_name LIKE 'Mistral: %';

-- Strip Microsoft prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 12) 
WHERE display_name LIKE 'Microsoft: %';

-- Strip Xiaomi prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 9) 
WHERE display_name LIKE 'Xiaomi: %';

-- Strip DeepSeek prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 11) 
WHERE display_name LIKE 'DeepSeek: %';

-- Strip Qwen prefix
UPDATE models 
SET display_name = SUBSTR(display_name, 7) 
WHERE display_name LIKE 'Qwen: %';


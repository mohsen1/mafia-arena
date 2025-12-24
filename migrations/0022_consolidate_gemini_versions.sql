-- Consolidate Gemini model versions under common display names
-- This allows the frontend deduplication to merge them

-- Gemini 3 Flash variants -> "Google: Gemini 3 Flash"
UPDATE models SET display_name = 'Google: Gemini 3 Flash' WHERE id IN (
  'gemini-3-flash-preview',
  'google/gemini-3-flash-preview'
);

-- Gemini 2.5 Flash variants -> "Google: Gemini 2.5 Flash"  
UPDATE models SET display_name = 'Google: Gemini 2.5 Flash' WHERE id IN (
  'gemini-2.5-flash',
  'google/gemini-2.5-flash'
);

-- Gemini 2.0 Flash variants -> "Google: Gemini 2.0 Flash"
UPDATE models SET display_name = 'Google: Gemini 2.0 Flash' WHERE id IN (
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'google/gemini-2.0-flash-001',
  'google/gemini-2.0-flash-exp:free'
);

-- Keep the distinct preview/lite/pro versions as they are
-- google/gemini-2.5-flash-preview-09-2025
-- google/gemini-2.5-flash-lite-preview-09-2025
-- google/gemini-2.5-pro
-- google/gemini-3-pro-preview


-- Add Gemini 2.5 Flash-Lite model (December 2025)
-- https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-flash-lite
-- Model: gemini-2.5-flash-lite-preview-09-2025 (Public Preview)
-- Context: 1M input tokens, 65K output tokens
-- Knowledge cutoff: January 2025

INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, supports_batch_pricing)
VALUES 
  ('google/gemini-2.5-flash-lite', 'Gemini 2.5 Flash-Lite', 'google', 'google', 'gemini-2.5-flash-lite-preview-09-2025', 
   '{"pricing":{"inputPer1K":"0.000075","outputPer1K":"0.0003"},"context_length":1000000,"max_output_tokens":65000}', 0);


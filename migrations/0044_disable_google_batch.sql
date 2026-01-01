-- Disable batch pricing for Google models
-- 
-- Google's Gemini API does not have a proper batch API endpoint like 
-- Anthropic or OpenAI. The batchGenerateContent endpoint doesn't work
-- as expected and requires Vertex AI + GCS integration.
--
-- Until proper Google batch support is implemented (using Vertex AI),
-- Google models should not use batch pricing.

UPDATE models SET supports_batch_pricing = 0 WHERE api_provider = 'google';

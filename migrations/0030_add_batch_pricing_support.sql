-- Add supports_batch_pricing column to models table
-- This indicates whether a model's provider supports batch API pricing
-- Used by admin UI to conditionally show discount pricing option

ALTER TABLE models ADD COLUMN supports_batch_pricing INTEGER NOT NULL DEFAULT 0;

-- Update models that support batch pricing based on their provider
-- Anthropic: Claude models (50% discount)
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'anthropic/%';
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'claude-%';

-- OpenAI: GPT-4 and GPT-4o models (50% discount)
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'openai/%';
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'gpt-%';

-- Google/Gemini: All Gemini models (50% discount via Vertex AI)
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'google/%';
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'gemini-%';

-- Cerebras: Fast inference with batch support (50% discount)
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'cerebras/%';

-- Fireworks: Batch inference (40% discount)
UPDATE models SET supports_batch_pricing = 1 WHERE id LIKE 'fireworks/%';

-- Providers WITHOUT batch support (openrouter, minimax) remain at default 0
-- OpenRouter is an aggregator, MiniMax doesn't have documented batch API

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_models_batch_pricing ON models(supports_batch_pricing);


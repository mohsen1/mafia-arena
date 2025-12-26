-- Seed static models for direct API providers
-- These models are available via direct API integration (not through OpenRouter)

-- Cerebras models (FREE inference!)
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, created_at)
VALUES 
  ('cerebras/llama-3.3-70b', 'Llama 3.3 70B (Cerebras FREE)', 'meta', 'cerebras', 'llama-3.3-70b', 
   '{"pricing":{"prompt":"0","completion":"0"},"context_length":131072}', strftime('%s','now') * 1000),
  ('cerebras/llama3.1-8b', 'Llama 3.1 8B (Cerebras FREE)', 'meta', 'cerebras', 'llama3.1-8b',
   '{"pricing":{"prompt":"0","completion":"0"},"context_length":131072}', strftime('%s','now') * 1000),
  ('cerebras/qwen-3-32b', 'Qwen 3 32B (Cerebras FREE)', 'qwen', 'cerebras', 'qwen-3-32b',
   '{"pricing":{"prompt":"0","completion":"0"},"context_length":131072}', strftime('%s','now') * 1000);

-- Fireworks models
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, created_at)
VALUES 
  ('fireworks/qwen3-coder-480b', 'Qwen3 Coder 480B (Fireworks)', 'qwen', 'fireworks', 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
   '{"pricing":{"prompt":"0.00000045","completion":"0.0000018"},"context_length":262144}', strftime('%s','now') * 1000),
  ('fireworks/llama-3.3-70b', 'Llama 3.3 70B (Fireworks)', 'meta', 'fireworks', 'accounts/fireworks/models/llama-v3p3-70b-instruct',
   '{"pricing":{"prompt":"0.0000002","completion":"0.0000002"},"context_length":131072}', strftime('%s','now') * 1000);

-- MiniMax models
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, created_at)
VALUES 
  ('minimax/MiniMax-M1', 'MiniMax-M1', 'minimax', 'minimax', 'MiniMax-M1',
   '{"pricing":{"prompt":"0.0000003","completion":"0.0000012"},"context_length":1000000}', strftime('%s','now') * 1000);

-- OpenAI direct models (if user has OPENAI_API_KEY)
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, created_at)
VALUES 
  ('openai/gpt-4o', 'GPT-4o (OpenAI Direct)', 'openai', 'openai', 'gpt-4o',
   '{"pricing":{"prompt":"0.0000025","completion":"0.00001"},"context_length":128000}', strftime('%s','now') * 1000),
  ('openai/gpt-4o-mini', 'GPT-4o Mini (OpenAI Direct)', 'openai', 'openai', 'gpt-4o-mini',
   '{"pricing":{"prompt":"0.00000015","completion":"0.0000006"},"context_length":128000}', strftime('%s','now') * 1000);

-- Google direct models (if user has GOOGLE_API_KEY)  
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, created_at)
VALUES 
  ('google/gemini-2.5-pro', 'Gemini 2.5 Pro (Google Direct)', 'google', 'google', 'gemini-2.5-pro-preview-06-05',
   '{"pricing":{"prompt":"0.00000125","completion":"0.00001"},"context_length":1000000}', strftime('%s','now') * 1000),
  ('google/gemini-2.5-flash', 'Gemini 2.5 Flash (Google Direct)', 'google', 'google', 'gemini-2.5-flash-preview-05-20',
   '{"pricing":{"prompt":"0.00000015","completion":"0.0000006"},"context_length":1000000}', strftime('%s','now') * 1000);

-- Anthropic direct models (if user has ANTHROPIC_API_KEY)
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config, created_at)
VALUES 
  ('anthropic/claude-sonnet-4', 'Claude Sonnet 4 (Anthropic Direct)', 'anthropic', 'anthropic', 'claude-sonnet-4-20250514',
   '{"pricing":{"prompt":"0.000003","completion":"0.000015"},"context_length":200000}', strftime('%s','now') * 1000),
  ('anthropic/claude-haiku-3.5', 'Claude 3.5 Haiku (Anthropic Direct)', 'anthropic', 'anthropic', 'claude-3-5-haiku-20241022',
   '{"pricing":{"prompt":"0.0000008","completion":"0.000004"},"context_length":200000}', strftime('%s','now') * 1000);


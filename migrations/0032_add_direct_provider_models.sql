-- Add latest models from direct API providers (December 2025)
-- These models use the direct provider APIs, not OpenRouter

-- ==== xAI (Grok) Models ====
-- API base: https://api.x.ai/v1
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config)
VALUES 
  ('xai/grok-4-1-fast', 'Grok 4.1 Fast', 'xai', 'xai', 'grok-4-1-fast-reasoning', 
   '{"pricing":{"prompt":"0.0000002","completion":"0.0000005"},"context_length":2000000}'),
  ('xai/grok-4-1-fast-non-reasoning', 'Grok 4.1 Fast (Non-Reasoning)', 'xai', 'xai', 'grok-4-1-fast-non-reasoning', 
   '{"pricing":{"prompt":"0.0000002","completion":"0.0000005"},"context_length":2000000}'),
  ('xai/grok-code-fast-1', 'Grok Code Fast 1', 'xai', 'xai', 'grok-code-fast-1', 
   '{"pricing":{"prompt":"0.0000002","completion":"0.0000015"},"context_length":256000}'),
  ('xai/grok-4', 'Grok 4', 'xai', 'xai', 'grok-4-0709', 
   '{"pricing":{"prompt":"0.000003","completion":"0.000015"},"context_length":256000}'),
  ('xai/grok-3', 'Grok 3', 'xai', 'xai', 'grok-3', 
   '{"pricing":{"prompt":"0.000003","completion":"0.000015"},"context_length":131072}'),
  ('xai/grok-3-mini', 'Grok 3 Mini', 'xai', 'xai', 'grok-3-mini', 
   '{"pricing":{"prompt":"0.0000003","completion":"0.0000005"},"context_length":131072}');

-- ==== DeepSeek Models ====
-- API base: https://api.deepseek.com/v1
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config)
VALUES 
  ('deepseek/deepseek-chat', 'DeepSeek V3.2 Chat', 'deepseek', 'deepseek', 'deepseek-chat', 
   '{"pricing":{"prompt":"0.00000028","completion":"0.00000042"},"context_length":128000}'),
  ('deepseek/deepseek-reasoner', 'DeepSeek V3.2 Reasoner', 'deepseek', 'deepseek', 'deepseek-reasoner', 
   '{"pricing":{"prompt":"0.00000028","completion":"0.00000042"},"context_length":128000}');

-- ==== Mistral Models ====
-- API base: https://api.mistral.ai/v1
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config)
VALUES 
  ('mistral/mistral-large-2512', 'Mistral Large 3', 'mistral', 'mistral', 'mistral-large-2512', 
   '{"pricing":{"prompt":"0.000002","completion":"0.000006"},"context_length":131072}'),
  ('mistral/mistral-medium-2508', 'Mistral Medium 3.1', 'mistral', 'mistral', 'mistral-medium-2508', 
   '{"pricing":{"prompt":"0.0000004","completion":"0.0000012"},"context_length":131072}'),
  ('mistral/mistral-small-2506', 'Mistral Small 3.2', 'mistral', 'mistral', 'mistral-small-2506', 
   '{"pricing":{"prompt":"0.0000001","completion":"0.0000003"},"context_length":32768}'),
  ('mistral/ministral-14b-2512', 'Ministral 3 14B', 'mistral', 'mistral', 'ministral-14b-2512', 
   '{"pricing":{"prompt":"0.00000003","completion":"0.00000009"},"context_length":131072}'),
  ('mistral/ministral-8b-2512', 'Ministral 3 8B', 'mistral', 'mistral', 'ministral-8b-2512', 
   '{"pricing":{"prompt":"0.00000001","completion":"0.00000003"},"context_length":131072}'),
  ('mistral/codestral-2508', 'Codestral', 'mistral', 'mistral', 'codestral-2508', 
   '{"pricing":{"prompt":"0.0000003","completion":"0.0000009"},"context_length":256000}'),
  ('mistral/devstral-2512', 'Devstral 2', 'mistral', 'mistral', 'devstral-2512', 
   '{"pricing":{"prompt":"0.0000003","completion":"0.0000009"},"context_length":131072}'),
  ('mistral/magistral-medium-2509', 'Magistral Medium 1.2', 'mistral', 'mistral', 'magistral-medium-2509', 
   '{"pricing":{"prompt":"0.000001","completion":"0.000005"},"context_length":131072}'),
  ('mistral/magistral-small-2509', 'Magistral Small 1.2', 'mistral', 'mistral', 'magistral-small-2509', 
   '{"pricing":{"prompt":"0.0000002","completion":"0.0000006"},"context_length":131072}'),
  ('mistral/mistral-small-creative', 'Mistral Small Creative', 'mistral', 'mistral', 'mistral-small-creative-2512', 
   '{"pricing":{"prompt":"0.0000001","completion":"0.0000003"},"context_length":32768}');

-- ==== Groq Models (FREE inference with rate limits) ====
-- API base: https://api.groq.com/openai/v1
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config)
VALUES 
  ('groq/llama-3.3-70b', 'Llama 3.3 70B (Groq)', 'meta', 'groq', 'llama-3.3-70b-versatile', 
   '{"pricing":{"prompt":"0.00000059","completion":"0.00000079"},"context_length":131072}'),
  ('groq/llama-3.1-8b', 'Llama 3.1 8B (Groq)', 'meta', 'groq', 'llama-3.1-8b-instant', 
   '{"pricing":{"prompt":"0.00000005","completion":"0.00000008"},"context_length":131072}'),
  ('groq/mixtral-8x7b', 'Mixtral 8x7B (Groq)', 'mistral', 'groq', 'mixtral-8x7b-32768', 
   '{"pricing":{"prompt":"0.00000024","completion":"0.00000024"},"context_length":32768}'),
  ('groq/gemma2-9b', 'Gemma 2 9B (Groq)', 'google', 'groq', 'gemma2-9b-it', 
   '{"pricing":{"prompt":"0.00000020","completion":"0.00000020"},"context_length":8192}');

-- ==== Together AI Models ====
-- API base: https://api.together.xyz/v1
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config)
VALUES 
  ('together/llama-3.3-70b', 'Llama 3.3 70B (Together)', 'meta', 'together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo', 
   '{"pricing":{"prompt":"0.00000088","completion":"0.00000088"},"context_length":131072}'),
  ('together/qwen-2.5-72b', 'Qwen 2.5 72B (Together)', 'qwen', 'together', 'Qwen/Qwen2.5-72B-Instruct-Turbo', 
   '{"pricing":{"prompt":"0.0000012","completion":"0.0000012"},"context_length":32768}'),
  ('together/deepseek-v3', 'DeepSeek V3 (Together)', 'deepseek', 'together', 'deepseek-ai/DeepSeek-V3', 
   '{"pricing":{"prompt":"0.00000049","completion":"0.00000049"},"context_length":131072}');

-- ==== Cohere Models ====
-- API base: https://api.cohere.ai/v1
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config)
VALUES 
  ('cohere/command-r-plus', 'Command R+', 'cohere', 'cohere', 'command-r-plus', 
   '{"pricing":{"prompt":"0.0000025","completion":"0.00001"},"context_length":128000}'),
  ('cohere/command-r', 'Command R', 'cohere', 'cohere', 'command-r', 
   '{"pricing":{"prompt":"0.00000015","completion":"0.0000006"},"context_length":128000}');

-- ==== AI21 Models ====
-- API base: https://api.ai21.com/studio/v1
INSERT OR REPLACE INTO models (id, display_name, family, api_provider, api_model_id, config)
VALUES 
  ('ai21/jamba-1.5-large', 'Jamba 1.5 Large', 'ai21', 'ai21', 'jamba-1.5-large', 
   '{"pricing":{"prompt":"0.000002","completion":"0.000008"},"context_length":256000}'),
  ('ai21/jamba-1.5-mini', 'Jamba 1.5 Mini', 'ai21', 'ai21', 'jamba-1.5-mini', 
   '{"pricing":{"prompt":"0.0000002","completion":"0.0000004"},"context_length":256000}');

-- ==== Update providers table with new providers ====
INSERT OR IGNORE INTO providers (id, display_name, api_type, base_url, is_aggregator, config, enabled, created_at) VALUES
  ('xai', 'xAI (Grok)', 'openai_compatible', 'https://api.x.ai/v1', 0, NULL, 1, strftime('%s','now')),
  ('deepseek', 'DeepSeek', 'openai_compatible', 'https://api.deepseek.com/v1', 0, NULL, 1, strftime('%s','now')),
  ('mistral', 'Mistral AI', 'openai_compatible', 'https://api.mistral.ai/v1', 0, NULL, 1, strftime('%s','now')),
  ('groq', 'Groq', 'openai_compatible', 'https://api.groq.com/openai/v1', 0, NULL, 1, strftime('%s','now')),
  ('together', 'Together AI', 'openai_compatible', 'https://api.together.xyz/v1', 0, NULL, 1, strftime('%s','now')),
  ('cohere', 'Cohere', 'custom', 'https://api.cohere.ai/v1', 0, NULL, 1, strftime('%s','now')),
  ('ai21', 'AI21 Labs', 'custom', 'https://api.ai21.com/studio/v1', 0, NULL, 1, strftime('%s','now')),
  ('sambanova', 'SambaNova', 'openai_compatible', 'https://api.sambanova.ai/v1', 0, NULL, 1, strftime('%s','now')),
  ('hyperbolic', 'Hyperbolic', 'openai_compatible', 'https://api.hyperbolic.xyz/v1', 0, NULL, 1, strftime('%s','now'));


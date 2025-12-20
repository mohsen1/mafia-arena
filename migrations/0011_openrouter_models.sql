-- Update AI models to use OpenRouter model IDs
-- Run with: wrangler d1 execute mafia-arena --remote --file=./migrations/0011_openrouter_models.sql
-- All models now use OpenRouter naming convention (provider/model-name)

-- Amazon Nova family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('amazon/nova-2-lite-v1', 'openrouter', 'Nova 2 Lite'),
  ('amazon/nova-lite-v1', 'openrouter', 'Nova Lite'),
  ('amazon/nova-premier-v1', 'openrouter', 'Nova Premier'),
  ('amazon/nova-pro-v1', 'openrouter', 'Nova Pro');

-- Anthropic Claude
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('anthropic/claude-sonnet-4.5', 'openrouter', 'Claude Sonnet 4.5');

-- Google Gemini family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('google/gemini-2.5-flash-lite-preview-09-2025', 'openrouter', 'Gemini 2.5 Flash Lite'),
  ('google/gemini-2.5-flash-preview-09-2025', 'openrouter', 'Gemini 2.5 Flash'),
  ('google/gemini-2.5-pro', 'openrouter', 'Gemini 2.5 Pro'),
  ('google/gemini-2.5-pro-preview-05-06', 'openrouter', 'Gemini 2.5 Pro Preview'),
  ('google/gemini-3-flash-preview', 'openrouter', 'Gemini 3 Flash'),
  ('google/gemini-3-pro-preview', 'openrouter', 'Gemini 3 Pro');

-- Meta Llama 4 family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('meta-llama/llama-4-maverick', 'openrouter', 'Llama 4 Maverick'),
  ('meta-llama/llama-4-scout', 'openrouter', 'Llama 4 Scout');

-- MiniMax family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('minimax/minimax-01', 'openrouter', 'MiniMax 01'),
  ('minimax/minimax-m1', 'openrouter', 'MiniMax M1');

-- Mistral family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('mistralai/devstral-2512', 'openrouter', 'Devstral'),
  ('mistralai/devstral-2512:free', 'openrouter', 'Devstral (Free)'),
  ('mistralai/ministral-14b-2512', 'openrouter', 'Ministral 14B'),
  ('mistralai/ministral-8b-2512', 'openrouter', 'Ministral 8B'),
  ('mistralai/mistral-large-2512', 'openrouter', 'Mistral Large');

-- Moonshot Kimi family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('moonshotai/kimi-k2-0905', 'openrouter', 'Kimi K2'),
  ('moonshotai/kimi-k2-0905:exacto', 'openrouter', 'Kimi K2 Exacto'),
  ('moonshotai/kimi-k2-thinking', 'openrouter', 'Kimi K2 Thinking');

-- NVIDIA Nemotron
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('nvidia/nemotron-3-nano-30b-a3b', 'openrouter', 'Nemotron 3 Nano');

-- OpenAI GPT-5.2 family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('openai/gpt-5.2', 'openrouter', 'GPT-5.2'),
  ('openai/gpt-5.2-pro', 'openrouter', 'GPT-5.2 Pro');

-- Qwen family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('qwen/qwen-plus-2025-07-28', 'openrouter', 'Qwen Plus'),
  ('qwen/qwen-plus-2025-07-28:thinking', 'openrouter', 'Qwen Plus Thinking'),
  ('qwen/qwen-turbo', 'openrouter', 'Qwen Turbo'),
  ('qwen/qwen3-30b-a3b-instruct-2507', 'openrouter', 'Qwen3 30B'),
  ('qwen/qwen3-next-80b-a3b-instruct', 'openrouter', 'Qwen3 Next 80B'),
  ('qwen/qwen3-vl-235b-a22b-instruct', 'openrouter', 'Qwen3 VL 235B'),
  ('qwen/qwen3-vl-235b-a22b-thinking', 'openrouter', 'Qwen3 VL 235B Thinking'),
  ('qwen/qwen3-vl-30b-a3b-instruct', 'openrouter', 'Qwen3 VL 30B'),
  ('qwen/qwen3-vl-32b-instruct', 'openrouter', 'Qwen3 VL 32B');

-- xAI Grok family
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('x-ai/grok-4-fast', 'openrouter', 'Grok 4 Fast'),
  ('x-ai/grok-4.1-fast', 'openrouter', 'Grok 4.1 Fast');

-- Xiaomi MiMo
INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  ('xiaomi/mimo-v2-flash:free', 'openrouter', 'MiMo V2 Flash (Free)');


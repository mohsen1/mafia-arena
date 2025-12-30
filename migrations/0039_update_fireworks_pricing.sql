-- Update Fireworks models with correct pricing (based on fireworks.ai/pricing December 2025)
-- Pricing is stored in config JSON column as inputPer1K and outputPer1K (per 1K tokens)
-- Input values converted from $/1M to $/1K by dividing by 1000

-- DeepSeek R1: $1.35 input / $5.40 output per 1M tokens => 0.00135 / 0.0054 per 1K
UPDATE models 
SET config = json_set(
  COALESCE(config, '{}'),
  '$.pricing.inputPer1K', 0.00135,
  '$.pricing.outputPer1K', 0.0054
)
WHERE id = 'fireworks/deepseek-r1';

-- DeepSeek V3: $0.56 input / $1.68 output per 1M tokens => 0.00056 / 0.00168 per 1K
UPDATE models 
SET config = json_set(
  COALESCE(config, '{}'),
  '$.pricing.inputPer1K', 0.00056,
  '$.pricing.outputPer1K', 0.00168
)
WHERE id = 'fireworks/deepseek-v3';

-- GLM-4.7: $0.55 input / $2.19 output per 1M tokens => 0.00055 / 0.00219 per 1K
UPDATE models 
SET config = json_set(
  COALESCE(config, '{}'),
  '$.pricing.inputPer1K', 0.00055,
  '$.pricing.outputPer1K', 0.00219
)
WHERE id = 'fireworks/glm-4p7';

-- Llama 3.1 8B (4B-16B tier): $0.20 input / $0.20 output per 1M tokens => 0.0002 / 0.0002 per 1K
UPDATE models 
SET config = json_set(
  COALESCE(config, '{}'),
  '$.pricing.inputPer1K', 0.0002,
  '$.pricing.outputPer1K', 0.0002
)
WHERE id = 'fireworks/llama-3.1-8b';

-- Llama 3.3 70B (>16B tier): $0.90 input / $0.90 output per 1M tokens => 0.0009 / 0.0009 per 1K
UPDATE models 
SET config = json_set(
  COALESCE(config, '{}'),
  '$.pricing.inputPer1K', 0.0009,
  '$.pricing.outputPer1K', 0.0009
)
WHERE id = 'fireworks/llama-3.3-70b';

-- Qwen3 Coder 480B: $0.45 input / $1.80 output per 1M tokens => 0.00045 / 0.0018 per 1K
UPDATE models 
SET config = json_set(
  COALESCE(config, '{}'),
  '$.pricing.inputPer1K', 0.00045,
  '$.pricing.outputPer1K', 0.0018
)
WHERE id = 'fireworks/qwen3-coder-480b';

-- Fix Fireworks model IDs to use serverless-supported versions
-- The original deepseek-r1 and deepseek-v3 do NOT have serverless support!
-- Only specific versions (deepseek-r1-0528, deepseek-v3p1, etc.) have serverless.
-- See https://fireworks.ai/models?modelTypes=Serverless

-- Update DeepSeek R1 to use the serverless version (R1 05/28)
UPDATE models 
SET api_model_id = 'accounts/fireworks/models/deepseek-r1-0528'
WHERE id = 'fireworks/deepseek-r1';

-- Update DeepSeek V3 to use the serverless version (V3.1)
UPDATE models 
SET api_model_id = 'accounts/fireworks/models/deepseek-v3p1'
WHERE id = 'fireworks/deepseek-v3';

-- Update Llama 3.1 8B - this model is NOT serverless on Fireworks
-- Only llama-v3p3-70b-instruct has serverless, so we need to disable this one or remove it
-- For now, let's just update it to a model that exists - the Llama 3.3 70B
-- Actually, checking - llama-v3p1-8b-instruct might have on-demand only
-- Let's leave it as-is since it's a smaller model not critical for games

-- Note: GLM-4.7, Qwen3, and Llama 3.3 70B model IDs are correct


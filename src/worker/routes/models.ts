/**
 * Models API routes.
 * Models are stored in the database and can be fetched from multiple providers.
 * 
 * ENDPOINTS:
 * - GET /api/models - List all models from database
 * - GET /api/models/providers - List all API providers
 * - GET /api/models/openrouter - Fetch models from OpenRouter (aggregator)
 * - GET /api/models/by-provider/:provider - Get models for a specific API provider
 */

import { Hono } from 'hono';
import type { Env, ApiProvider, ModelDbRecord } from '../types.js';
import { parsePricingFromConfig, DEFAULT_PRICING } from '../ai/models.js';

/**
 * Static model lists for direct API providers.
 * These providers don't have a "list models" API, so we maintain static lists.
 * Most recent frontier models (late 2025).
 * Curated manually. No legacy models.
 */
/**
 * Static model configuration with prefixed IDs for proper factory routing.
 * 
 * ID FORMAT: {provider}/{apiModelId}
 * - The prefix tells the factory which provider to use
 * - The apiModelId is what gets sent to the actual API
 * 
 * This is necessary because direct API providers don't have a "list models" endpoint,
 * so we maintain these curated lists manually.
 */
const DIRECT_PROVIDER_MODELS: Record<string, Array<{
  id: string;           // Prefixed ID for routing: provider/apiModelId
  apiModelId: string;   // Raw ID sent to the provider's API
  name: string;
  family: string;
  contextLength: number;
  pricing: { inputPer1M: number; outputPer1M: number };
}>> = {
  openai: [
    // GPT-5.2 family (latest Dec 2025)
    {
      id: 'openai/gpt-5.2-pro',
      apiModelId: 'gpt-5.2-pro',
      name: 'GPT-5.2 Pro',
      family: 'openai',
      contextLength: 400000,
      pricing: { inputPer1M: 21, outputPer1M: 168 },
    },
    {
      id: 'openai/gpt-5.2',
      apiModelId: 'gpt-5.2',
      name: 'GPT-5.2',
      family: 'openai',
      contextLength: 400000,
      pricing: { inputPer1M: 1.75, outputPer1M: 14 },
    },
    {
      id: 'openai/gpt-5.2-chat',
      apiModelId: 'gpt-5.2-chat',
      name: 'GPT-5.2 Chat',
      family: 'openai',
      contextLength: 128000,
      pricing: { inputPer1M: 1.75, outputPer1M: 14 },
    },
    // GPT-5.1 family
    {
      id: 'openai/gpt-5.1',
      apiModelId: 'gpt-5.1',
      name: 'GPT-5.1',
      family: 'openai',
      contextLength: 400000,
      pricing: { inputPer1M: 1.25, outputPer1M: 10 },
    },
    {
      id: 'openai/gpt-5.1-codex',
      apiModelId: 'gpt-5.1-codex',
      name: 'GPT-5.1 Codex',
      family: 'openai',
      contextLength: 400000,
      pricing: { inputPer1M: 1.25, outputPer1M: 10 },
    },
    // GPT-5 family
    {
      id: 'openai/gpt-5',
      apiModelId: 'gpt-5',
      name: 'GPT-5',
      family: 'openai',
      contextLength: 400000,
      pricing: { inputPer1M: 1.25, outputPer1M: 10 },
    },
    {
      id: 'openai/gpt-5-mini',
      apiModelId: 'gpt-5-mini',
      name: 'GPT-5 Mini',
      family: 'openai',
      contextLength: 400000,
      pricing: { inputPer1M: 0.25, outputPer1M: 2 },
    },
    // GPT-4o family (still popular)
    {
      id: 'openai/gpt-4o',
      apiModelId: 'gpt-4o',
      name: 'GPT-4o',
      family: 'openai',
      contextLength: 128000,
      pricing: { inputPer1M: 2.5, outputPer1M: 10 },
    },
    {
      id: 'openai/gpt-4o-mini',
      apiModelId: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      family: 'openai',
      contextLength: 128000,
      pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
    },
  ],

  google: [
    // Gemini 3 family (latest Dec 2025)
    {
      id: 'google/gemini-3-pro',
      apiModelId: 'gemini-3-pro-preview',
      name: 'Gemini 3 Pro',
      family: 'google',
      contextLength: 1048576,
      pricing: { inputPer1M: 2, outputPer1M: 12 },
    },
    {
      id: 'google/gemini-3-flash',
      apiModelId: 'gemini-3-flash-preview',
      name: 'Gemini 3 Flash',
      family: 'google',
      contextLength: 1048576,
      pricing: { inputPer1M: 0.5, outputPer1M: 3 },
    },
    // Gemini 2.5 family
    {
      id: 'google/gemini-2.5-pro',
      apiModelId: 'gemini-2.5-pro-preview-06-05',
      name: 'Gemini 2.5 Pro',
      family: 'google',
      contextLength: 1000000,
      pricing: { inputPer1M: 1.25, outputPer1M: 10 },
    },
    {
      id: 'google/gemini-2.5-flash',
      apiModelId: 'gemini-2.5-flash-preview-05-20',
      name: 'Gemini 2.5 Flash',
      family: 'google',
      contextLength: 1000000,
      pricing: { inputPer1M: 0.15, outputPer1M: 0.6 },
    },
  ],

  anthropic: [
    // Claude 4.5 family (latest Dec 2025)
    {
      id: 'anthropic/claude-opus-4.5',
      apiModelId: 'claude-opus-4-5-20251218',
      name: 'Claude Opus 4.5',
      family: 'anthropic',
      contextLength: 200000,
      pricing: { inputPer1M: 5, outputPer1M: 25 },
    },
    {
      id: 'anthropic/claude-sonnet-4.5',
      apiModelId: 'claude-sonnet-4-5-20251218',
      name: 'Claude Sonnet 4.5',
      family: 'anthropic',
      contextLength: 1000000,
      pricing: { inputPer1M: 3, outputPer1M: 15 },
    },
    {
      id: 'anthropic/claude-haiku-4.5',
      apiModelId: 'claude-haiku-4-5-20251218',
      name: 'Claude Haiku 4.5',
      family: 'anthropic',
      contextLength: 200000,
      pricing: { inputPer1M: 1, outputPer1M: 5 },
    },
    // Claude 4 family
    {
      id: 'anthropic/claude-opus-4',
      apiModelId: 'claude-opus-4-20250514',
      name: 'Claude Opus 4',
      family: 'anthropic',
      contextLength: 200000,
      pricing: { inputPer1M: 15, outputPer1M: 75 },
    },
    {
      id: 'anthropic/claude-sonnet-4',
      apiModelId: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      family: 'anthropic',
      contextLength: 1000000,
      pricing: { inputPer1M: 3, outputPer1M: 15 },
    },
    // Claude 3.5/3.7 family
    {
      id: 'anthropic/claude-3.7-sonnet',
      apiModelId: 'claude-3-7-sonnet-20250219',
      name: 'Claude 3.7 Sonnet',
      family: 'anthropic',
      contextLength: 200000,
      pricing: { inputPer1M: 3, outputPer1M: 15 },
    },
    {
      id: 'anthropic/claude-haiku-3.5',
      apiModelId: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      family: 'anthropic',
      contextLength: 200000,
      pricing: { inputPer1M: 0.8, outputPer1M: 4 },
    },
  ],

  fireworks: [
    // GLM-4.7 (latest Dec 2025)
    {
      id: 'fireworks/glm-4p7',
      apiModelId: 'accounts/fireworks/models/glm-4p7',
      name: 'GLM-4.7',
      family: 'glm',
      contextLength: 198000,
      pricing: { inputPer1M: 0.6, outputPer1M: 2.2 },
    },
    // DeepSeek R1 (reasoning model)
    {
      id: 'fireworks/deepseek-r1',
      apiModelId: 'accounts/fireworks/models/deepseek-r1',
      name: 'DeepSeek R1',
      family: 'deepseek',
      contextLength: 163840,
      pricing: { inputPer1M: 1.35, outputPer1M: 5.4 },
    },
    // DeepSeek V3
    {
      id: 'fireworks/deepseek-v3',
      apiModelId: 'accounts/fireworks/models/deepseek-v3',
      name: 'DeepSeek V3',
      family: 'deepseek',
      contextLength: 131072,
      pricing: { inputPer1M: 0.9, outputPer1M: 0.9 },
    },
    // Qwen family
    {
      id: 'fireworks/qwen3-coder-480b',
      apiModelId: 'accounts/fireworks/models/qwen3-coder-480b-a35b-instruct',
      name: 'Qwen3 Coder 480B',
      family: 'qwen',
      contextLength: 262144,
      pricing: { inputPer1M: 0.45, outputPer1M: 1.8 },
    },
    // Llama family
    {
      id: 'fireworks/llama-3.3-70b',
      apiModelId: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
      name: 'Llama 3.3 70B',
      family: 'meta',
      contextLength: 131072,
      pricing: { inputPer1M: 0.2, outputPer1M: 0.2 },
    },
    {
      id: 'fireworks/llama-3.1-8b',
      apiModelId: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
      name: 'Llama 3.1 8B',
      family: 'meta',
      contextLength: 131072,
      pricing: { inputPer1M: 0.2, outputPer1M: 0.2 },
    },
  ],

  cerebras: [
    {
      id: 'cerebras/llama-3.3-70b',
      apiModelId: 'llama-3.3-70b',
      name: 'Llama 3.3 70B (FREE)',
      family: 'meta',
      contextLength: 131072,
      pricing: { inputPer1M: 0, outputPer1M: 0 },
    },
    {
      id: 'cerebras/llama3.1-8b',
      apiModelId: 'llama3.1-8b',
      name: 'Llama 3.1 8B (FREE)',
      family: 'meta',
      contextLength: 131072,
      pricing: { inputPer1M: 0, outputPer1M: 0 },
    },
    {
      id: 'cerebras/qwen-3-32b',
      apiModelId: 'qwen-3-32b',
      name: 'Qwen 3 32B (FREE)',
      family: 'qwen',
      contextLength: 131072,
      pricing: { inputPer1M: 0, outputPer1M: 0 },
    },
  ],

  minimax: [
    {
      id: 'minimax/MiniMax-M1',
      apiModelId: 'MiniMax-M1',
      name: 'MiniMax-M1',
      family: 'minimax',
      contextLength: 1000000,
      pricing: { inputPer1M: 0.3, outputPer1M: 1.2 },
    },
    {
      // MiniMax-M2.1
      id: 'minimax/MiniMax-M2.1',
      apiModelId: 'MiniMax-M2.1',
      name: 'MiniMax-M2.1',
      family: 'minimax',
      contextLength: 1000000,
      pricing: { inputPer1M: 0.3, outputPer1M: 1.2 },
    },
    {
      // MiniMax-M2.1-lightning
      id: 'minimax/MiniMax-M2.1-lightning',
      apiModelId: 'MiniMax-M2.1-lightning',
      name: 'MiniMax-M2.1-lightning',
      family: 'minimax',
      contextLength: 204800,
      pricing: { inputPer1M: 0.3, outputPer1M: 2.4 },
    },
  ],
};


const models = new Hono<{ Bindings: Env }>();

// Cache keys for model data
const OPENROUTER_CACHE_KEY = 'openrouter:models';
const PROVIDERS_CACHE_KEY = 'providers:list';
const CACHE_TTL = 3600; // 1 hour

/**
 * Model eligibility requirements for Mafia Arena.
 * Models must meet these minimums to participate in games.
 */
const MODEL_REQUIREMENTS = {
  MIN_CONTEXT_LENGTH: 65_536,      // 64K tokens minimum
  MIN_OUTPUT_TOKENS: 1_024,        // 1K output tokens minimum
  REQUIRED_MODALITY: 'text',       // Must support text modality
} as const;

/**
 * OpenRouter model response type.
 */
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture?: {
    modality: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  top_provider?: {
    context_length: number;
    max_completion_tokens?: number;
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

/**
 * Check if a model meets eligibility requirements for Mafia Arena.
 */
function isModelEligible(model: OpenRouterModel): boolean {
  if (model.context_length < MODEL_REQUIREMENTS.MIN_CONTEXT_LENGTH) {
    return false;
  }

  const maxOutputTokens = model.top_provider?.max_completion_tokens;
  if (maxOutputTokens !== undefined && maxOutputTokens < MODEL_REQUIREMENTS.MIN_OUTPUT_TOKENS) {
    return false;
  }

  const modality = model.architecture?.modality ?? '';
  if (!modality.includes(MODEL_REQUIREMENTS.REQUIRED_MODALITY)) {
    return false;
  }

  return true;
}

/**
 * Transform a model record to the API response format.
 */
function transformModelRecord(model: ModelDbRecord) {
  return {
    id: model.id,
    displayName: model.display_name,
    family: model.family,
    apiProvider: model.api_provider,
    apiModelId: model.api_model_id,
    pricing: parsePricingFromConfig(model.config),
    createdAt: model.created_at,
    /** Whether this model's provider supports batch API pricing for 40-50% discount */
    supportsBatchPricing: model.supports_batch_pricing === 1,
  };
}

/**
 * GET /api/models - List all models from database.
 * Returns models with routing info and pricing.
 */
models.get('/', async (c) => {
  const env = c.env;
  
  const result = await env.DB.prepare(`
    SELECT id, display_name, family, api_provider, api_model_id, config, created_at, supports_batch_pricing 
    FROM models 
    ORDER BY family, display_name
  `).all<ModelDbRecord>();

  const modelsWithRouting = result.results.map(transformModelRecord);

  // Group by API provider for the UI
  const modelsByApiProvider: Record<string, typeof modelsWithRouting> = {};
  for (const model of modelsWithRouting) {
    const provider = model.apiProvider;
    if (!modelsByApiProvider[provider]) {
      modelsByApiProvider[provider] = [];
    }
    modelsByApiProvider[provider].push(model);
  }

  return c.json({ 
    models: modelsWithRouting,
    modelsByApiProvider,
    total: modelsWithRouting.length,
    defaults: {
      pricing: DEFAULT_PRICING,
    },
  });
});

/**
 * GET /api/models/providers - List all API providers.
 */
models.get('/providers', async (c) => {
  const env = c.env;

  // Check cache
  const cached = await env.RATE_LIMIT.get(PROVIDERS_CACHE_KEY);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  interface ProviderRow {
    id: string;
    display_name: string;
    api_type: string;
    base_url: string | null;
    is_aggregator: number;
    supports_streaming: number;
    supports_function_calling: number;
    enabled: number;
    config: string | null;
  }

  const result = await env.DB.prepare(`
    SELECT id, display_name, api_type, base_url, is_aggregator, 
           supports_streaming, supports_function_calling, enabled, config
    FROM providers 
    WHERE enabled = 1
    ORDER BY is_aggregator DESC, display_name
  `).all<ProviderRow>();

  const providers = result.results.map(p => ({
    id: p.id as ApiProvider,
    displayName: p.display_name,
    apiType: p.api_type,
    baseUrl: p.base_url,
    isAggregator: p.is_aggregator === 1,
    supportsStreaming: p.supports_streaming === 1,
    supportsFunctionCalling: p.supports_function_calling === 1,
    enabled: p.enabled === 1,
  }));

  const response = {
    providers,
    total: providers.length,
  };

  // Cache the result
  await env.RATE_LIMIT.put(PROVIDERS_CACHE_KEY, JSON.stringify(response), {
    expirationTtl: CACHE_TTL,
  });

  return c.json(response);
});

/**
 * GET /api/models/by-provider/:provider - Get models for a specific API provider.
 * For direct providers (non-OpenRouter), returns static model lists since
 * these APIs don't have a "list models" endpoint.
 */
models.get('/by-provider/:provider', async (c) => {
  const env = c.env;
  const provider = c.req.param('provider') as ApiProvider;

  // For OpenRouter, redirect to the dedicated endpoint
  if (provider === 'openrouter') {
    return c.redirect('/api/models/openrouter');
  }

  // Check for static model list first (for direct providers)
  const staticModels = DIRECT_PROVIDER_MODELS[provider];
  if (staticModels && staticModels.length > 0) {
    // Transform static models to match expected format
    // id is the prefixed routing ID (e.g., cerebras/llama-3.3-70b)
    // apiModelId is what gets sent to the actual API (e.g., llama-3.3-70b)
    const modelsForProvider = staticModels.map(m => ({
      id: m.id,
      displayName: m.name,
      family: m.family,
      apiProvider: provider,
      apiModelId: m.apiModelId,
      pricing: { input: m.pricing.inputPer1M / 1000, output: m.pricing.outputPer1M / 1000 },
      contextLength: m.contextLength,
      createdAt: Date.now(),
    }));

    // Group by family for UI display
    const modelsByFamily: Record<string, typeof modelsForProvider> = {};
    for (const model of modelsForProvider) {
      const family = model.family;
      if (!modelsByFamily[family]) {
        modelsByFamily[family] = [];
      }
      modelsByFamily[family]!.push(model);
    }

    return c.json({
      provider,
      isStatic: true,
      models: modelsForProvider,
      modelsByFamily,
      families: Object.keys(modelsByFamily).sort(),
      total: modelsForProvider.length,
    });
  }

  // Fallback to database lookup
  const result = await env.DB.prepare(`
    SELECT id, display_name, family, api_provider, api_model_id, config, created_at, supports_batch_pricing 
    FROM models 
    WHERE api_provider = ?
    ORDER BY family, display_name
  `).bind(provider).all<ModelDbRecord>();

  const modelsForProvider = result.results.map(transformModelRecord);

  // Group by family for UI display
  const modelsByFamily: Record<string, typeof modelsForProvider> = {};
  for (const model of modelsForProvider) {
    const family = model.family;
    if (!modelsByFamily[family]) {
      modelsByFamily[family] = [];
    }
    modelsByFamily[family]!.push(model);
  }

  return c.json({
    provider,
    models: modelsForProvider,
    modelsByFamily,
    families: Object.keys(modelsByFamily).sort(),
    total: modelsForProvider.length,
  });
});

/**
 * GET /api/models/openrouter - Fetch all models from OpenRouter API.
 * OpenRouter is an aggregator, so it returns models from many providers.
 * Caches response for 1 hour to avoid rate limits.
 */
models.get('/openrouter', async (c) => {
  const env = c.env;

  // Check cache first
  const cached = await env.RATE_LIMIT.get(OPENROUTER_CACHE_KEY);
  if (cached) {
    return c.json(JSON.parse(cached));
  }

  // Fetch from OpenRouter
  const response = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('OpenRouter API error:', response.status, await response.text());
    return c.json({ error: 'Failed to fetch models from OpenRouter' }, 500);
  }

  const data = await response.json() as OpenRouterResponse;

  // Filter models by eligibility requirements
  const eligibleModels = data.data.filter(isModelEligible);
  console.log(`Model eligibility: ${eligibleModels.length}/${data.data.length} models meet requirements`);

  // Transform and group by family (model creator)
  const modelsByFamily: Record<string, Array<{
    id: string;
    name: string;
    description?: string;
    contextLength: number;
    pricing: {
      inputPer1M: number;
      outputPer1M: number;
    };
    apiProvider: 'openrouter';
    apiModelId: string;
  }>> = {};

  for (const model of eligibleModels) {
    // Extract family from model ID (e.g., "google/gemini-2.5-pro" -> "google")
    const family = model.id.split('/')[0] || 'unknown';
    
    if (!modelsByFamily[family]) {
      modelsByFamily[family] = [];
    }

    modelsByFamily[family].push({
      id: model.id,
      name: model.name,
      ...(model.description && { description: model.description }),
      contextLength: model.context_length,
      pricing: {
        inputPer1M: parseFloat(model.pricing.prompt) * 1_000_000,
        outputPer1M: parseFloat(model.pricing.completion) * 1_000_000,
      },
      apiProvider: 'openrouter',
      apiModelId: model.id,
    });
  }

  // Sort models within each family by name
  for (const family of Object.keys(modelsByFamily)) {
    const familyModels = modelsByFamily[family];
    if (familyModels) {
      familyModels.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  const result = {
    apiProvider: 'openrouter' as const,
    isAggregator: true,
    providers: Object.keys(modelsByFamily).sort(), // families, kept for backwards compat
    families: Object.keys(modelsByFamily).sort(),
    modelsByProvider: modelsByFamily, // kept for backwards compat
    modelsByFamily,
    totalModels: eligibleModels.length,
    totalFetched: data.data.length,
    cachedAt: Date.now(),
  };

  // Cache the result
  await env.RATE_LIMIT.put(OPENROUTER_CACHE_KEY, JSON.stringify(result), {
    expirationTtl: CACHE_TTL,
  });

  return c.json(result);
});

export default models;

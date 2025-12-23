/**
 * Models API routes.
 * Models are stored in the database and synced from OpenRouter.
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { parsePricingFromConfig } from '../ai/models.js';

const models = new Hono<{ Bindings: Env }>();

// Cache key for OpenRouter models
const OPENROUTER_CACHE_KEY = 'openrouter:models';
const OPENROUTER_CACHE_TTL = 3600; // 1 hour

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
 * Filters out models with insufficient context, output limits, or wrong modality.
 */
function isModelEligible(model: OpenRouterModel): boolean {
  // Check minimum context length
  if (model.context_length < MODEL_REQUIREMENTS.MIN_CONTEXT_LENGTH) {
    return false;
  }

  // Check minimum output tokens (if available)
  const maxOutputTokens = model.top_provider?.max_completion_tokens;
  if (maxOutputTokens !== undefined && maxOutputTokens < MODEL_REQUIREMENTS.MIN_OUTPUT_TOKENS) {
    return false;
  }

  // Check modality includes text
  const modality = model.architecture?.modality ?? '';
  if (!modality.includes(MODEL_REQUIREMENTS.REQUIRED_MODALITY)) {
    return false;
  }

  return true;
}

/**
 * GET /api/models - List all models from database.
 * Returns models with pricing parsed from config JSON.
 */
models.get('/', async (c) => {
  const env = c.env;
  
  interface ModelRow {
    id: string;
    display_name: string;
    provider: string;
    config: string | null;
    created_at: number;
  }
  
  const result = await env.DB.prepare('SELECT * FROM models ORDER BY provider, display_name').all<ModelRow>();

  // Add pricing from config JSON
  const modelsWithPricing = result.results.map((model) => ({
    id: model.id,
    displayName: model.display_name,
    provider: model.provider,
    pricing: parsePricingFromConfig(model.config),
    createdAt: model.created_at,
  }));

  return c.json({ 
    models: modelsWithPricing,
    total: modelsWithPricing.length,
  });
});

/**
 * GET /api/models/openrouter - Fetch all models from OpenRouter API.
 * Caches response for 1 hour to avoid rate limits.
 * Returns models grouped by provider with pricing info.
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

  // Transform and group by provider
  const modelsByProvider: Record<string, Array<{
    id: string;
    name: string;
    description?: string;
    contextLength: number;
    pricing: {
      inputPer1M: number;
      outputPer1M: number;
    };
  }>> = {};

  for (const model of eligibleModels) {
    // Extract provider from model ID (e.g., "google/gemini-2.5-pro" -> "google")
    const provider = model.id.split('/')[0] || 'unknown';
    
    if (!modelsByProvider[provider]) {
      modelsByProvider[provider] = [];
    }

    modelsByProvider[provider].push({
      id: model.id,
      name: model.name,
      ...(model.description && { description: model.description }),
      contextLength: model.context_length,
      pricing: {
        // Convert from per-token to per-1M tokens for readability
        inputPer1M: parseFloat(model.pricing.prompt) * 1_000_000,
        outputPer1M: parseFloat(model.pricing.completion) * 1_000_000,
      },
    });
  }

  // Sort models within each provider by name
  for (const provider of Object.keys(modelsByProvider)) {
    modelsByProvider[provider]!.sort((a, b) => a.name.localeCompare(b.name));
  }

  const result = {
    providers: Object.keys(modelsByProvider).sort(),
    modelsByProvider,
    totalModels: eligibleModels.length,
    totalFetched: data.data.length,
    cachedAt: Date.now(),
  };

  // Cache the result
  await env.RATE_LIMIT.put(OPENROUTER_CACHE_KEY, JSON.stringify(result), {
    expirationTtl: OPENROUTER_CACHE_TTL,
  });

  return c.json(result);
});

export default models;

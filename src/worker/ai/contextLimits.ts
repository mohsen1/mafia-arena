/**
 * Model context limit management.
 * 
 * Fetches and caches model context_length from OpenRouter API.
 * Uses KV for caching with 24h TTL to minimize API calls.
 */

import type { Env } from '../types.js';

/**
 * Default context limit for unknown models (conservative).
 * Most free-tier models have at least 8K context.
 */
const DEFAULT_CONTEXT_LIMIT = 8192;

/**
 * Cache TTL for model context limits (24 hours in seconds).
 */
const CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * KV key prefix for model context limits.
 */
const CACHE_KEY_PREFIX = 'model:context:';

/**
 * Well-known model context limits as fallbacks.
 * Updated December 2025.
 */
const KNOWN_MODEL_LIMITS: Record<string, number> = {
  // OpenAI
  'openai/gpt-4o': 128000,
  'openai/gpt-4o-mini': 128000,
  'openai/gpt-4-turbo': 128000,
  'openai/gpt-4': 8192,
  'openai/gpt-3.5-turbo': 16385,
  'openai/o1': 128000,
  'openai/o1-mini': 128000,
  'openai/o1-preview': 128000,
  
  // Anthropic
  'anthropic/claude-3.5-sonnet': 200000,
  'anthropic/claude-3.5-sonnet-20241022': 200000,
  'anthropic/claude-3-opus': 200000,
  'anthropic/claude-3-sonnet': 200000,
  'anthropic/claude-3-haiku': 200000,
  'anthropic/claude-opus-4': 200000,
  
  // Google
  'google/gemini-2.0-flash-exp': 1048576,
  'google/gemini-2.0-flash': 1048576,
  'google/gemini-1.5-pro': 2097152,
  'google/gemini-1.5-flash': 1048576,
  'google/gemini-pro': 32768,
  
  // Meta
  'meta-llama/llama-3.3-70b-instruct': 131072,
  'meta-llama/llama-3.1-405b-instruct': 131072,
  'meta-llama/llama-3.1-70b-instruct': 131072,
  'meta-llama/llama-3.1-8b-instruct': 131072,
  
  // Free tier models (typically smaller context)
  'nvidia/nemotron-3-nano-30b-a3b:free': 8192,
  'google/gemini-2.0-flash-exp:free': 1048576,
  'meta-llama/llama-3.2-3b-instruct:free': 131072,
  'qwen/qwen-2.5-72b-instruct:free': 32768,
  
  // Mistral
  'mistralai/mistral-large': 128000,
  'mistralai/mistral-medium': 32768,
  'mistralai/mistral-small': 32768,
  'mistralai/mixtral-8x7b-instruct': 32768,
  
  // DeepSeek
  'deepseek/deepseek-chat': 65536,
  'deepseek/deepseek-coder': 65536,
};

/**
 * OpenRouter model metadata response type.
 */
interface OpenRouterModelData {
  id: string;
  context_length: number;
  name?: string;
}

/**
 * Get the context limit for a model.
 * Checks cache first, then known limits, then fetches from OpenRouter API.
 * 
 * @param modelId - The OpenRouter model ID (e.g., "openai/gpt-4o")
 * @param env - Worker environment with KV and API key
 * @returns Context limit in tokens
 */
export async function getModelContextLimit(
  modelId: string,
  env: Env
): Promise<number> {
  // 1. Check KV cache
  const cacheKey = `${CACHE_KEY_PREFIX}${modelId}`;
  try {
    const cached = await env.RATE_LIMIT.get(cacheKey);
    if (cached) {
      const limit = parseInt(cached, 10);
      if (!isNaN(limit) && limit > 0) {
        return limit;
      }
    }
  } catch {
    // Cache miss or error, continue to fallbacks
  }

  // 2. Check known limits
  const knownLimit = KNOWN_MODEL_LIMITS[modelId];
  if (knownLimit) {
    // Cache the known limit
    await cacheContextLimit(modelId, knownLimit, env);
    return knownLimit;
  }

  // 3. Try to fetch from OpenRouter API
  try {
    const limit = await fetchModelContextLimit(modelId, env);
    if (limit) {
      await cacheContextLimit(modelId, limit, env);
      return limit;
    }
  } catch (error) {
    console.warn(`Failed to fetch context limit for ${modelId}:`, error);
  }

  // 4. Return conservative default
  return DEFAULT_CONTEXT_LIMIT;
}

/**
 * Fetch context limit from OpenRouter API.
 */
async function fetchModelContextLimit(
  modelId: string,
  env: Env
): Promise<number | null> {
  if (!env.OPENROUTER_API_KEY) {
    return null;
  }

  try {
    // OpenRouter provides model info at /api/v1/models
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { data: OpenRouterModelData[] };
    const model = data.data.find(m => m.id === modelId);
    
    if (model?.context_length) {
      return model.context_length;
    }
  } catch {
    // API call failed
  }

  return null;
}

/**
 * Cache a model's context limit in KV.
 */
async function cacheContextLimit(
  modelId: string,
  limit: number,
  env: Env
): Promise<void> {
  const cacheKey = `${CACHE_KEY_PREFIX}${modelId}`;
  try {
    await env.RATE_LIMIT.put(cacheKey, limit.toString(), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch {
    // Caching failed, non-critical
  }
}

/**
 * Get context limits for multiple models at once.
 * Efficiently batches lookups.
 * 
 * @param modelIds - Array of model IDs
 * @param env - Worker environment
 * @returns Map of model ID to context limit
 */
export async function getModelContextLimits(
  modelIds: readonly string[],
  env: Env
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(modelIds)];
  const limits = new Map<string, number>();
  
  await Promise.all(
    uniqueIds.map(async (modelId) => {
      const limit = await getModelContextLimit(modelId, env);
      limits.set(modelId, limit);
    })
  );
  
  return limits;
}

/**
 * Check if a model has a small context window (< 32K).
 * Small context models need more aggressive summarization.
 */
export function isSmallContextModel(contextLimit: number): boolean {
  return contextLimit < 32000;
}

/**
 * Calculate the safe prompt token limit for a model.
 * Reserves tokens for the response (20% of context).
 * 
 * @param contextLimit - The model's full context window
 * @param reserveForResponse - Fraction to reserve for response (default 0.2)
 * @returns Safe limit for prompt tokens
 */
export function getSafePromptLimit(
  contextLimit: number,
  reserveForResponse = 0.2
): number {
  return Math.floor(contextLimit * (1 - reserveForResponse));
}

/**
 * Get the threshold at which summarization should trigger.
 * Smaller context models trigger earlier (70%), larger models later (85%).
 * 
 * @param contextLimit - The model's context window
 * @returns Threshold as fraction (0.0 - 1.0)
 */
export function getSummarizationThreshold(contextLimit: number): number {
  if (contextLimit < 16000) {
    return 0.6; // Very small context: trigger at 60%
  } else if (contextLimit < 32000) {
    return 0.7; // Small context: trigger at 70%
  } else if (contextLimit < 100000) {
    return 0.8; // Medium context: trigger at 80%
  } else {
    return 0.85; // Large context: trigger at 85%
  }
}


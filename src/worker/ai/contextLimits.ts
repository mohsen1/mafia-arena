/**
 * Model context limit management.
 * 
 * Fetches and caches model context_length from OpenRouter API.
 * Uses KV for caching with 24h TTL to minimize API calls.
 */

import type { Env } from '../types.js';

/**
 * Default context limit for unknown models (conservative).
 * Most models have at least 8K context.
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
 * OpenRouter model metadata response type.
 */
interface OpenRouterModelData {
  id: string;
  context_length: number;
  name?: string;
}

/**
 * Get the context limit for a model.
 * Checks KV cache first, then fetches from OpenRouter API.
 * Falls back to conservative default if unavailable.
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
    // Cache miss or error, continue to API
  }

  // 2. Try to fetch from OpenRouter API
  try {
    const limit = await fetchModelContextLimit(modelId, env);
    if (limit) {
      await cacheContextLimit(modelId, limit, env);
      return limit;
    }
  } catch (error) {
    console.warn(`Failed to fetch context limit for ${modelId}:`, error);
  }

  // 3. Return conservative default
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
 */
export function getSafePromptLimit(
  contextLimit: number,
  reserveForResponse = 0.2
): number {
  return Math.floor(contextLimit * (1 - reserveForResponse));
}

/**
 * Get the threshold at which summarization should trigger.
 * Smaller context models trigger earlier.
 */
export function getSummarizationThreshold(contextLimit: number): number {
  if (contextLimit < 16000) return 0.6;
  if (contextLimit < 32000) return 0.7;
  if (contextLimit < 100000) return 0.8;
  return 0.85;
}

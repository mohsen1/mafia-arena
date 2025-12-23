/**
 * AI Provider factory.
 * All models are routed through OpenRouter's unified API.
 */

import type { Env } from '../types.js';
import type { AIProviderInterface } from './types.js';
import { SUPPORTED_MODELS } from './models.js';
import { AIErrors } from './errors.js';
import { RetryingProvider } from './RetryingProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';

export interface CreateProviderOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  /**
   * Enable discount pricing mode for longer timeouts and more retries.
   * AI providers may take up to 24 hours to respond in this mode.
   */
  discountPricing?: boolean;
}

/**
 * Default timeouts and retries for different pricing modes.
 */
const PRICING_MODE_DEFAULTS = {
  STANDARD: {
    timeoutMs: 60000,       // 60 seconds
    maxRetries: 8,
    baseDelayMs: 3000,      // 3 seconds
    maxDelayMs: 60000,      // 60 seconds
  },
  DISCOUNT: {
    timeoutMs: 300000,      // 5 minutes (longer individual request timeout)
    maxRetries: 20,         // More retries for long-running requests
    baseDelayMs: 10000,     // 10 seconds base delay
    maxDelayMs: 300000,     // 5 minutes max delay between retries
  },
} as const;

/**
 * Create an AI provider for the given model.
 * All models are routed through OpenRouter.
 */
export function createProvider(
  modelId: string,
  env: Env,
  options: CreateProviderOptions = {}
): AIProviderInterface {
  const modelConfig = SUPPORTED_MODELS[modelId];
  if (!modelConfig) {
    throw AIErrors.unsupportedModel(modelId);
  }

  // Select defaults based on pricing mode
  const defaults = options.discountPricing 
    ? PRICING_MODE_DEFAULTS.DISCOUNT 
    : PRICING_MODE_DEFAULTS.STANDARD;

  const { 
    enableRetry = true, 
    maxRetries = defaults.maxRetries, 
    timeoutMs = defaults.timeoutMs,
  } = options;

  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required');
  }

  const provider = new OpenRouterProvider({
    apiKey: env.OPENROUTER_API_KEY,
    modelId,
    timeoutMs,
  });

  if (enableRetry) {
    return new RetryingProvider(provider, { 
      maxRetries,
      baseDelayMs: defaults.baseDelayMs,
      maxDelayMs: defaults.maxDelayMs,
    });
  }

  return provider;
}

/**
 * Create providers for all models in a game configuration.
 * Returns a map of modelId -> provider.
 * 
 * When discountPricing is enabled:
 * - Longer individual request timeouts (5 min vs 60s)
 * - More retry attempts (20 vs 8)
 * - Longer delays between retries (10s-5min vs 3s-60s)
 */
export function createProvidersForGame(
  modelIds: readonly string[],
  env: Env,
  options: CreateProviderOptions = {}
): Map<string, AIProviderInterface> {
  const providers = new Map<string, AIProviderInterface>();

  const uniqueModelIds = [...new Set(modelIds)];
  for (const modelId of uniqueModelIds) {
    providers.set(modelId, createProvider(modelId, env, options));
  }

  return providers;
}


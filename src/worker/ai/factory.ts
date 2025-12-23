/**
 * AI Provider factory.
 * All models are routed through OpenRouter's unified API.
 * 
 * TEST MODELS:
 * Models with IDs starting with 'test/' use MockE2EProvider instead of OpenRouter.
 * This enables zero-cost E2E testing without calling actual LLMs.
 * Supported test models: test/mock-fast, test/town-wins, test/mafia-wins
 */

import type { Env } from '../types.js';
import type { AIProviderInterface } from './types.js';
import { getDefaultModelConfig } from './models.js';
import { RetryingProvider } from './RetryingProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { MockE2EProvider, isTestModel } from './providers/MockE2EProvider.js';

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
 * 
 * - Test models (test/*): Use MockE2EProvider for zero-cost testing
 * - All other models: Route through OpenRouter
 */
export function createProvider(
  modelId: string,
  env: Env,
  options: CreateProviderOptions = {}
): AIProviderInterface {
  // INTERCEPT: Test models use mock provider (zero cost, instant responses)
  if (isTestModel(modelId)) {
    console.log(`Creating MOCK provider for test model: ${modelId}`);
    return new MockE2EProvider(modelId);
  }

  // Get default config for logging/display purposes
  const modelConfig = getDefaultModelConfig(modelId);
  console.log(`Creating provider for model: ${modelId} (${modelConfig.displayName})`);

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

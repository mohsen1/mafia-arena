/**
 * AI Provider factory.
 * 
 * ROUTING LOGIC:
 * 1. Test models (test/*): MockE2EProvider (zero cost)
 * 2. Google models + GOOGLE_API_KEY: GoogleAIProvider direct (own rate limits)
 *    - Falls back to OpenRouter if Google direct fails
 * 3. All other models: OpenRouter
 * 
 * TEST MODELS:
 * Models with IDs starting with 'test/' use MockE2EProvider instead of OpenRouter.
 * This enables zero-cost E2E testing without calling actual LLMs.
 * Supported test models: test/mock-fast, test/town-wins, test/mafia-wins
 */

import type { Env } from '../types.js';
import type { AIProviderInterface, CompletionRequest, CompletionResponse } from './types.js';
import { getDefaultModelConfig } from './models.js';
import { RetryingProvider } from './RetryingProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { GoogleAIProvider } from './providers/GoogleAIProvider.js';
import { MockE2EProvider, isTestModel } from './providers/MockE2EProvider.js';

/**
 * Simple fallback provider that tries primary first, then secondary.
 * If primary fails for any reason, we try the secondary provider.
 */
class FallbackProvider implements AIProviderInterface {
  readonly name = 'fallback-wrapper';
  
  constructor(
    private readonly primary: AIProviderInterface,
    private readonly secondary: AIProviderInterface,
    readonly modelId: string
  ) {}

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    try {
      return await this.primary.complete(request);
    } catch (error) {
      console.warn(`[FallbackProvider] Primary (${this.primary.name}) failed for ${this.modelId}, trying fallback (${this.secondary.name}):`, 
        error instanceof Error ? error.message : error);
      return await this.secondary.complete(request);
    }
  }
}

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
 * Check if a model ID is a Google model.
 */
function isGoogleModel(modelId: string): boolean {
  return modelId.startsWith('google/') || 
         modelId.startsWith('gemini-') ||
         modelId.includes('gemini');
}

/**
 * Create an AI provider for the given model.
 * 
 * Routing:
 * - Test models (test/*): MockE2EProvider for zero-cost testing
 * - Google models + GOOGLE_API_KEY: GoogleAIProvider (direct) with OpenRouter fallback
 * - All other models: OpenRouter
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

  // Base OpenRouter provider (used for non-Google models and as fallback)
  const openRouterProvider = new OpenRouterProvider({
    apiKey: env.OPENROUTER_API_KEY,
    modelId,
    timeoutMs,
  });

  // For Google models with GOOGLE_API_KEY: Use direct Google API with OpenRouter fallback
  // This avoids OpenRouter's shared rate limits for free Google models
  if (isGoogleModel(modelId) && env.GOOGLE_API_KEY) {
    console.log(`[Factory] Using direct Google API for ${modelId} (with OpenRouter fallback)`);
    
    const googleProvider = new GoogleAIProvider(modelId, env.GOOGLE_API_KEY, timeoutMs);
    
    // Wrap both providers with retry logic
    const retryingGoogle = enableRetry 
      ? new RetryingProvider(googleProvider, {
          maxRetries,
          baseDelayMs: defaults.baseDelayMs,
          maxDelayMs: defaults.maxDelayMs,
        })
      : googleProvider;

    const retryingOpenRouter = enableRetry
      ? new RetryingProvider(openRouterProvider, {
          maxRetries,
          baseDelayMs: defaults.baseDelayMs,
          maxDelayMs: defaults.maxDelayMs,
        })
      : openRouterProvider;

    // FallbackProvider: Try Google Direct first, fall back to OpenRouter
    return new FallbackProvider(retryingGoogle, retryingOpenRouter, modelId);
  }

  // Standard OpenRouter path for non-Google models
  if (enableRetry) {
    return new RetryingProvider(openRouterProvider, { 
      maxRetries,
      baseDelayMs: defaults.baseDelayMs,
      maxDelayMs: defaults.maxDelayMs,
    });
  }

  return openRouterProvider;
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

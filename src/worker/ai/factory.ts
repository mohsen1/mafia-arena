/**
 * AI Provider factory.
 * 
 * ROUTING LOGIC:
 * 1. Test models (test/*): MockE2EProvider (zero cost)
 * 2. All other models: Route based on api_provider from database/config
 *    - openrouter: OpenRouter aggregator (default)
 *    - openai: Direct OpenAI API
 *    - anthropic: Direct Anthropic API
 *    - google: Direct Google Gemini API
 *    - cerebras: Cerebras API (OpenAI-compatible)
 *    - fireworks: Fireworks AI API (OpenAI-compatible)
 *    - minimax: MiniMax API
 * 
 * FALLBACK BEHAVIOR:
 * For Google models with GOOGLE_API_KEY: Use direct Google API with OpenRouter fallback.
 * This is preserved for backward compatibility with the old routing behavior.
 */

import type { Env, ApiProvider } from '../types.js';
import type { AIProviderInterface, CompletionRequest, CompletionResponse, ModelRoutingConfig } from './types.js';
import { getDefaultModelConfig } from './models.js';
import { RetryingProvider } from './RetryingProvider.js';
import { 
  OpenRouterProvider, 
  GoogleAIProvider, 
  OpenAIProvider, 
  AnthropicProvider,
  CerebrasProvider,
  FireworksProvider,
  MinimaxProvider,
} from './providers/index.js';
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
  /**
   * Model routing configuration from database.
   * If provided, uses this for routing instead of inferring from model ID.
   */
  routingConfig?: ModelRoutingConfig;
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
 * Used for backward-compatible fallback behavior.
 */
function isGoogleModel(modelId: string): boolean {
  return modelId.startsWith('google/') || 
         modelId.startsWith('gemini-') ||
         modelId.includes('gemini');
}

/**
 * Infer the API provider from a model ID.
 * Used when no routing config is provided.
 */
function inferApiProvider(modelId: string, env: Env): ApiProvider {
  // Direct provider prefix detection (for new-style model IDs)
  if (modelId.startsWith('openai/') && env.OPENAI_API_KEY) return 'openai';
  if (modelId.startsWith('anthropic/') && env.ANTHROPIC_API_KEY) return 'anthropic';
  if (modelId.startsWith('cerebras/') && env.CEREBRAS_API_KEY) return 'cerebras';
  if (modelId.startsWith('fireworks/') && env.FIREWORKS_API_KEY) return 'fireworks';
  if (modelId.startsWith('minimax/') && env.MINIMAX_API_KEY) return 'minimax';
  
  // Google models get direct access if we have the key
  if (isGoogleModel(modelId) && env.GOOGLE_API_KEY) {
    return 'google';
  }
  
  // Default to OpenRouter
  return 'openrouter';
}

/**
 * Extract the actual model ID to send to the API.
 * For OpenRouter, this is the full ID. For direct providers, strip the prefix.
 */
function extractApiModelId(modelId: string, apiProvider: ApiProvider): string {
  // OpenRouter uses the full model ID
  if (apiProvider === 'openrouter') return modelId;
  
  // For direct providers, strip the provider prefix if present
  const prefixMap: Record<ApiProvider, string> = {
    openrouter: '',
    openai: 'openai/',
    anthropic: 'anthropic/',
    google: 'google/',
    cerebras: 'cerebras/',
    fireworks: 'fireworks/',
    minimax: 'minimax/',
  };
  
  const prefix = prefixMap[apiProvider];
  if (prefix && modelId.startsWith(prefix)) {
    return modelId.slice(prefix.length);
  }
  
  return modelId;
}

/**
 * Create an AI provider for the given model.
 * 
 * Routing priority:
 * 1. If routingConfig is provided, use its apiProvider and apiModelId
 * 2. If model ID starts with a known provider prefix, use that provider
 * 3. For Google models with GOOGLE_API_KEY, use Google direct with fallback
 * 4. Default to OpenRouter
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
  
  // Determine routing
  const routingConfig = options.routingConfig;
  const apiProvider: ApiProvider = routingConfig?.apiProvider ?? inferApiProvider(modelId, env);
  const apiModelId = routingConfig?.apiModelId ?? extractApiModelId(modelId, apiProvider);
  
  console.log(`Creating provider for model: ${modelId} (${modelConfig.displayName}) via ${apiProvider} as ${apiModelId}`);

  // Select defaults based on pricing mode
  const defaults = options.discountPricing 
    ? PRICING_MODE_DEFAULTS.DISCOUNT 
    : PRICING_MODE_DEFAULTS.STANDARD;

  const { 
    enableRetry = true, 
    maxRetries = defaults.maxRetries, 
    timeoutMs = defaults.timeoutMs,
  } = options;

  // Create the base provider based on apiProvider
  const baseProvider = createBaseProvider(apiProvider, apiModelId, modelId, env, timeoutMs);
  
  // Special case: Google models get OpenRouter fallback for resilience
  if (apiProvider === 'google' && env.OPENROUTER_API_KEY) {
    const openRouterProvider = new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      modelId,
      timeoutMs,
    });

    const retryingPrimary = enableRetry 
      ? new RetryingProvider(baseProvider, {
          maxRetries,
          baseDelayMs: defaults.baseDelayMs,
          maxDelayMs: defaults.maxDelayMs,
        })
      : baseProvider;

    const retryingFallback = enableRetry
      ? new RetryingProvider(openRouterProvider, {
          maxRetries,
          baseDelayMs: defaults.baseDelayMs,
          maxDelayMs: defaults.maxDelayMs,
        })
      : openRouterProvider;

    return new FallbackProvider(retryingPrimary, retryingFallback, modelId);
  }

  // Standard path: wrap with retry if enabled
  if (enableRetry) {
    return new RetryingProvider(baseProvider, { 
      maxRetries,
      baseDelayMs: defaults.baseDelayMs,
      maxDelayMs: defaults.maxDelayMs,
    });
  }

  return baseProvider;
}

/**
 * Create the base provider for a given API provider type.
 */
function createBaseProvider(
  apiProvider: ApiProvider,
  apiModelId: string,
  displayModelId: string,
  env: Env,
  timeoutMs: number
): AIProviderInterface {
  switch (apiProvider) {
    case 'openai':
      if (!env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required for OpenAI models');
      }
      return new OpenAIProvider(apiModelId, env.OPENAI_API_KEY, timeoutMs);

    case 'anthropic':
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is required for Anthropic models');
      }
      return new AnthropicProvider(apiModelId, env.ANTHROPIC_API_KEY, timeoutMs);

    case 'google':
      if (!env.GOOGLE_API_KEY) {
        throw new Error('GOOGLE_API_KEY is required for Google models');
      }
      return new GoogleAIProvider(displayModelId, env.GOOGLE_API_KEY, timeoutMs);

    case 'cerebras':
      if (!env.CEREBRAS_API_KEY) {
        throw new Error('CEREBRAS_API_KEY is required for Cerebras models');
      }
      return new CerebrasProvider(apiModelId, env.CEREBRAS_API_KEY, timeoutMs);

    case 'fireworks':
      if (!env.FIREWORKS_API_KEY) {
        throw new Error('FIREWORKS_API_KEY is required for Fireworks models');
      }
      return new FireworksProvider(apiModelId, env.FIREWORKS_API_KEY, timeoutMs);

    case 'minimax':
      if (!env.MINIMAX_API_KEY) {
        throw new Error('MINIMAX_API_KEY is required for MiniMax models');
      }
      return new MinimaxProvider(apiModelId, env.MINIMAX_API_KEY, timeoutMs);

    case 'openrouter':
    default:
      if (!env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY is required');
      }
      return new OpenRouterProvider({
        apiKey: env.OPENROUTER_API_KEY,
        modelId: displayModelId,
        timeoutMs,
      });
  }
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

/**
 * Create providers using routing configs from the database.
 * This is the preferred method when you have model routing information.
 */
export function createProvidersWithRouting(
  routingConfigs: readonly ModelRoutingConfig[],
  env: Env,
  options: Omit<CreateProviderOptions, 'routingConfig'> = {}
): Map<string, AIProviderInterface> {
  const providers = new Map<string, AIProviderInterface>();

  for (const config of routingConfigs) {
    providers.set(config.id, createProvider(config.id, env, { ...options, routingConfig: config }));
  }

  return providers;
}

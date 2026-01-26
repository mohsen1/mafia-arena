/**
 * AI Provider factory.
 * 
 * MODEL ID NAMING CONVENTION:
 * The first segment of the model ID determines the routing provider:
 * 
 * - openrouter/anthropic/claude-3   → Routes via OpenRouter
 * - anthropic/claude-3              → Routes via Direct Anthropic API
 * - google/gemini-2.5-flash         → Routes via Direct Google API
 * - openai/gpt-4o                   → Routes via Direct OpenAI API
 * - test/town-wins                  → MockE2EProvider (zero cost)
 * 
 * SUPPORTED PROVIDERS:
 * - openrouter: OpenRouter aggregator (100+ models)
 * - openai: Direct OpenAI API
 * - anthropic: Direct Anthropic API
 * - google: Direct Google Gemini API
 * - xai, deepseek, together, groq, cerebras, fireworks, minimax, etc.
 * 
 * BACKWARD COMPATIBILITY:
 * Legacy IDs without explicit routing (e.g., 'anthropic/claude-3') are supported
 * during migration. They route based on available API keys.
 */

import type { Env, ApiProvider } from '../types.js';
import type { AIProviderInterface, CompletionRequest, CompletionResponse, ModelRoutingConfig, ModelContext } from './types.js';
import { getDefaultModelConfig } from './models.js';
import { RetryingProvider } from './RetryingProvider.js';
import { AI_TIMEOUT, RETRY } from '../config/constants.js';
import { 
  OpenRouterProvider, 
  GoogleAIProvider, 
  OpenAIProvider, 
  AnthropicProvider,
  CerebrasProvider,
  FireworksProvider,
  MinimaxProvider,
  XAIProvider,
  DeepSeekProvider,
  TogetherProvider,
  GroqProvider,
  SambaNovaProvider,
  HyperbolicProvider,
  MistralProvider,
  CohereProvider,
  AI21Provider,
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

/**
 * Runtime API keys injected by the user.
 * These override system env keys when provided.
 */
export interface RuntimeAPIKeys {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  XAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  TOGETHER_API_KEY?: string;
  GROQ_API_KEY?: string;
  SAMBANOVA_API_KEY?: string;
  HYPERBOLIC_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  COHERE_API_KEY?: string;
  AI21_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
  FIREWORKS_API_KEY?: string;
  MINIMAX_API_KEY?: string;
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
  /**
   * User-provided API keys that override system env keys.
   * Used when running games with user's own API keys.
   */
  userKeys?: RuntimeAPIKeys | undefined;
}

/**
 * Default timeouts and retries for different pricing modes.
 */
const PRICING_MODE_DEFAULTS = {
  STANDARD: {
    timeoutMs: AI_TIMEOUT.STANDARD,
    maxRetries: 8,
    baseDelayMs: RETRY.BASE_DELAY_MS,
    maxDelayMs: RETRY.MAX_DELAY_MS,
  },
  DISCOUNT: {
    timeoutMs: AI_TIMEOUT.BATCH_POLL,
    maxRetries: 20,         // More retries for long-running requests
    baseDelayMs: 10000,     // 10 seconds base delay
    maxDelayMs: AI_TIMEOUT.BATCH_POLL,     // 5 minutes max delay between retries
  },
} as const;

/**
 * All supported direct API providers.
 * The first segment of a model ID determines the provider.
 */
const DIRECT_PROVIDERS: Set<ApiProvider> = new Set([
  'openrouter',
  'openai',
  'anthropic',
  'google',
  'xai',
  'deepseek',
  'together',
  'groq',
  'cerebras',
  'fireworks',
  'minimax',
  'sambanova',
  'hyperbolic',
  'mistral',
  'cohere',
  'ai21',
]);

/**
 * Parse a model ID to extract the routing provider and API model ID.
 * 
 * @deprecated Use ModelRegistry.get() instead for database-driven routing.
 * This function is kept for backward compatibility with the string-based createProvider API.
 * 
 * NEW FORMAT (explicit routing):
 * - "openrouter/anthropic/claude-3" → { provider: "openrouter", apiModelId: "anthropic/claude-3" }
 * - "anthropic/claude-3"            → { provider: "anthropic", apiModelId: "claude-3" }
 * - "google/gemini-2.5-flash"       → { provider: "google", apiModelId: "gemini-2.5-flash" }
 * 
 * LEGACY FORMAT (backward compatibility):
 * - IDs without a recognized provider prefix default to OpenRouter
 * - e.g., "meta-llama/llama-3" → { provider: "openrouter", apiModelId: "meta-llama/llama-3" }
 */
function parseModelId(modelId: string): { provider: ApiProvider; apiModelId: string } {
  const parts = modelId.split('/');
  const firstSegment = parts[0] as ApiProvider;
  
  // Check if the first segment is a known direct provider
  if (DIRECT_PROVIDERS.has(firstSegment)) {
    if (firstSegment === 'openrouter') {
      // openrouter/anthropic/claude-3 → apiModelId: "anthropic/claude-3"
      return {
        provider: 'openrouter',
        apiModelId: parts.slice(1).join('/'),
      };
    } else {
      // anthropic/claude-3 → apiModelId: "claude-3"
      return {
        provider: firstSegment,
        apiModelId: parts.slice(1).join('/'),
      };
    }
  }
  
  // Legacy/unknown models default to OpenRouter with full ID
  return {
    provider: 'openrouter',
    apiModelId: modelId,
  };
}

/**
 * Infer the provider required for a model ID based on its prefix.
 * Used for API key validation - tells you which provider key you need.
 * 
 * @deprecated Use ModelRegistry.get(modelId).apiProvider instead.
 * This function relies on string parsing which may not match database routing.
 * 
 * @param modelId - Model ID like "openai/gpt-4" or "anthropic/claude-3"
 * @returns The provider name that this model requires (based on string parsing)
 */
export function inferProviderFromModelId(modelId: string): ApiProvider {
  return parseModelId(modelId).provider;
}

/**
 * Check if a model ID is a Google model (for fallback behavior).
 */
function isGoogleModel(modelId: string): boolean {
  return modelId.startsWith('google/') || 
         modelId.startsWith('gemini-') ||
         modelId.includes('gemini');
}

/**
 * Infer the API provider from a model ID.
 * 
 * @deprecated Use ModelRegistry.get(modelId).apiProvider instead.
 * This function relies on string parsing which may not match database routing.
 * 
 * NEW BEHAVIOR: Uses explicit prefix parsing.
 * The first segment of the ID determines the provider.
 * 
 * LEGACY FALLBACK: For backward compatibility during migration,
 * IDs without recognized prefixes still check env vars for auto-routing.
 */
function inferApiProvider(modelId: string, env: Env): ApiProvider {
  const parsed = parseModelId(modelId);
  
  // If we have an explicit provider prefix, use it
  if (parsed.provider !== 'openrouter' || modelId.startsWith('openrouter/')) {
    return parsed.provider;
  }
  
  // LEGACY FALLBACK: For old-format IDs, check env vars
  // This maintains backward compatibility during migration
  // TODO: Remove this fallback after data migration is complete
  
  // Google models with key get direct routing
  if (isGoogleModel(modelId) && env.GOOGLE_API_KEY) {
    return 'google';
  }
  
  // Anthropic-prefixed models with key get direct routing
  if ((modelId.startsWith('anthropic/') || modelId.startsWith('claude-')) && env.ANTHROPIC_API_KEY) {
    return 'anthropic';
  }
  
  return 'openrouter';
}

/**
 * Extract the actual model ID to send to the API.
 * 
 * @deprecated Use ModelRegistry.get(modelId).apiModelId instead.
 * This function relies on string parsing which may not match database routing.
 * 
 * For OpenRouter: Returns the model ID without the 'openrouter/' prefix
 * For Direct providers: Returns the model ID without the provider prefix
 */
function extractApiModelId(modelId: string, apiProvider: ApiProvider): string {
  const parsed = parseModelId(modelId);
  
  // If parsing already extracted the correct format, use it
  if (parsed.provider === apiProvider) {
    return parsed.apiModelId;
  }
  
  // Legacy fallback: strip known prefix if present
  const prefix = `${apiProvider}/`;
  if (modelId.startsWith(prefix)) {
    return modelId.slice(prefix.length);
  }
  
  return modelId;
}

/**
 * Create an AI provider for the given model.
 * 
 * **NOTE**: For new code, prefer using ModelRegistry + createProviderFromContext()
 * which uses database-driven routing instead of string parsing.
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
  
  const keySource = options.userKeys ? 'user-provided' : 'system';
  console.log(`Creating provider for model: ${modelId} (${modelConfig.displayName}) via ${apiProvider} as ${apiModelId} [keys: ${keySource}]`);

  // Select defaults based on pricing mode
  const defaults = options.discountPricing 
    ? PRICING_MODE_DEFAULTS.DISCOUNT 
    : PRICING_MODE_DEFAULTS.STANDARD;

  const { 
    enableRetry = true, 
    maxRetries = defaults.maxRetries, 
    timeoutMs = defaults.timeoutMs,
    userKeys,
  } = options;

  // Create the base provider based on apiProvider (with user keys if provided)
  const baseProvider = createBaseProvider(apiProvider, apiModelId, modelId, env, timeoutMs, userKeys);
  
  // Special case: Google models get OpenRouter fallback for resilience
  // Note: Fallback also uses user keys if provided
  const openRouterKey = resolveApiKey('OPENROUTER_API_KEY', env, userKeys);
  if (apiProvider === 'google' && openRouterKey) {
    const openRouterProvider = new OpenRouterProvider({
      apiKey: openRouterKey,
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
 * Resolve an API key from user keys (priority) or system env.
 * User keys take precedence over system keys.
 */
function resolveApiKey(
  envKeyName: keyof RuntimeAPIKeys,
  env: Env,
  userKeys?: RuntimeAPIKeys
): string | undefined {
  // Priority: User key > System env key
  if (userKeys && userKeys[envKeyName]) {
    return userKeys[envKeyName];
  }
  return (env as unknown as Record<string, string | undefined>)[envKeyName];
}

/**
 * Create the base provider for a given API provider type.
 * User-provided keys take precedence over system env keys.
 */
function createBaseProvider(
  apiProvider: ApiProvider,
  apiModelId: string,
  displayModelId: string,
  env: Env,
  timeoutMs: number,
  userKeys?: RuntimeAPIKeys
): AIProviderInterface {
  switch (apiProvider) {
    case 'openai': {
      const apiKey = resolveApiKey('OPENAI_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required for OpenAI models');
      }
      return new OpenAIProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'anthropic': {
      const apiKey = resolveApiKey('ANTHROPIC_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is required for Anthropic models');
      }
      return new AnthropicProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'google': {
      const apiKey = resolveApiKey('GOOGLE_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('GOOGLE_API_KEY is required for Google models');
      }
      return new GoogleAIProvider(displayModelId, apiKey, timeoutMs);
    }

    case 'cerebras': {
      const apiKey = resolveApiKey('CEREBRAS_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('CEREBRAS_API_KEY is required for Cerebras models');
      }
      return new CerebrasProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'fireworks': {
      const apiKey = resolveApiKey('FIREWORKS_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('FIREWORKS_API_KEY is required for Fireworks models');
      }
      return new FireworksProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'minimax': {
      const apiKey = resolveApiKey('MINIMAX_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('MINIMAX_API_KEY is required for MiniMax models');
      }
      return new MinimaxProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'xai': {
      const apiKey = resolveApiKey('XAI_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('XAI_API_KEY is required for XAI/Grok models');
      }
      return new XAIProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'deepseek': {
      const apiKey = resolveApiKey('DEEPSEEK_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('DEEPSEEK_API_KEY is required for DeepSeek models');
      }
      return new DeepSeekProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'together': {
      const apiKey = resolveApiKey('TOGETHER_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('TOGETHER_API_KEY is required for Together AI models');
      }
      return new TogetherProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'groq': {
      const apiKey = resolveApiKey('GROQ_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('GROQ_API_KEY is required for Groq models');
      }
      return new GroqProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'sambanova': {
      const apiKey = resolveApiKey('SAMBANOVA_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('SAMBANOVA_API_KEY is required for SambaNova models');
      }
      return new SambaNovaProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'hyperbolic': {
      const apiKey = resolveApiKey('HYPERBOLIC_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('HYPERBOLIC_API_KEY is required for Hyperbolic models');
      }
      return new HyperbolicProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'mistral': {
      const apiKey = resolveApiKey('MISTRAL_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is required for Mistral models');
      }
      return new MistralProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'cohere': {
      const apiKey = resolveApiKey('COHERE_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('COHERE_API_KEY is required for Cohere models');
      }
      return new CohereProvider(apiModelId, apiKey, timeoutMs);
    }

    case 'ai21': {
      const apiKey = resolveApiKey('AI21_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('AI21_API_KEY is required for AI21 models');
      }
      return new AI21Provider(apiModelId, apiKey, timeoutMs);
    }

    case 'openrouter':
    default: {
      const apiKey = resolveApiKey('OPENROUTER_API_KEY', env, userKeys);
      if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is required');
      }
      return new OpenRouterProvider({
        apiKey,
        modelId: displayModelId,
        timeoutMs,
      });
    }
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
 * 
 * When userKeys are provided:
 * - User's API keys are used instead of system env keys
 * - Allows users to run games with their own provider access
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

// =============================================================================
// CONTEXT-BASED PROVIDER CREATION (Preferred API)
// =============================================================================

/**
 * Options for context-based provider creation.
 */
export interface CreateProviderFromContextOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  discountPricing?: boolean;
  userKeys?: RuntimeAPIKeys;
}

/**
 * Create an AI provider from a ModelContext.
 * This is the preferred method - uses structured data instead of string parsing.
 * 
 * @param context - Rich model context from ModelRegistry
 * @param env - Worker environment with API keys
 * @param options - Provider creation options
 */
export function createProviderFromContext(
  context: ModelContext,
  env: Env,
  options: CreateProviderFromContextOptions = {}
): AIProviderInterface {
  // Test models use mock provider
  if (context.isTest) {
    console.log(`Creating MOCK provider for test model: ${context.id}`);
    return new MockE2EProvider(context.id);
  }

  const { apiProvider, apiModelId, id: modelId, displayName } = context;
  
  const keySource = options.userKeys ? 'user-provided' : 'system';
  console.log(`Creating provider for model: ${modelId} (${displayName}) via ${apiProvider} as ${apiModelId} [keys: ${keySource}]`);

  // Select defaults based on pricing mode
  const defaults = options.discountPricing 
    ? PRICING_MODE_DEFAULTS.DISCOUNT 
    : PRICING_MODE_DEFAULTS.STANDARD;

  const { 
    enableRetry = true, 
    maxRetries = defaults.maxRetries, 
    timeoutMs = defaults.timeoutMs,
    userKeys,
  } = options;

  // Create the base provider
  const baseProvider = createBaseProvider(apiProvider, apiModelId, modelId, env, timeoutMs, userKeys);
  
  // Special case: Google models get OpenRouter fallback for resilience
  const openRouterKey = resolveApiKey('OPENROUTER_API_KEY', env, userKeys);
  if (apiProvider === 'google' && openRouterKey) {
    const openRouterProvider = new OpenRouterProvider({
      apiKey: openRouterKey,
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
 * Create providers for multiple ModelContexts.
 * This is the preferred method for game setup - uses pre-fetched model metadata.
 * 
 * @param contexts - Map of model ID to ModelContext from ModelRegistry.getMany()
 * @param env - Worker environment with API keys
 * @param options - Provider creation options
 */
export function createProvidersFromContexts(
  contexts: Map<string, ModelContext>,
  env: Env,
  options: CreateProviderFromContextOptions = {}
): Map<string, AIProviderInterface> {
  const providers = new Map<string, AIProviderInterface>();

  for (const [modelId, context] of contexts) {
    providers.set(modelId, createProviderFromContext(context, env, options));
  }

  return providers;
}

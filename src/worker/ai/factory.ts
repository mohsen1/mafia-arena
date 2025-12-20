/**
 * AI Provider factory.
 * Creates the appropriate provider based on model ID.
 *
 * Provider Priority:
 * 1. OpenRouter (when OPENROUTER_API_KEY is set) - unified billing
 * 2. Azure OpenAI (when AZURE_OPENAI_API_KEY is set) - for OpenAI models
 * 3. Direct API calls (OpenAI, Anthropic, Google)
 */

import type { Env } from '../types.js';
import type { AIProviderInterface } from './types.js';
import { SUPPORTED_MODELS } from './types.js';
import { AIErrors } from './errors.js';
import { RetryingProvider } from './RetryingProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { AzureOpenAIProvider } from './providers/AzureOpenAIProvider.js';

export interface CreateProviderOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Create an AI provider for the given model.
 * Uses OpenRouter for OpenAI/Anthropic models when OPENROUTER_API_KEY is available.
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

  const { enableRetry = true, maxRetries = 3, timeoutMs = 30000 } = options;

  let provider: AIProviderInterface;

  // Priority 1: Use OpenRouter for all providers if key is available
  const useOpenRouter = !!env.OPENROUTER_API_KEY;
  
  // Priority 2: Use Azure OpenAI for OpenAI models if configured
  const useAzure = !!env.AZURE_OPENAI_API_KEY && !!env.AZURE_OPENAI_ENDPOINT;

  if (useOpenRouter) {
    provider = new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY!,
      modelId,
      timeoutMs,
    });
  } else {
    switch (modelConfig.provider) {
      case 'openai':
        // Use Azure OpenAI if configured, otherwise fall back to direct OpenAI
        if (useAzure) {
          provider = new AzureOpenAIProvider({
            apiKey: env.AZURE_OPENAI_API_KEY!,
            modelId,
            timeoutMs,
            endpoint: env.AZURE_OPENAI_ENDPOINT!,
            apiVersion: env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
            deploymentName: modelId, // Will be mapped internally
          });
        } else {
          provider = new OpenAIProvider({
            apiKey: env.OPENAI_API_KEY,
            modelId,
            timeoutMs,
          });
        }
        break;

      case 'anthropic':
        provider = new AnthropicProvider({
          apiKey: env.ANTHROPIC_API_KEY,
          modelId,
          timeoutMs,
        });
        break;

      case 'google':
        provider = new GoogleProvider({
          apiKey: env.GOOGLE_API_KEY,
          modelId,
          timeoutMs,
        });
        break;

      default:
        throw AIErrors.unsupportedModel(modelId);
    }
  }

  // Wrap with retry logic if enabled
  if (enableRetry) {
    return new RetryingProvider(provider, { maxRetries });
  }

  return provider;
}

/**
 * Create providers for all models in a game configuration.
 * Returns a map of modelId -> provider.
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


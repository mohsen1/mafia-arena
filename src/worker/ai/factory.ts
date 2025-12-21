/**
 * AI Provider factory.
 * Routes models to their respective providers (OpenRouter, Google Gemini, etc.)
 */

import type { Env } from '../types.js';
import type { AIProviderInterface } from './types.js';
import { SUPPORTED_MODELS } from './models.js';
import { AIErrors } from './errors.js';
import { RetryingProvider } from './RetryingProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';

export interface CreateProviderOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Create an AI provider for the given model.
 * Routes to the appropriate provider based on model configuration.
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

  const { enableRetry = true, maxRetries = 8, timeoutMs = 60000 } = options;

  let provider: AIProviderInterface;

  // Route to the appropriate provider
  if (modelConfig.provider === 'google') {
    if (!env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is required for Google models');
    }
    provider = new GoogleProvider({
      apiKey: env.GOOGLE_API_KEY,
      modelId,
      timeoutMs,
    });
  } else if (modelConfig.provider === 'openrouter') {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY is required for OpenRouter models');
    }
    provider = new OpenRouterProvider({
      apiKey: env.OPENROUTER_API_KEY,
      modelId,
      timeoutMs,
    });
  } else {
    throw new Error(`Unknown provider: ${modelConfig.provider}`);
  }

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


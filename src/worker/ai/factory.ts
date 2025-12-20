/**
 * AI Provider factory.
 * All models are accessed via OpenRouter for unified billing and access.
 */

import type { Env } from '../types.js';
import type { AIProviderInterface } from './types.js';
import { SUPPORTED_MODELS } from './types.js';
import { AIErrors } from './errors.js';
import { RetryingProvider } from './RetryingProvider.js';
import { OpenRouterProvider } from './providers/OpenRouterProvider.js';

export interface CreateProviderOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Create an AI provider for the given model.
 * All models are accessed via OpenRouter.
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

  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is required - all models are accessed via OpenRouter');
  }

  const provider = new OpenRouterProvider({
    apiKey: env.OPENROUTER_API_KEY,
    modelId,
    timeoutMs,
  });

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


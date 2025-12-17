/**
 * AI Provider factory.
 * Creates the appropriate provider based on model ID.
 */

import type { Env } from '../types.js';
import type { AIProviderInterface } from './types.js';
import { SUPPORTED_MODELS } from './types.js';
import { AIErrors } from './errors.js';
import { RetryingProvider } from './RetryingProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { GoogleProvider } from './providers/GoogleProvider.js';

export interface CreateProviderOptions {
  enableRetry?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Create an AI provider for the given model.
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

  switch (modelConfig.provider) {
    case 'openai':
      provider = new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        modelId,
        timeoutMs,
      });
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
        apiKey: env.GOOGLE_AI_API_KEY,
        modelId,
        timeoutMs,
      });
      break;

    default:
      throw AIErrors.unsupportedModel(modelId);
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


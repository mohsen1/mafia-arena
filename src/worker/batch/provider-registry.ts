/**
 * Provider Registry - Centralized batch provider registration.
 *
 * This module defines all available batch providers and their configuration
 * in a single place, making it easy to add, remove, or modify providers.
 *
 * Each provider entry includes:
 * - envKey: The environment variable name for the API key
 * - providerClass: The batch provider implementation class
 * - defaultModel: The default model to use for this provider
 * - discountPercent: The typical discount offered by batch APIs
 */

import type { Env } from '../types.js';
import type { BatchProviderInterface } from './types.js';
import { AnthropicBatch } from './providers/AnthropicBatch.js';
import { OpenAIBatch } from './providers/OpenAIBatch.js';
import { GoogleBatch } from './providers/GoogleBatch.js';
import { CerebrasBatch } from './providers/CerebrasBatch.js';
import { FireworksBatch } from './providers/FireworksBatch.js';

/**
 * Provider configuration interface.
 */
export interface ProviderConfig {
  /** Environment variable name for the API key */
  envKey: string;
  /** Batch provider implementation class */
  providerClass: new (env: Env, model: string) => BatchProviderInterface;
  /** Default model ID for this provider */
  defaultModel: string;
  /** Typical discount percentage offered by batch APIs */
  discountPercent: number;
}

/**
 * Complete registry of all available batch providers.
 *
 * To add a new provider:
 * 1. Import the provider class
 * 2. Add an entry to this array with envKey, providerClass, defaultModel, and discountPercent
 * 3. The provider will be automatically registered if its API key is configured
 */
export const PROVIDER_REGISTRY: ProviderConfig[] = [
  {
    envKey: 'ANTHROPIC_API_KEY',
    providerClass: AnthropicBatch,
    defaultModel: 'anthropic/claude-3-5-sonnet',
    discountPercent: 50,
  },
  {
    envKey: 'OPENAI_API_KEY',
    providerClass: OpenAIBatch,
    defaultModel: 'openai/gpt-4o',
    discountPercent: 50,
  },
  {
    envKey: 'GOOGLE_API_KEY',
    providerClass: GoogleBatch,
    defaultModel: 'google/gemini-1.5-pro',
    discountPercent: 50,
  },
  {
    envKey: 'CEREBRAS_API_KEY',
    providerClass: CerebrasBatch,
    defaultModel: 'cerebras/llama3.1-70b',
    discountPercent: 50,
  },
  {
    envKey: 'FIREWORKS_API_KEY',
    providerClass: FireworksBatch,
    defaultModel: 'fireworks/llama-v3p1-70b-instruct',
    discountPercent: 40, // Less than others
  },
];

/**
 * Register all available batch providers with the BatchService.
 *
 * This function checks each provider's environment variable and only
 * registers providers that have their API keys configured.
 *
 * @param batchService - The BatchService instance to register providers with
 * @param env - The Cloudflare Worker environment containing API keys
 * @returns The number of providers successfully registered
 *
 * @example
 * ```ts
 * const batchService = new BatchService(env);
 * const count = registerAvailableProviders(batchService, env);
 * console.log(`Registered ${count} batch providers`);
 * ```
 */
export function registerAvailableProviders(
  batchService: { registerProvider(provider: BatchProviderInterface): void },
  env: Env
): number {
  let registeredCount = 0;

  for (const config of PROVIDER_REGISTRY) {
    try {
      // Check if the API key is configured
      const envValue = (env as unknown as Record<string, string | undefined>)[config.envKey];

      if (envValue) {
        // Instantiate and register the provider
        const provider = new config.providerClass(env, config.defaultModel);
        batchService.registerProvider(provider);
        registeredCount++;

        console.log(`Registered batch provider: ${config.defaultModel} (${config.discountPercent}% discount)`);
      }
    } catch (error) {
      // Log error but continue registering other providers
      console.error(`Failed to register batch provider ${config.defaultModel}:`, error);
    }
  }

  if (registeredCount === 0) {
    console.warn('No batch providers registered - all API keys missing');
  } else {
    console.log(`Successfully registered ${registeredCount} batch provider(s)`);
  }

  return registeredCount;
}

/**
 * Get a list of all registered provider names.
 *
 * @returns Array of provider default model IDs
 */
export function getRegisteredProviderNames(): string[] {
  return PROVIDER_REGISTRY.map(p => p.defaultModel);
}

/**
 * Get provider configuration by environment key.
 *
 * @param envKey - The environment variable name
 * @returns The provider config or undefined if not found
 */
export function getProviderConfigByKey(envKey: string): ProviderConfig | undefined {
  return PROVIDER_REGISTRY.find(p => p.envKey === envKey);
}

/**
 * Get provider configuration by default model ID.
 *
 * @param modelId - The default model ID
 * @returns The provider config or undefined if not found
 */
export function getProviderConfigByModel(modelId: string): ProviderConfig | undefined {
  return PROVIDER_REGISTRY.find(p => p.defaultModel === modelId);
}

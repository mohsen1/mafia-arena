/**
 * AI module exports.
 */

// Types
export type {
  AIProviderInterface,
  AIProviderConfig,
  CompletionRequest,
  CompletionResponse,
} from './types.js';

export { SUPPORTED_MODELS, getProviderForModel, isModelSupported } from './types.js';

// Errors
export { AIError, AIErrors, isRetryableError } from './errors.js';
export type { AIErrorCode } from './errors.js';

// Providers
export { BaseProvider } from './BaseProvider.js';
export { RetryingProvider, type RetryConfig } from './RetryingProvider.js';
export { OpenAIProvider } from './providers/OpenAIProvider.js';
export { AnthropicProvider } from './providers/AnthropicProvider.js';
export { GoogleProvider } from './providers/GoogleProvider.js';

// Factory
export { createProvider, createProvidersForGame, type CreateProviderOptions } from './factory.js';

// Game adapter
export { GameAIAdapter } from './GameAIAdapter.js';


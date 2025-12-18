/**
 * AI module exports.
 */

// Types
export type {
  AIProviderInterface,
  AIProviderConfig,
  CompletionRequest,
  CompletionResponse,
  JsonSchema,
  JsonSchemaProperty,
  StructuredOutputConfig,
  StructuredOutputLevel,
  ModelConfig,
} from './types.js';

export {
  SUPPORTED_MODELS,
  getProviderForModel,
  getStructuredOutputLevel,
  isModelSupported,
  getSchemaForAction,
  schemaToPromptInstructions,
  extractJSON,
  validateAgainstSchema,
  PERSONA_SCHEMA,
  MESSAGE_SCHEMA,
  KILL_VOTE_SCHEMA,
  ELIMINATION_VOTE_SCHEMA,
} from './types.js';

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


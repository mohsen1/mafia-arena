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
  getSchemaForAction,
  schemaToPromptInstructions,
  extractJSON,
  validateAgainstSchema,
  PERSONA_SCHEMA,
  MESSAGE_SCHEMA,
  KILL_VOTE_SCHEMA,
  ELIMINATION_VOTE_SCHEMA,
} from './types.js';

export {
  SUPPORTED_MODELS,
  MODEL_PRICING,
  getPricing,
} from './models.js';

// Errors
export { AIError, AIErrors, isRetryableError } from './errors.js';
export type { AIErrorCode } from './errors.js';

// Providers
export { BaseProvider } from './BaseProvider.js';
export { RetryingProvider, type RetryConfig } from './RetryingProvider.js';
export { OpenRouterProvider } from './providers/OpenRouterProvider.js';

// Factory
export { createProvider, createProvidersForGame, type CreateProviderOptions } from './factory.js';

// Game adapter
export { GameAIAdapter } from './GameAIAdapter.js';

// Zod schemas for action validation
export {
  PersonaSchema,
  IntroductionSchema,
  KillVoteSchema,
  DiscussionSchema,
  MafiaDiscussionSchema,
  EliminationVoteSchema,
  getActionSchema,
} from './schemas.js';
export type {
  PersonaInput,
  IntroductionInput,
  KillVoteInput,
  DiscussionInput,
  MafiaDiscussionInput,
  EliminationVoteInput,
} from './schemas.js';


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
  // Suspense pattern types
  AIRequestMessage,
  CachedAIResponse,
  ResponseCacheFn,
  QueueRequestFn,
} from './types.js';

export {
  getSchemaForAction,
  schemaToPromptInstructions,
  validateAgainstSchema,
  PERSONA_SCHEMA,
  MESSAGE_SCHEMA,
  KILL_VOTE_SCHEMA,
  ELIMINATION_VOTE_SCHEMA,
  // Suspense error
  SuspenseError,
} from './types.js';

export {
  DEFAULT_PRICING,
  parsePricingFromConfig,
  getDefaultModelConfig,
} from './models.js';

// Errors
export { AIError, AIErrors, isRetryableError } from './errors.js';
export type { AIErrorCode } from './errors.js';

// Providers
export { RetryingProvider, type RetryConfig } from './RetryingProvider.js';
export { OpenRouterProvider } from './providers/OpenRouterProvider.js';

// Factory
export { createProvider, createProvidersForGame, type CreateProviderOptions } from './factory.js';

// Game adapter
export { GameAIAdapter, type GameAIAdapterOptions } from './GameAIAdapter.js';

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

// Context limits
export {
  getModelContextLimit,
  getModelContextLimits,
  isSmallContextModel,
  getSafePromptLimit,
  getSummarizationThreshold,
} from './contextLimits.js';

// Summarization service
export {
  SummarizationService,
  createSummarizationService,
  type GameSummary,
  type SummarizationCheck,
  type ContextBuildResult,
} from './SummarizationService.js';


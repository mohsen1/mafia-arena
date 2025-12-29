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
  AIRequestMessage,
} from './types.js';

export {
  getSchemaForAction,
  schemaToPromptInstructions,
  validateAgainstSchema,
  PERSONA_SCHEMA,
  MESSAGE_SCHEMA,
  KILL_VOTE_SCHEMA,
  ELIMINATION_VOTE_SCHEMA,
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
export { 
  createProvider, 
  createProvidersForGame, 
  inferProviderFromModelId,
  type CreateProviderOptions, 
  type RuntimeAPIKeys,
} from './factory.js';

// Workflow AI Provider (recommended for new code)
export { WorkflowAIProvider, AIParseError, type WorkflowAIProviderOptions } from '../providers/WorkflowAIProvider.js';

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


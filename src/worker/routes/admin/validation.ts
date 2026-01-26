/**
 * Validation schemas and types for admin routes.
 */

import type { ApiProvider } from '../../types.js';

/**
 * Map of providers to their env key names.
 * Used for validating system API keys.
 */
export const PROVIDER_ENV_KEYS: Record<ApiProvider, string> = {
  openrouter: 'OPENROUTER_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  together: 'TOGETHER_API_KEY',
  groq: 'GROQ_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  hyperbolic: 'HYPERBOLIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  ai21: 'AI21_API_KEY',
};

/**
 * Request body for cost estimation endpoint.
 */
export interface EstimateRequest {
  totalGames: number;
  config: {
    playerCount: number;
    mafiaCount: number;
    teams: Array<{
      modelId: string;
      team: 'mafia' | 'town';
      count: number;
    }>;
    discussionEnabled?: boolean;
    contextLevel?: 'full' | 'windowed' | 'summary';
  };
  useBatchAPI?: boolean;
}

/**
 * Request body for running a live game.
 */
export interface RunLiveGameRequest {
  config: {
    playerCount: number;
    mafiaCount: number;
    teams: Array<{
      modelId: string;
      team: 'mafia' | 'town';
      count: number;
    }>;
    maxRounds?: number;
    discussionEnabled?: boolean;
    personaConstraints?: 'strict' | 'moderate' | 'free';
    contextLevel?: 'full' | 'windowed' | 'summary';
    contextWindowSize?: number;
    personaTheme?: 'noir' | 'victorian' | 'modern' | 'fantasy';
  };
}

/**
 * Request body for creating a model.
 */
export interface CreateModelRequest {
  id: string;
  display_name: string;
  family: string;
  api_provider: string;
  api_model_id?: string;
  supports_batch_pricing?: boolean;
  pricing?: { input: number; output: number }; // per 1M tokens
  context_length?: number;
}

/**
 * Request body for updating a model.
 */
export interface UpdateModelRequest {
  display_name?: string;
  api_provider?: string;
  api_model_id?: string;
  supports_batch_pricing?: boolean;
  pricing?: { input: number; output: number }; // per 1M tokens
  context_length?: number;
}

/**
 * Request body for merging models.
 */
export interface MergeRequest {
  fromId: string;
  toId: string;
}

/**
 * Request body for updating a user.
 */
export interface UpdateUserRequest {
  isAdmin?: boolean;
}

/**
 * OpenRouter model response type.
 */
export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
}

export interface OpenRouterResponse {
  data: OpenRouterModel[];
}

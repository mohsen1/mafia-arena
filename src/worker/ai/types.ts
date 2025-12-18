/**
 * AI Provider type definitions.
 */

/**
 * Common interface for all AI providers.
 */
export interface AIProviderInterface {
  readonly name: string;
  readonly modelId: string;

  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

/**
 * Request structure for AI completions.
 */
export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'json' | 'text';
}

/**
 * Response structure from AI completions.
 */
export interface CompletionResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  modelId: string;
}

/**
 * Configuration for AI providers.
 */
export interface AIProviderConfig {
  apiKey: string;
  modelId: string;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Supported AI model registry.
 */
export const SUPPORTED_MODELS: Record<string, { provider: string; displayName: string }> = {
  // OpenAI - Current models
  'gpt-4o': { provider: 'openai', displayName: 'GPT-4o' },
  'gpt-4o-mini': { provider: 'openai', displayName: 'GPT-4o Mini' },
  'gpt-4-turbo': { provider: 'openai', displayName: 'GPT-4 Turbo' },
  // OpenAI - Future models
  'gpt-5.2': { provider: 'openai', displayName: 'GPT-5.2' },
  'gpt-5.2-pro': { provider: 'openai', displayName: 'GPT-5.2 Pro' },
  'gpt-5.1': { provider: 'openai', displayName: 'GPT-5.1' },

  // Anthropic - Current models
  'claude-3-haiku-20240307': { provider: 'anthropic', displayName: 'Claude 3 Haiku' },
  'claude-3-sonnet-20240229': { provider: 'anthropic', displayName: 'Claude 3 Sonnet' },
  'claude-3-opus-20240229': { provider: 'anthropic', displayName: 'Claude 3 Opus' },
  'claude-3-5-haiku-20241022': { provider: 'anthropic', displayName: 'Claude 3.5 Haiku' },
  'claude-3-5-sonnet-20241022': { provider: 'anthropic', displayName: 'Claude 3.5 Sonnet' },
  // Anthropic - Future models
  'claude-opus-4.5': { provider: 'anthropic', displayName: 'Claude Opus 4.5' },
  'claude-sonnet-4.5': { provider: 'anthropic', displayName: 'Claude Sonnet 4.5' },
  'claude-haiku-4.5': { provider: 'anthropic', displayName: 'Claude Haiku 4.5' },

  // Google - Current models
  'gemini-1.5-flash': { provider: 'google', displayName: 'Gemini 1.5 Flash' },
  'gemini-1.5-pro': { provider: 'google', displayName: 'Gemini 1.5 Pro' },
  'gemini-2.0-flash-exp': { provider: 'google', displayName: 'Gemini 2.0 Flash Exp' },
  'gemini-2.0-flash': { provider: 'google', displayName: 'Gemini 2.0 Flash' },
  'gemini-2.0-flash-lite': { provider: 'google', displayName: 'Gemini 2.0 Flash Lite' },
  // Google - Future models
  'gemini-3-pro-preview': { provider: 'google', displayName: 'Gemini 3 Pro' },
  'gemini-3-flash-preview': { provider: 'google', displayName: 'Gemini 3 Flash' },
  'gemini-2.5-flash': { provider: 'google', displayName: 'Gemini 2.5 Flash' },
  'gemini-2.5-flash-preview-05-20': { provider: 'google', displayName: 'Gemini 2.5 Flash Preview' },
  'gemini-2.5-pro-preview-05-06': { provider: 'google', displayName: 'Gemini 2.5 Pro Preview' },
};

/**
 * Get provider name for a model ID.
 */
export function getProviderForModel(modelId: string): string | undefined {
  return SUPPORTED_MODELS[modelId]?.provider;
}

/**
 * Check if a model is supported.
 */
export function isModelSupported(modelId: string): boolean {
  return modelId in SUPPORTED_MODELS;
}


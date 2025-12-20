/**
 * OpenRouter API provider implementation.
 *
 * OpenRouter provides a unified OpenAI-compatible API for multiple providers
 * including OpenAI, Anthropic, Google, and others.
 *
 * Benefits:
 * - Single API key for multiple providers
 * - Automatic fallbacks and load balancing
 * - Cost tracking and rate limiting built-in
 *
 * @see https://openrouter.ai/docs
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';
import { schemaToPromptInstructions } from '../types.js';

interface OpenRouterConfig extends AIProviderConfig {
  /** The underlying provider (openai, anthropic) for model ID mapping */
  underlyingProvider: 'openai' | 'anthropic';
}

interface OpenRouterChatResponse {
  choices: Array<{
    message: { content: string; refusal?: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
}

/**
 * Mapping from our internal Anthropic model IDs to OpenRouter model IDs.
 * 
 * IMPORTANT: OpenRouter does not provide version-pinned model slugs.
 * These mappings point to the latest version of each model family on OpenRouter.
 * For strict version control, use the direct Anthropic API instead.
 * 
 * Only models in SUPPORTED_MODELS (types.ts) are mapped here.
 */
const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  // Claude 3 models
  'claude-3-haiku-20240307': 'anthropic/claude-3-haiku',
  'claude-3-sonnet-20240229': 'anthropic/claude-3-sonnet',
  'claude-3-opus-20240229': 'anthropic/claude-3-opus',
  // Claude 3.5 models
  'claude-3-5-haiku-20241022': 'anthropic/claude-3.5-haiku',
  'claude-3-5-sonnet-20241022': 'anthropic/claude-3.5-sonnet',
};

/**
 * Mapping from our internal OpenAI model IDs to OpenRouter model IDs.
 * Most OpenAI models work directly but some need mapping.
 */
const OPENAI_MODEL_MAP: Record<string, string> = {
  // GPT-4o models - usually work directly
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4o-mini': 'openai/gpt-4o-mini',
  'gpt-4o-2024-11-20': 'openai/gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06': 'openai/gpt-4o',
  // GPT-4 models
  'gpt-4-turbo': 'openai/gpt-4-turbo',
  'gpt-4-turbo-preview': 'openai/gpt-4-turbo-preview',
  'gpt-4': 'openai/gpt-4',
  // GPT-3.5 models
  'gpt-3.5-turbo': 'openai/gpt-3.5-turbo',
};

/**
 * Map internal model IDs to OpenRouter model IDs.
 * OpenRouter uses provider/model format with simplified names.
 */
function toOpenRouterModelId(modelId: string, provider: 'openai' | 'anthropic'): string {
  // If already in OpenRouter format, return as-is
  if (modelId.includes('/')) {
    return modelId;
  }

  // Check specific model mappings first
  if (provider === 'anthropic' && ANTHROPIC_MODEL_MAP[modelId]) {
    return ANTHROPIC_MODEL_MAP[modelId];
  }
  if (provider === 'openai' && OPENAI_MODEL_MAP[modelId]) {
    return OPENAI_MODEL_MAP[modelId];
  }

  // Fallback: prepend provider prefix
  return `${provider}/${modelId}`;
}

export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  readonly modelId: string;

  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly openRouterModelId: string;

  constructor(config: OpenRouterConfig) {
    super(config);
    this.modelId = config.modelId;
    this.openRouterModelId = toOpenRouterModelId(config.modelId, config.underlyingProvider);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    // For OpenRouter, always use json_object mode with prompt instructions
    // OpenRouter's json_schema support is inconsistent across providers
    const useJsonMode = request.structuredOutput || request.responseFormat === 'json';

    // Inject schema instructions into the prompt
    let systemPrompt = request.systemPrompt;
    if (useJsonMode && request.structuredOutput) {
      const schemaInstructions = schemaToPromptInstructions(request.structuredOutput.schema);
      systemPrompt = `${request.systemPrompt}\n\n${schemaInstructions}`;
    }

    const body: Record<string, unknown> = {
      model: this.openRouterModelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    // Use json_object mode for structured output
    if (useJsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://mafia-arena.pages.dev',
        'X-Title': 'Mafia Arena',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      // Log error message only (avoid logging full response which may contain prompts/PII)
      const errorMsg = typeof data === 'object' && data !== null && 'error' in data
        ? (data as { error: { message?: string } }).error?.message ?? 'Unknown error'
        : 'Unknown error';
      console.error(`OpenRouter error for ${this.openRouterModelId}: ${errorMsg}`);
      this.handleHttpError(response, data);
    }

    const typedData = data as OpenRouterChatResponse;
    const content = typedData.choices[0]?.message?.content ?? '';
    const latencyMs = Date.now() - startTime;

    return {
      content,
      tokensUsed: {
        input: typedData.usage.prompt_tokens,
        output: typedData.usage.completion_tokens,
        total: typedData.usage.total_tokens,
      },
      latencyMs,
      modelId: this.modelId,
    };
  }
}


/**
 * OpenAI-compatible API provider implementation.
 * 
 * This is a base provider that works with any OpenAI-compatible API:
 * - OpenAI (api.openai.com)
 * - Cerebras (api.cerebras.ai)
 * - Fireworks (api.fireworks.ai)
 * - Any other OpenAI-compatible endpoint
 * 
 * Each specific provider extends this with appropriate defaults.
 */

import type { AIProviderInterface, AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';
import { AIErrors } from '../errors.js';

interface OpenAIResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAICompatibleProvider implements AIProviderInterface {
  readonly name: string;
  readonly modelId: string;

  protected readonly apiKey: string;
  protected readonly timeoutMs: number;
  protected readonly baseUrl: string;

  constructor(
    config: AIProviderConfig & { providerName?: string }
  ) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId;
    this.timeoutMs = config.timeoutMs ?? 60000;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.name = config.providerName ?? 'openai-compatible';
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const messages = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages,
      max_tokens: request.maxTokens ?? 4000,
      temperature: request.temperature ?? 0.7,
    };

    let useStructuredOutput = false;
    if (request.structuredOutput) {
      body.tools = [{
        type: 'function',
        function: {
          name: request.structuredOutput.name,
          description: 'Provide your response using this structure.',
          parameters: {
            type: 'object',
            properties: request.structuredOutput.schema.properties,
            required: request.structuredOutput.schema.required,
          },
        },
      }];
      body.tool_choice = {
        type: 'function',
        function: { name: request.structuredOutput.name },
      };
      useStructuredOutput = true;
    }

    let response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    let data = await response.json();

    // Fallback for providers that don't support tool_choice
    if (!response.ok && useStructuredOutput) {
      const error = data as { error?: { message?: string; code?: number } };
      const isToolChoiceError = 
        error.error?.message?.includes('tool_choice') ||
        error.error?.message?.includes('not supported') ||
        error.error?.code === 400;
      
      if (isToolChoiceError) {
        delete body.tools;
        delete body.tool_choice;
        body.response_format = { type: 'json_object' };
        
        const schemaInstructions = this.schemaToPrompt(request.structuredOutput!.schema);
        const enhancedUserPrompt = `${request.userPrompt}\n\n${schemaInstructions}`;
        (messages[1] as { content: string }).content = enhancedUserPrompt;
        (body as { messages: unknown }).messages = messages;
        
        response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        });
        
        data = await response.json();
        useStructuredOutput = false;
      }
    }

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as OpenAIResponse;
    const latencyMs = Date.now() - startTime;

    let content: string;
    const choice = typedData.choices[0];

    if (useStructuredOutput && choice?.message.tool_calls?.[0]) {
      content = choice.message.tool_calls[0].function.arguments;
    } else {
      content = choice?.message.content ?? '';
    }

    return {
      content,
      tokensUsed: {
        input: typedData.usage?.prompt_tokens ?? 0,
        output: typedData.usage?.completion_tokens ?? 0,
        total: typedData.usage?.total_tokens ?? 0,
      },
      latencyMs,
      modelId: this.modelId,
    };
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  protected async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw AIErrors.timeout(this.modelId, this.timeoutMs);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  protected handleHttpError(response: Response, body: unknown): never {
    const status = response.status;

    console.error(`[${this.name}] HTTP ${status} for model ${this.modelId}:`, JSON.stringify(body));

    const extractMessage = (b: unknown): string => {
      if (typeof b === 'object' && b !== null) {
        const obj = b as Record<string, unknown>;
        if (obj.error && typeof obj.error === 'object') {
          const err = obj.error as Record<string, unknown>;
          if (err.message) return String(err.message);
        }
        if (obj.message) return String(obj.message);
      }
      return String(b);
    };

    const extractErrorDetails = (b: unknown) => {
      if (typeof b === 'object' && b !== null) {
        const obj = b as Record<string, unknown>;
        if (obj.error && typeof obj.error === 'object') {
          const err = obj.error as Record<string, unknown>;
          return {
            type: typeof err.type === 'string' ? err.type : undefined,
            code: typeof err.code === 'string' ? err.code : undefined,
          };
        }
      }
      return {};
    };

    const message = extractMessage(body);
    const { type, code } = extractErrorDetails(body);

    // Detect billing/quota errors (non-retryable) - OpenAI sends 429 with type='insufficient_quota'
    if (
      status === 402 ||
      type === 'insufficient_quota' || 
      code === 'insufficient_quota' ||
      message.includes('insufficient_quota') ||
      message.includes('exceeded your current quota')
    ) {
      throw AIErrors.authError(`${this.name} (Insufficient Quota): ${message}`);
    }

    if (status === 429 || message.toLowerCase().includes('rate limit')) {
      const retryAfter = response.headers.get('retry-after');
      throw AIErrors.rateLimited(this.modelId, retryAfter ? parseInt(retryAfter, 10) : undefined);
    }

    if (status === 401 || status === 403) {
      throw AIErrors.authError(`${this.name}: ${message}`);
    }

    if (status === 400 || status === 404) {
      throw AIErrors.unsupportedModel(`${this.modelId}: ${message}`);
    }

    throw AIErrors.providerError(this.name, `${status}: ${message}`);
  }

  protected schemaToPrompt(schema: { properties: Record<string, unknown>; required: string[] }): string {
    const fields = Object.keys(schema.properties);
    return `CRITICAL: Respond with ONLY valid JSON (no markdown, no extra text) matching this exact structure:
{
  ${fields.map(f => `"${f}": "your ${f} here"`).join(',\n  ')}
}

Required fields: ${schema.required.join(', ')}`;
  }
}

/**
 * Direct OpenAI API provider.
 */
export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(modelId: string, apiKey: string, timeoutMs: number = 60000) {
    super({
      apiKey,
      modelId,
      timeoutMs,
      baseUrl: 'https://api.openai.com/v1',
      providerName: 'openai-direct',
    });
  }
}

/**
 * Cerebras API provider (OpenAI-compatible).
 */
export class CerebrasProvider extends OpenAICompatibleProvider {
  constructor(modelId: string, apiKey: string, timeoutMs: number = 60000) {
    super({
      apiKey,
      modelId,
      timeoutMs,
      baseUrl: 'https://api.cerebras.ai/v1',
      providerName: 'cerebras',
    });
  }
}

/**
 * Fireworks AI API provider (OpenAI-compatible).
 */
export class FireworksProvider extends OpenAICompatibleProvider {
  constructor(modelId: string, apiKey: string, timeoutMs: number = 60000) {
    super({
      apiKey,
      modelId,
      timeoutMs,
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      providerName: 'fireworks',
    });
  }
}


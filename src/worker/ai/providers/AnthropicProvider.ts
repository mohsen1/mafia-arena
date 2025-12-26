/**
 * Direct Anthropic API provider implementation.
 * 
 * Uses the Anthropic Messages API directly instead of going through OpenRouter.
 * API Docs: https://docs.anthropic.com/en/api/messages
 */

import type { AIProviderInterface, CompletionRequest, CompletionResponse } from '../types.js';
import { AIErrors } from '../errors.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';

interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicError {
  type: 'error';
  error: {
    type: string;
    message: string;
  };
}

export class AnthropicProvider implements AIProviderInterface {
  readonly name = 'anthropic-direct';
  readonly modelId: string;

  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(modelId: string, apiKey: string, timeoutMs: number = 60000) {
    this.modelId = modelId;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: this.modelId,
      max_tokens: request.maxTokens ?? 4000,
      system: request.systemPrompt,
      messages: [
        { role: 'user', content: request.userPrompt },
      ],
    };

    // Add tool use for structured output
    let useToolUse = false;
    if (request.structuredOutput) {
      body.tools = [{
        name: request.structuredOutput.name,
        description: 'Provide your response using this structure.',
        input_schema: {
          type: 'object',
          properties: request.structuredOutput.schema.properties,
          required: request.structuredOutput.schema.required,
        },
      }];
      body.tool_choice = { type: 'tool', name: request.structuredOutput.name };
      useToolUse = true;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as AnthropicError;
        return this.handleHttpError(response.status, errorBody);
      }

      const data = await response.json() as AnthropicResponse;
      const latencyMs = Date.now() - startTime;

      let content: string;
      
      if (useToolUse) {
        // Extract tool use result
        const toolUseBlock = data.content.find(block => block.type === 'tool_use');
        if (toolUseBlock?.input) {
          content = JSON.stringify(toolUseBlock.input);
        } else {
          // Fallback to text content
          const textBlock = data.content.find(block => block.type === 'text');
          content = textBlock?.text ?? '';
        }
      } else {
        const textBlock = data.content.find(block => block.type === 'text');
        content = textBlock?.text ?? '';
      }

      return {
        content,
        tokensUsed: {
          input: data.usage.input_tokens,
          output: data.usage.output_tokens,
          total: data.usage.input_tokens + data.usage.output_tokens,
        },
        latencyMs,
        modelId: this.modelId,
      };

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw AIErrors.timeout(this.name, this.timeoutMs);
        }
        if (error.message.includes('fetch')) {
          throw AIErrors.providerError(this.name, 'Network connection failed');
        }
      }
      throw error;
    }
  }

  private handleHttpError(status: number, body: AnthropicError): never {
    const message = body.error?.message ?? 'Unknown error';
    const errorType = body.error?.type ?? 'unknown';
    
    console.error(`[Anthropic] Error ${status} for model ${this.modelId}:`, JSON.stringify(body));

    // Billing suspension (non-retryable)
    if (status === 402) {
      throw AIErrors.authError(`${this.name} (Billing): ${message}`);
    }

    if (status === 429 || errorType === 'rate_limit_error') {
      throw AIErrors.rateLimited(this.name);
    }

    if (status === 401 || errorType === 'authentication_error') {
      throw AIErrors.authError(`${this.name}: ${message}`);
    }

    if (status === 400 || errorType === 'invalid_request_error') {
      if (message.includes('model') || message.includes('not found')) {
        throw AIErrors.unsupportedModel(this.modelId);
      }
      throw AIErrors.providerError(this.name, `Invalid request: ${message}`);
    }

    if (status === 404) {
      throw AIErrors.unsupportedModel(this.modelId);
    }

    if (status === 529 || errorType === 'overloaded_error') {
      throw AIErrors.rateLimited(this.name, 30);
    }

    throw AIErrors.providerError(this.name, `HTTP ${status}: ${message}`);
  }
}


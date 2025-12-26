/**
 * MiniMax API provider implementation.
 * 
 * MiniMax uses a slightly different API format from OpenAI.
 * API Docs: https://www.minimax.chat/document/guides
 */

import type { AIProviderInterface, CompletionRequest, CompletionResponse } from '../types.js';
import { AIErrors } from '../errors.js';

const MINIMAX_API_URL = 'https://api.minimax.chat/v1/text/chatcompletion_v2';

interface MinimaxResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

export class MinimaxProvider implements AIProviderInterface {
  readonly name = 'minimax';
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

    // Build user prompt with schema instructions if structured output is requested
    let userPrompt = request.userPrompt;
    if (request.structuredOutput) {
      const schemaInstructions = this.schemaToPrompt(request.structuredOutput.schema);
      userPrompt = `${request.userPrompt}\n\n${schemaInstructions}`;
    }

    const body = {
      model: this.modelId,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: request.maxTokens ?? 4000,
      temperature: request.temperature ?? 0.7,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(MINIMAX_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json() as MinimaxResponse;

      // Check for API-level errors
      if (data.base_resp && data.base_resp.status_code !== 0) {
        return this.handleApiError(data.base_resp.status_code, data.base_resp.status_msg);
      }

      if (!response.ok) {
        return this.handleHttpError(response.status, data);
      }

      const latencyMs = Date.now() - startTime;
      const content = data.choices[0]?.message?.content ?? '';

      return {
        content,
        tokensUsed: {
          input: data.usage?.prompt_tokens ?? 0,
          output: data.usage?.completion_tokens ?? 0,
          total: data.usage?.total_tokens ?? 0,
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

  private handleApiError(statusCode: number, message: string): never {
    console.error(`[Minimax] API error ${statusCode} for model ${this.modelId}:`, message);

    if (statusCode === 1002 || statusCode === 1003) {
      throw AIErrors.authError(`${this.name}: ${message}`);
    }

    if (statusCode === 1004) {
      throw AIErrors.rateLimited(this.name);
    }

    throw AIErrors.providerError(this.name, `API ${statusCode}: ${message}`);
  }

  private handleHttpError(status: number, body: MinimaxResponse): never {
    console.error(`[Minimax] HTTP ${status} for model ${this.modelId}:`, JSON.stringify(body));

    if (status === 429) {
      throw AIErrors.rateLimited(this.name);
    }

    if (status === 401 || status === 403) {
      throw AIErrors.authError(`${this.name}: Authentication failed`);
    }

    if (status === 400 || status === 404) {
      throw AIErrors.unsupportedModel(this.modelId);
    }

    throw AIErrors.providerError(this.name, `HTTP ${status}`);
  }

  private schemaToPrompt(schema: { properties: Record<string, unknown>; required: string[] }): string {
    const fields = Object.keys(schema.properties);
    return `CRITICAL: Respond with ONLY valid JSON (no markdown, no extra text) matching this exact structure:
{
  ${fields.map(f => `"${f}": "your ${f} here"`).join(',\n  ')}
}

Required fields: ${schema.required.join(', ')}`;
  }
}


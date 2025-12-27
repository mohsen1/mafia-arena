/**
 * AI21 Labs API provider implementation.
 * 
 * AI21 Labs has a custom API format for chat completions.
 * Supports Jamba 2 Mini and Jamba 2 Large models.
 */

import type { AIProviderInterface, CompletionRequest, CompletionResponse } from '../types.js';
import { AIErrors } from '../errors.js';

interface AI21Response {
  id: string;
  choices: Array<{
    index: number;
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
}

interface AI21ErrorResponse {
  detail?: string;
  message?: string;
  error?: {
    message?: string;
    type?: string;
  };
}

export class AI21Provider implements AIProviderInterface {
  readonly name = 'ai21';
  readonly modelId: string;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl = 'https://api.ai21.com/studio/v1';

  constructor(modelId: string, apiKey: string, timeoutMs: number = 60000) {
    this.modelId = modelId;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
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

    // AI21's Jamba models support response_format for JSON output
    if (request.structuredOutput) {
      body.response_format = { type: 'json_object' };
      // Add schema instructions to the user prompt
      const schemaInstructions = this.schemaToPrompt(request.structuredOutput.schema);
      messages[1] = { role: 'user', content: `${request.userPrompt}\n\n${schemaInstructions}` };
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as AI21Response;
    const latencyMs = Date.now() - startTime;

    const content = typedData.choices[0]?.message.content ?? '';

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

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
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

  private handleHttpError(response: Response, body: unknown): never {
    const status = response.status;
    const error = body as AI21ErrorResponse;
    const message = error.detail ?? error.message ?? error.error?.message ?? JSON.stringify(body);

    console.error(`[ai21] HTTP ${status} for model ${this.modelId}:`, message);

    if (status === 429) {
      throw AIErrors.rateLimited(this.modelId);
    }

    if (status === 401 || status === 403) {
      throw AIErrors.authError(`AI21: ${message}`);
    }

    if (status === 400 || status === 404) {
      throw AIErrors.unsupportedModel(`${this.modelId}: ${message}`);
    }

    throw AIErrors.providerError('ai21', `${status}: ${message}`);
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

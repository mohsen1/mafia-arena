/**
 * Cohere API provider implementation.
 * 
 * Cohere has a custom API format different from OpenAI.
 * Supports Command-R+, Command-R, and Command models.
 */

import type { AIProviderInterface, CompletionRequest, CompletionResponse } from '../types.js';
import { AIErrors } from '../errors.js';

interface CohereResponse {
  id: string;
  text: string;
  generation_id?: string;
  finish_reason: string;
  meta: {
    tokens: {
      input_tokens: number;
      output_tokens: number;
    };
    billed_units?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
}

interface CohereErrorResponse {
  message?: string;
  error?: string;
}

export class CohereProvider implements AIProviderInterface {
  readonly name = 'cohere';
  readonly modelId: string;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl = 'https://api.cohere.ai/v2';

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

    // Cohere supports JSON mode via response_format
    if (request.structuredOutput) {
      body.response_format = { type: 'json_object' };
      // Add schema instructions to the user prompt
      const schemaInstructions = this.schemaToPrompt(request.structuredOutput.schema);
      messages[1] = { role: 'user', content: `${request.userPrompt}\n\n${schemaInstructions}` };
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Client-Name': 'mafia-arena',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as CohereResponse;
    const latencyMs = Date.now() - startTime;

    return {
      content: typedData.text,
      tokensUsed: {
        input: typedData.meta.tokens.input_tokens,
        output: typedData.meta.tokens.output_tokens,
        total: typedData.meta.tokens.input_tokens + typedData.meta.tokens.output_tokens,
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
    const error = body as CohereErrorResponse;
    const message = error.message ?? error.error ?? JSON.stringify(body);

    console.error(`[cohere] HTTP ${status} for model ${this.modelId}:`, message);

    if (status === 429) {
      throw AIErrors.rateLimited(this.modelId);
    }

    if (status === 401 || status === 403) {
      throw AIErrors.authError(`Cohere: ${message}`);
    }

    if (status === 400 || status === 404) {
      throw AIErrors.unsupportedModel(`${this.modelId}: ${message}`);
    }

    throw AIErrors.providerError('cohere', `${status}: ${message}`);
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

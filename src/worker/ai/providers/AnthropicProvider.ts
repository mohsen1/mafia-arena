/**
 * Anthropic API provider implementation.
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason: string;
}

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly modelId: string;

  private readonly baseUrl = 'https://api.anthropic.com/v1';
  private readonly apiVersion = '2023-06-01';

  constructor(config: AIProviderConfig) {
    super(config);
    this.modelId = config.modelId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const response = await this.fetchWithTimeout(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify({
        model: this.modelId,
        system: request.systemPrompt,
        messages: [{ role: 'user', content: request.userPrompt }],
        max_tokens: request.maxTokens ?? 1000,
        temperature: request.temperature ?? 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as AnthropicResponse;
    const latencyMs = Date.now() - startTime;

    // Extract text from content blocks
    const content = typedData.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('');

    return {
      content,
      tokensUsed: {
        input: typedData.usage.input_tokens,
        output: typedData.usage.output_tokens,
        total: typedData.usage.input_tokens + typedData.usage.output_tokens,
      },
      latencyMs,
      modelId: this.modelId,
    };
  }
}


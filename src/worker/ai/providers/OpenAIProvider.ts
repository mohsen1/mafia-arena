/**
 * OpenAI API provider implementation.
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';

interface OpenAIChatResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAIProvider extends BaseProvider {
  readonly name = 'openai';
  readonly modelId: string;

  private readonly baseUrl = 'https://api.openai.com/v1';

  constructor(config: AIProviderConfig) {
    super(config);
    this.modelId = config.modelId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    // Enable JSON mode if requested
    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    console.log(`[OpenAI] Making request to ${this.modelId}, apiKey length: ${this.apiKey?.length ?? 0}`);

    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    console.log(`[OpenAI] Response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[OpenAI] Error response:`, JSON.stringify(data).slice(0, 500));
      this.handleHttpError(response, data);
    }

    const typedData = data as OpenAIChatResponse;
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


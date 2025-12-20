/**
 * OpenRouter API provider implementation.
 * 
 * OpenRouter provides unified access to multiple AI models (OpenAI, Anthropic, Google, etc.)
 * through a single API endpoint with consistent formatting.
 * 
 * API Docs: https://openrouter.ai/docs
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';

interface OpenRouterResponse {
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

/**
 * Model IDs are now OpenRouter IDs directly (e.g., "openai/gpt-5.2").
 * This function ensures the ID is passed through correctly.
 */
function getOpenRouterModelId(modelId: string): string {
  return modelId;
}

export class OpenRouterProvider extends BaseProvider {
  readonly name = 'openrouter';
  readonly modelId: string;
  private readonly openRouterModelId: string;

  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(config: AIProviderConfig) {
    super(config);
    this.modelId = config.modelId;
    this.openRouterModelId = getOpenRouterModelId(config.modelId);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const messages = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];

    const body: Record<string, unknown> = {
      model: this.openRouterModelId,
      messages,
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    // Add structured output via tools if requested
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
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://mafia-arena.me-f9a.workers.dev',
        'X-Title': 'Mafia Arena',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as OpenRouterResponse;
    const latencyMs = Date.now() - startTime;

    let content: string;
    const choice = typedData.choices[0];

    if (request.structuredOutput && choice?.message.tool_calls?.[0]) {
      // Extract tool call result
      content = choice.message.tool_calls[0].function.arguments;
    } else {
      // Regular text response
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
}

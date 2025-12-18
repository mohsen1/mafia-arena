/**
 * OpenAI API provider implementation.
 * 
 * Structured Output Support:
 * - gpt-4o, gpt-4o-mini: Full Structured Outputs with json_schema (100% schema adherence)
 * - gpt-4-turbo and earlier: JSON mode (json_object) + prompt instructions
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse, JsonSchema } from '../types.js';
import { schemaToPromptInstructions } from '../types.js';

interface OpenAIChatResponse {
  choices: Array<{
    message: { content: string; refusal?: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Check if a model supports full Structured Outputs with json_schema.
 */
function supportsNativeSchema(modelId: string): boolean {
  // gpt-4o series supports native json_schema
  if (modelId.startsWith('gpt-4o')) return true;
  return false;
}

/**
 * Convert our JsonSchema to OpenAI's format.
 */
function toOpenAISchema(schema: JsonSchema, name: string): object {
  return {
    name,
    strict: true,
    schema: {
      ...schema,
      additionalProperties: false,
    },
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
    const useNativeSchema = request.structuredOutput && supportsNativeSchema(this.modelId);
    const useJsonMode = request.structuredOutput && !useNativeSchema;

    // For json_mode models, inject schema instructions into the prompt
    let systemPrompt = request.systemPrompt;
    if (useJsonMode) {
      const schemaInstructions = schemaToPromptInstructions(request.structuredOutput!.schema);
      systemPrompt = `${request.systemPrompt}\n\n${schemaInstructions}`;
    }

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    // Use native json_schema for supported models (100% reliable)
    if (useNativeSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: toOpenAISchema(request.structuredOutput!.schema, request.structuredOutput!.name),
      };
    } else if (useJsonMode || request.responseFormat === 'json') {
      // Use json_object mode with prompt instructions (high reliability)
      body.response_format = { type: 'json_object' };
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
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


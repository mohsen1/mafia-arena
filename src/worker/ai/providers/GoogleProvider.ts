/**
 * Google AI (Gemini) provider implementation.
 * 
 * Structured Output Support:
 * - Gemini 2.0+, 2.5+: Full responseSchema support (100% schema adherence)
 * - Gemini 1.5.x: JSON mode (responseMimeType) + prompt instructions
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse, JsonSchema, JsonSchemaProperty } from '../types.js';
import { schemaToPromptInstructions } from '../types.js';

interface GoogleResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Check if a model supports full responseSchema (Gemini 2.0+).
 * Gemini 1.5 only supports basic JSON mode (responseMimeType).
 */
function supportsResponseSchema(modelId: string): boolean {
  // Gemini 3.x and 2.5.x - full support
  if (modelId.includes('gemini-3') || modelId.includes('gemini-2.5')) return true;
  // Gemini 2.0 - requires propertyOrdering but still supports schema
  if (modelId.includes('gemini-2.0')) return true;
  // Gemini 1.5 - basic JSON mode only, no schema enforcement
  return false;
}

/**
 * Check if model requires explicit propertyOrdering (Gemini 2.0 only).
 */
function requiresPropertyOrdering(modelId: string): boolean {
  return modelId.includes('gemini-2.0');
}

/**
 * Convert our JsonSchema to Google's responseSchema format.
 * Google uses OpenAPI 3.0 style types (uppercase).
 * For Gemini 2.0, adds propertyOrdering for key order preservation.
 */
function toGoogleSchema(schema: JsonSchema, needsOrdering: boolean): Record<string, unknown> {
  const propertyKeys = Object.keys(schema.properties);
  
  const convertProperty = (prop: JsonSchemaProperty): Record<string, unknown> => {
    // Map to Google's OpenAPI-style types (uppercase)
    const typeMap: Record<string, string> = {
      string: 'STRING',
      number: 'NUMBER',
      integer: 'INTEGER',
      boolean: 'BOOLEAN',
      array: 'ARRAY',
      object: 'OBJECT',
      null: 'STRING', // Google doesn't support null type directly
    };

    const result: Record<string, unknown> = {
      type: typeMap[prop.type] || 'STRING',
    };

    if (prop.description) result.description = prop.description;
    if (prop.enum) result.enum = prop.enum;
    if (prop.items) result.items = convertProperty(prop.items);
    if (prop.properties) {
      result.properties = Object.fromEntries(
        Object.entries(prop.properties).map(([k, v]) => [k, convertProperty(v)])
      );
    }
    if (prop.required) result.required = prop.required;

    return result;
  };

  const result: Record<string, unknown> = {
    type: 'OBJECT',
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, convertProperty(v)])
    ),
    required: schema.required,
  };

  // Gemini 2.0 requires explicit propertyOrdering to define key order
  if (needsOrdering) {
    result.propertyOrdering = propertyKeys;
  }

  return result;
}

export class GoogleProvider extends BaseProvider {
  readonly name = 'google';
  readonly modelId: string;

  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(config: AIProviderConfig) {
    super(config);
    this.modelId = config.modelId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();
    const useNativeSchema = request.structuredOutput && supportsResponseSchema(this.modelId);
    const useJsonMode = request.structuredOutput && !useNativeSchema;

    // For json_mode models (Gemini 1.5), inject schema instructions into the prompt
    let systemPrompt = request.systemPrompt;
    if (useJsonMode) {
      const schemaInstructions = schemaToPromptInstructions(request.structuredOutput!.schema);
      systemPrompt = `${request.systemPrompt}\n\n${schemaInstructions}`;
    }

    const generationConfig: Record<string, unknown> = {
      maxOutputTokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    // Disable "thinking" for Gemini 2.5+ models to prevent token budget issues
    // Thinking uses up output tokens without producing visible output
    if (this.modelId.includes('gemini-2.5') || this.modelId.includes('gemini-3')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    // Use responseSchema for Gemini 2.0+ (100% schema adherence)
    if (useNativeSchema) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = toGoogleSchema(
        request.structuredOutput!.schema,
        requiresPropertyOrdering(this.modelId)
      );
    } else if (useJsonMode || request.responseFormat === 'json') {
      // JSON mode with prompt instructions for Gemini 1.5 (high reliability)
      generationConfig.responseMimeType = 'application/json';
    }

    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: request.userPrompt }],
        },
      ],
      generationConfig,
    };

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}/models/${this.modelId}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as GoogleResponse;
    const latencyMs = Date.now() - startTime;

    // Extract text from content parts
    const content = typedData.candidates[0]?.content?.parts
      ?.map((p) => p.text)
      .join('') ?? '';

    return {
      content,
      tokensUsed: {
        input: typedData.usageMetadata?.promptTokenCount ?? 0,
        output: typedData.usageMetadata?.candidatesTokenCount ?? 0,
        total: typedData.usageMetadata?.totalTokenCount ?? 0,
      },
      latencyMs,
      modelId: this.modelId,
    };
  }
}


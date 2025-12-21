/**
 * Google Gemini API provider implementation.
 * 
 * Uses native Google Generative AI API for Gemini models.
 * 
 * API Docs: https://ai.google.dev/api/rest
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse, JsonSchema, JsonSchemaProperty } from '../types.js';

interface GoogleGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

interface GoogleContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GoogleRequest {
  contents: GoogleContent[];
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  generationConfig?: GoogleGenerationConfig;
}

interface GoogleResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
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
 * Convert OpenRouter-style model ID to Google API model name.
 * Example: "google/gemini-2.5-pro" -> "gemini-2.5-pro"
 */
function getGoogleModelName(modelId: string): string {
  // Remove the "google/" prefix if present
  return modelId.replace(/^google\//, '');
}

/**
 * Convert our JsonSchema to Google's schema format.
 */
function convertToGoogleSchema(schema: JsonSchema): Record<string, unknown> {
  const convertProperty = (prop: JsonSchemaProperty): Record<string, unknown> => {
    const result: Record<string, unknown> = {
      type: prop.type,
    };
    
    if (prop.description) {
      result.description = prop.description;
    }
    
    if (prop.enum) {
      result.enum = prop.enum;
    }
    
    if (prop.items) {
      result.items = convertProperty(prop.items);
    }
    
    if (prop.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(prop.properties)) {
        (result.properties as Record<string, unknown>)[key] = convertProperty(value);
      }
    }
    
    if (prop.required) {
      result.required = prop.required;
    }
    
    return result;
  };

  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        convertProperty(value),
      ])
    ),
    required: schema.required,
  };
}

export class GoogleProvider extends BaseProvider {
  readonly name = 'google';
  readonly modelId: string;
  private readonly googleModelName: string;

  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(config: AIProviderConfig) {
    super(config);
    this.modelId = config.modelId;
    this.googleModelName = getGoogleModelName(config.modelId);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const generationConfig: GoogleGenerationConfig = {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxTokens ?? 4000,
    };

    // Add structured output if requested (Gemini supports native JSON schema)
    if (request.structuredOutput) {
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = convertToGoogleSchema(request.structuredOutput.schema);
    }

    const body: GoogleRequest = {
      contents: [
        {
          role: 'user',
          parts: [{ text: request.userPrompt }],
        },
      ],
      generationConfig,
    };

    // Add system instruction if provided
    if (request.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: request.systemPrompt }],
      };
    }

    const url = `${this.baseUrl}/models/${this.googleModelName}:generateContent?key=${this.apiKey}`;

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`Google API error for ${this.googleModelName}:`, JSON.stringify(data));
      this.handleHttpError(response, data);
    }

    const typedData = data as GoogleResponse;
    const latencyMs = Date.now() - startTime;

    const content = typedData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

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


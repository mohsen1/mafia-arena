/**
 * Direct Google AI Provider (Gemini API).
 * 
 * Uses the Google AI SDK directly instead of going through OpenRouter.
 * This gives us our own rate limits instead of sharing OpenRouter's pool.
 */

import type { AIProviderInterface, CompletionRequest, CompletionResponse } from '../types.js';
import { AIErrors } from '../errors.js';

// Google AI API endpoint
const GOOGLE_AI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

interface GoogleAIResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Map OpenRouter model IDs to Google AI model names.
 * OpenRouter uses: google/gemini-2.0-flash-exp:free
 * Google AI uses: gemini-2.0-flash-exp
 * 
 * Most OpenRouter model IDs map directly after removing the prefix/suffix.
 * Only specific models that differ need explicit mapping.
 */
function toGoogleModelName(openRouterModelId: string): string {
  // Remove provider prefix (google/) and :free suffix
  const modelName = openRouterModelId
    .replace(/^google\//, '')
    .replace(/:free$/, '');
  
  // Only map models where OpenRouter name differs from Google AI name
  // Most models use the same name on both platforms
  const modelMappings: Record<string, string> = {
    // OpenRouter preview names -> Google AI names
    'gemini-2.5-flash-preview-09-2025': 'gemini-2.5-flash',
    'gemini-2.5-flash-lite-preview-09-2025': 'gemini-2.5-flash',
    'gemini-3-flash-preview': 'gemini-2.5-flash', // Gemini 3 maps to 2.5
    'gemini-3-pro-preview': 'gemini-2.5-pro',
  };
  
  return modelMappings[modelName] || modelName;
}

export class GoogleAIProvider implements AIProviderInterface {
  readonly name = 'google-direct';
  private readonly googleModelName: string;
  
  constructor(
    readonly modelId: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number = 60000
  ) {
    this.googleModelName = toGoogleModelName(modelId);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const url = `${GOOGLE_AI_ENDPOINT}/models/${this.googleModelName}:generateContent?key=${this.apiKey}`;
    
    // Build Google AI request format
    // For structured output, Google expects raw JSON schema, not OpenAI's wrapper format
    let responseSchemaConfig = {};
    if (request.structuredOutput) {
      // OpenAI format has { name, schema, strict }, Google wants the raw schema directly
      const schema = request.structuredOutput.schema || request.structuredOutput;
      responseSchemaConfig = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: schema.type || 'object',
          properties: schema.properties,
          required: schema.required,
        },
      };
    }

    const googleRequest = {
      contents: [
        ...(request.systemPrompt ? [{
          role: 'user',
          parts: [{ text: `[System Instructions]\n${request.systemPrompt}` }],
        }] : []),
        {
          role: 'user',
          parts: [{ text: request.userPrompt }],
        },
      ],
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxTokens ?? 4000,
        ...responseSchemaConfig,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(googleRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({})) as GoogleAIResponse;
        return this.handleHttpError(response.status, errorBody);
      }

      const data = await response.json() as GoogleAIResponse;
      
      if (data.error) {
        throw AIErrors.providerError(this.name, `${data.error.status}: ${data.error.message}`);
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const usage = data.usageMetadata;

      return {
        content,
        tokensUsed: {
          input: usage?.promptTokenCount ?? 0,
          output: usage?.candidatesTokenCount ?? 0,
          total: usage?.totalTokenCount ?? 0,
        },
        latencyMs: 0, // Calculated by wrapper
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

  private handleHttpError(status: number, body: GoogleAIResponse): never {
    const message = body.error?.message ?? 'Unknown error';
    
    console.error(`[GoogleAI] Error ${status} for model ${this.googleModelName}:`, JSON.stringify(body));

    if (status === 429) {
      // Rate limited - this is retryable
      throw AIErrors.rateLimited(this.name);
    }

    if (status === 401 || status === 403) {
      throw AIErrors.authError(`${this.name}: ${message}`);
    }

    if (status === 400) {
      // Check for model not found vs invalid request
      if (message.includes('not found') || message.includes('not supported')) {
        throw AIErrors.unsupportedModel(this.modelId);
      }
      // Use providerError for invalid request (no dedicated error type)
      throw AIErrors.providerError(this.name, `Invalid request: ${message}`);
    }

    if (status === 404) {
      throw AIErrors.unsupportedModel(this.modelId);
    }

    throw AIErrors.providerError(this.name, `HTTP ${status}: ${message}`);
  }
}


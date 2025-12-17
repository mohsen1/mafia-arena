/**
 * Google AI (Gemini) provider implementation.
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';

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

    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: request.systemPrompt }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: request.userPrompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 1000,
        temperature: request.temperature ?? 0.7,
      },
    };

    // Enable JSON mode if requested
    if (request.responseFormat === 'json') {
      (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
    }

    console.log(`[Google] Making request to ${this.modelId}, apiKey length: ${this.apiKey?.length ?? 0}`);

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

    console.log(`[Google] Response status: ${response.status}`);

    if (!response.ok) {
      console.error(`[Google] Error response:`, JSON.stringify(data).slice(0, 500));
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


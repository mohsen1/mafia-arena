/**
 * Base class for AI providers.
 * Provides common functionality like timeout handling and JSON parsing.
 */

import type { AIProviderInterface, AIProviderConfig, CompletionRequest, CompletionResponse } from './types.js';
import { AIErrors } from './errors.js';

/**
 * Abstract base class for AI providers.
 */
export abstract class BaseProvider implements AIProviderInterface {
  abstract readonly name: string;
  abstract readonly modelId: string;

  protected readonly apiKey: string;
  protected readonly timeoutMs: number;

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  /**
   * Complete a prompt using the AI provider.
   */
  abstract complete(request: CompletionRequest): Promise<CompletionResponse>;

  /**
   * Fetch with timeout support.
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
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

  /**
   * Extract JSON from AI response that might be wrapped in markdown code blocks.
   */
  protected extractJSON<T>(content: string): T {
    // Try to extract from markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim()) as T;
      } catch {
        // Continue to try other methods
      }
    }

    // Try to find a JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        // Continue to try raw content
      }
    }

    // Try parsing the whole content
    try {
      return JSON.parse(content.trim()) as T;
    } catch (error) {
      throw AIErrors.parseError(`Could not extract JSON from response: ${content.slice(0, 200)}`);
    }
  }

  /**
   * Handle HTTP error responses.
   */
  protected handleHttpError(response: Response, body: unknown): never {
    const status = response.status;

    // Extract error message from various formats
    const extractMessage = (b: unknown): string => {
      if (typeof b === 'object' && b !== null) {
        const obj = b as Record<string, unknown>;
        // OpenRouter format: { error: { message: "..." } }
        if (obj.error && typeof obj.error === 'object') {
          const err = obj.error as Record<string, unknown>;
          if (err.message) return String(err.message);
        }
        // Direct message
        if (obj.message) return String(obj.message);
      }
      return String(b);
    };

    const message = extractMessage(body);

    // Check for rate limit errors in the message (providers often return 4xx with rate limit info)
    if (message.includes('rate limit') || 
        message.includes('Rate limit') || 
        message.includes('Resource has been exhausted') || 
        message.includes('quota') ||
        message.includes('too many requests') ||
        message.includes('Too many requests')) {
      throw AIErrors.rateLimited(this.modelId, 30);
    }

    if (status === 401 || status === 403) {
      // Check if it's actually a model access issue, not an API key issue
      if (message.includes('model') || message.includes('access')) {
        throw AIErrors.providerError(this.name, `${status}: ${message}`);
      }
      throw AIErrors.authError(this.name);
    }

    if (status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw AIErrors.rateLimited(this.modelId, retryAfter ? parseInt(retryAfter, 10) : undefined);
    }

    // Handle 503 Service Unavailable (also retryable)
    if (status === 503) {
      throw AIErrors.rateLimited(this.modelId, 10);
    }

    // Handle 502 Bad Gateway (upstream provider issues - retryable)
    if (status === 502) {
      throw AIErrors.providerError(this.name, `502 Bad Gateway: ${message}`);
    }

    throw AIErrors.providerError(this.name, `${status}: ${message}`);
  }
}


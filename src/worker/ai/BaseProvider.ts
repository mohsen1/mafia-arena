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

    if (status === 401 || status === 403) {
      throw AIErrors.authError(this.name);
    }

    if (status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw AIErrors.rateLimited(this.modelId, retryAfter ? parseInt(retryAfter, 10) : undefined);
    }

    const message = typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: { message?: string } }).error?.message ?? body)
      : String(body);

    throw AIErrors.providerError(this.name, message);
  }
}


/**
 * OpenRouter API provider implementation.
 * 
 * OpenRouter provides unified access to multiple AI models (OpenAI, Anthropic, Google, etc.)
 * through a single API endpoint with consistent formatting.
 * 
 * API Docs: https://openrouter.ai/docs
 */

import type { AIProviderInterface, AIProviderConfig, CompletionRequest, CompletionResponse } from '../types.js';
import { AIErrors } from '../errors.js';

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

export class OpenRouterProvider implements AIProviderInterface {
  readonly name = 'openrouter';
  readonly modelId: string;

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(config: AIProviderConfig) {
    this.apiKey = config.apiKey;
    this.modelId = config.modelId;
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const messages = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];

    const body: Record<string, unknown> = {
      model: this.modelId,
      messages,
      max_tokens: request.maxTokens ?? 4000,
      temperature: request.temperature ?? 0.7,
    };

    // Add structured output via tools if requested
    let useStructuredOutput = false;
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
      useStructuredOutput = true;
    }

    let response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://mafia-arena.me-f9a.workers.dev',
        'X-Title': 'Mafia Arena',
      },
      body: JSON.stringify(body),
    });

    let data = await response.json();

    // Fallback chain for models with limited feature support
    if (!response.ok && useStructuredOutput) {
      const error = data as { error?: { message?: string; code?: number } };
      const isToolChoiceError = 
        error.error?.message?.includes('tool_choice') ||
        error.error?.message?.includes('endpoints found') ||
        error.error?.code === 404;
      
      if (isToolChoiceError) {
        // Retry without tool_choice - try JSON mode
        delete body.tools;
        delete body.tool_choice;
        body.response_format = { type: 'json_object' };
        
        const schemaInstructions = this.schemaToPrompt(request.structuredOutput!.schema);
        const enhancedUserPrompt = `${request.userPrompt}\n\n${schemaInstructions}`;
        (messages[1] as { content: string }).content = enhancedUserPrompt;
        (body as { messages: unknown }).messages = messages;
        
        response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://mafia-arena.me-f9a.workers.dev',
            'X-Title': 'Mafia Arena',
          },
          body: JSON.stringify(body),
        });
        
        data = await response.json();
        useStructuredOutput = false;
        
        // Level 2: If response_format also fails, retry without it
        if (!response.ok) {
          const formatError = data as { error?: { message?: string; metadata?: { raw?: string } } };
          const isResponseFormatError = 
            formatError.error?.message?.includes('response_format') ||
            formatError.error?.metadata?.raw?.includes('response_format');
          
          if (isResponseFormatError) {
            delete body.response_format;
            
            response = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://mafia-arena.me-f9a.workers.dev',
                'X-Title': 'Mafia Arena',
              },
              body: JSON.stringify(body),
            });
            
            data = await response.json();
          }
        }
      }
    }

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as OpenRouterResponse;
    const latencyMs = Date.now() - startTime;

    let content: string;
    const choice = typedData.choices[0];

    if (useStructuredOutput && choice?.message.tool_calls?.[0]) {
      content = choice.message.tool_calls[0].function.arguments;
    } else {
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

  /**
   * Fetch with timeout support.
   */
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
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
   * Handle HTTP error responses.
   */
  private handleHttpError(response: Response, body: unknown): never {
    const status = response.status;

    // Log the full error response for debugging
    console.error(`[OpenRouter] HTTP ${status} for model ${this.modelId}:`, JSON.stringify(body));

    const extractMessage = (b: unknown): string => {
      if (typeof b === 'object' && b !== null) {
        const obj = b as Record<string, unknown>;
        if (obj.error && typeof obj.error === 'object') {
          const err = obj.error as Record<string, unknown>;
          if (err.message) return String(err.message);
        }
        if (obj.message) return String(obj.message);
      }
      return String(b);
    };

    const message = extractMessage(body);

    // Check for rate limit errors
    if (message.includes('rate limit') || 
        message.includes('Rate limit') || 
        message.includes('Resource has been exhausted') || 
        message.includes('quota') ||
        message.includes('too many requests') ||
        message.includes('Too many requests')) {
      throw AIErrors.rateLimited(this.modelId, 30);
    }

    // Check for key/credit limit (non-retryable)
    if (message.includes('Key limit exceeded') || message.includes('limit exceeded')) {
      throw AIErrors.authError(this.name + ': ' + message);
    }

    if (status === 401 || status === 403) {
      // 403 is often "key limit exceeded" - don't retry
      throw AIErrors.authError(this.name + ': ' + message);
    }

    if (status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw AIErrors.rateLimited(this.modelId, retryAfter ? parseInt(retryAfter, 10) : undefined);
    }

    if (status === 503) {
      throw AIErrors.rateLimited(this.modelId, 10);
    }

    if (status === 502) {
      throw AIErrors.providerError(this.name, `502 Bad Gateway: ${message}`);
    }

    throw AIErrors.providerError(this.name, `${status}: ${message}`);
  }

  /**
   * Convert JSON schema to prompt instructions.
   */
  private schemaToPrompt(schema: { properties: Record<string, unknown>; required: string[] }): string {
    const fields = Object.keys(schema.properties);
    return `CRITICAL: Respond with ONLY valid JSON (no markdown, no extra text) matching this exact structure:
{
  ${fields.map(f => `"${f}": "your ${f} here"`).join(',\n  ')}
}

Required fields: ${schema.required.join(', ')}`;
  }
}

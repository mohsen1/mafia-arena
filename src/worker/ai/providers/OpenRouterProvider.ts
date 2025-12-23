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

    // Fallback: If model doesn't support tool_choice, retry without it
    if (!response.ok && useStructuredOutput) {
      const error = data as { error?: { message?: string; code?: number } };
      const isToolChoiceError = 
        error.error?.message?.includes('tool_choice') ||
        error.error?.message?.includes('endpoints found') ||
        error.error?.code === 404;
      
      if (isToolChoiceError) {
        console.warn(`Model ${this.openRouterModelId} doesn't support tool_choice, retrying without structured output`);
        
        // Retry without tool_choice - just use JSON mode prompt
        delete body.tools;
        delete body.tool_choice;
        body.response_format = { type: 'json_object' };
        
        // Add JSON instructions to the user prompt
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
        useStructuredOutput = false; // Don't try to extract from tool_calls
      }
    }

    if (!response.ok) {
      console.error(`OpenRouter error for ${this.openRouterModelId}:`, JSON.stringify(data));
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/7a329efc-2a69-4367-83f3-59949ae46fb4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'OpenRouterProvider.ts:complete:httpError',message:'OpenRouter API error',data:{modelId:this.openRouterModelId,status:response.status,error:data},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      this.handleHttpError(response, data);
    }

    const typedData = data as OpenRouterResponse;
    const latencyMs = Date.now() - startTime;

    let content: string;
    const choice = typedData.choices[0];

    if (useStructuredOutput && choice?.message.tool_calls?.[0]) {
      // Extract tool call result (native structured output)
      content = choice.message.tool_calls[0].function.arguments;
    } else {
      // Regular text response or fallback JSON mode
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
   * Convert JSON schema to prompt instructions for models that don't support structured outputs.
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

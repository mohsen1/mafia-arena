/**
 * Anthropic API provider implementation.
 * 
 * Structured Output Support:
 * - Claude 3/3.5: Uses tool_use for structured output (100% schema adherence)
 * - Claude 4+ (future): Native output_format with json_schema (beta)
 * 
 * Both approaches use constrained decoding for 100% reliable structured output.
 */

import { BaseProvider } from '../BaseProvider.js';
import type { AIProviderConfig, CompletionRequest, CompletionResponse, JsonSchema, JsonSchemaProperty } from '../types.js';

interface AnthropicResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  >;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  stop_reason: string;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * Check if model supports native structured outputs.
 * Currently disabled - tool_use approach works reliably for all Claude models.
 * Native structured outputs may be available in future API versions.
 */
function supportsNativeStructuredOutput(_modelId: string): boolean {
  // Disable native structured outputs for now - use tool_use for all models
  // The beta header for native structured outputs may not be stable yet
  return false;
}

/**
 * Convert our JsonSchema to Anthropic's tool input_schema format.
 */
function toAnthropicSchema(schema: JsonSchema): AnthropicTool['input_schema'] {
  const convertProperty = (prop: JsonSchemaProperty): Record<string, unknown> => {
    const result: Record<string, unknown> = { type: prop.type };
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

  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, convertProperty(v)])
    ),
    required: schema.required,
  };
}

export class AnthropicProvider extends BaseProvider {
  readonly name = 'anthropic';
  readonly modelId: string;

  private readonly baseUrl = 'https://api.anthropic.com/v1';
  private readonly apiVersion = '2023-06-01';

  constructor(config: AIProviderConfig) {
    super(config);
    this.modelId = config.modelId;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: this.modelId,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
      max_tokens: request.maxTokens ?? 1000,
      temperature: request.temperature ?? 0.7,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': this.apiVersion,
    };

    // Use structured output based on model capability
    if (request.structuredOutput) {
      if (supportsNativeStructuredOutput(this.modelId)) {
        // Claude 4+ native structured outputs (beta)
        headers['anthropic-beta'] = 'structured-outputs-2025-11-13';
        body.output_format = {
          type: 'json_schema',
          schema: toAnthropicSchema(request.structuredOutput.schema),
        };
      } else {
        // Claude 3/3.5: Use tool_use to enforce structured output
        const tool: AnthropicTool = {
          name: request.structuredOutput.name,
          description: `Provide your response using this tool. This is the required output format.`,
          input_schema: toAnthropicSchema(request.structuredOutput.schema),
        };
        body.tools = [tool];
        body.tool_choice = { type: 'tool', name: request.structuredOutput.name };
      }
    }

    const response = await this.fetchWithTimeout(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      this.handleHttpError(response, data);
    }

    const typedData = data as AnthropicResponse;
    const latencyMs = Date.now() - startTime;

    let content: string;

    if (request.structuredOutput && supportsNativeStructuredOutput(this.modelId)) {
      // Claude 4+ native structured output: response is in text content
      content = typedData.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');
    } else if (request.structuredOutput) {
      // Claude 3/3.5: Extract tool use result and convert to JSON string
      const toolUse = typedData.content.find(
        (c): c is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          c.type === 'tool_use'
      );
      if (toolUse) {
        content = JSON.stringify(toolUse.input);
      } else {
        // Fallback to text if no tool use (shouldn't happen with tool_choice)
        content = typedData.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('');
      }
    } else {
      // Regular text response
      content = typedData.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
        .join('');
    }

    return {
      content,
      tokensUsed: {
        input: typedData.usage.input_tokens,
        output: typedData.usage.output_tokens,
        total: typedData.usage.input_tokens + typedData.usage.output_tokens,
      },
      latencyMs,
      modelId: this.modelId,
    };
  }
}


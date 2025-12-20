/**
 * AI Provider type definitions.
 */

/**
 * Structured output capability levels for models.
 * 
 * - 'schema': Full schema enforcement via API (100% reliable)
 * - 'tool': Schema enforcement via tool_use (100% reliable)  
 * - 'json_mode': JSON mode only, schema via prompt (high reliability)
 * - 'prompt_only': No JSON mode, schema via prompt + extraction (reasonable reliability)
 */
export type StructuredOutputLevel = 'schema' | 'tool' | 'json_mode' | 'prompt_only';

/**
 * Common interface for all AI providers.
 */
export interface AIProviderInterface {
  readonly name: string;
  readonly modelId: string;

  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

/**
 * JSON Schema definition for structured output.
 */
export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties?: boolean;
}

export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'integer' | 'null';
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Structured output configuration.
 */
export interface StructuredOutputConfig {
  name: string;
  schema: JsonSchema;
  strict?: boolean;
}

/**
 * Request structure for AI completions.
 */
export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** @deprecated Use structuredOutput instead */
  responseFormat?: 'json' | 'text';
  /** Structured output configuration with JSON schema */
  structuredOutput?: StructuredOutputConfig;
}

// =============================================================================
// JSON Schemas for Game Actions
// =============================================================================

/**
 * Schema for persona generation response.
 */
export const PERSONA_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The character name' },
    background: { type: 'string', description: '1-2 sentences about the character' },
    personality: { type: 'string', description: 'Communication style' },
    occupation: { type: 'string', description: 'Optional occupation' },
  },
  required: ['name', 'background', 'personality'],
  additionalProperties: false,
};

/**
 * Schema for introduction/discussion message response.
 */
export const MESSAGE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    message: { type: 'string', description: 'The message to share' },
  },
  required: ['message'],
  additionalProperties: false,
};

/**
 * Schema for kill vote response.
 */
export const KILL_VOTE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['kill'], description: 'The action type' },
    target: { type: 'string', description: 'Player ID to target (e.g., "player_1", "player_2"). Must be the exact ID, not the name.' },
    reasoning: { type: 'string', description: 'Brief explanation' },
  },
  required: ['target'],
  additionalProperties: false,
};

/**
 * Schema for elimination vote response (can be null for abstain).
 */
export const ELIMINATION_VOTE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    vote: { type: 'string', description: 'Player ID to vote for (e.g., "player_1", "player_2"). Must be the exact ID, not the name. Use "null" string to abstain.' },
    reasoning: { type: 'string', description: 'Brief explanation' },
  },
  required: ['vote'],
  additionalProperties: false,
};

/**
 * Get the appropriate schema for an action type.
 */
export function getSchemaForAction(actionType: string): StructuredOutputConfig {
  switch (actionType) {
    case 'persona_generation':
      return { name: 'persona', schema: PERSONA_SCHEMA, strict: true };
    case 'introduction':
    case 'discussion':
    case 'mafia_discussion':
      return { name: 'message', schema: MESSAGE_SCHEMA, strict: true };
    case 'kill_vote':
      return { name: 'kill_vote', schema: KILL_VOTE_SCHEMA, strict: true };
    case 'elimination_vote':
      return { name: 'elimination_vote', schema: ELIMINATION_VOTE_SCHEMA, strict: true };
    default:
      return { name: 'message', schema: MESSAGE_SCHEMA, strict: true };
  }
}

/**
 * Response structure from AI completions.
 */
export interface CompletionResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  latencyMs: number;
  modelId: string;
}

/**
 * Configuration for AI providers.
 */
export interface AIProviderConfig {
  apiKey: string;
  modelId: string;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Model configuration with structured output capability.
 */
export interface ModelConfig {
  provider: string;
  displayName: string;
  structuredOutput: StructuredOutputLevel;
}

/**
 * Supported AI model registry with structured output capabilities.
 * 
 * All models are accessed via OpenRouter. Model IDs match OpenRouter's naming.
 * 
 * Capability Levels:
 * - 'schema': Native API schema enforcement (100% reliable)
 * - 'tool': Schema via tool_use (100% reliable)
 * - 'json_mode': JSON mode + prompt instructions (high reliability)
 * - 'prompt_only': Prompt instructions only (reasonable reliability)
 * 
 * Updated: December 2025
 */
export const SUPPORTED_MODELS: Record<string, ModelConfig> = {
  // Amazon Nova family
  'amazon/nova-2-lite-v1': { provider: 'openrouter', displayName: 'Nova 2 Lite', structuredOutput: 'tool' },
  'amazon/nova-lite-v1': { provider: 'openrouter', displayName: 'Nova Lite', structuredOutput: 'tool' },
  'amazon/nova-premier-v1': { provider: 'openrouter', displayName: 'Nova Premier', structuredOutput: 'tool' },
  'amazon/nova-pro-v1': { provider: 'openrouter', displayName: 'Nova Pro', structuredOutput: 'tool' },

  // Anthropic Claude
  'anthropic/claude-sonnet-4.5': { provider: 'openrouter', displayName: 'Claude Sonnet 4.5', structuredOutput: 'tool' },

  // Google Gemini family
  'google/gemini-2.5-flash-lite-preview-09-2025': { provider: 'openrouter', displayName: 'Gemini 2.5 Flash Lite', structuredOutput: 'schema' },
  'google/gemini-2.5-flash-preview-09-2025': { provider: 'openrouter', displayName: 'Gemini 2.5 Flash', structuredOutput: 'schema' },
  'google/gemini-2.5-pro': { provider: 'openrouter', displayName: 'Gemini 2.5 Pro', structuredOutput: 'schema' },
  'google/gemini-2.5-pro-preview-05-06': { provider: 'openrouter', displayName: 'Gemini 2.5 Pro Preview', structuredOutput: 'schema' },
  'google/gemini-3-flash-preview': { provider: 'openrouter', displayName: 'Gemini 3 Flash', structuredOutput: 'schema' },
  'google/gemini-3-pro-preview': { provider: 'openrouter', displayName: 'Gemini 3 Pro', structuredOutput: 'schema' },

  // Meta Llama 4 family
  'meta-llama/llama-4-maverick': { provider: 'openrouter', displayName: 'Llama 4 Maverick', structuredOutput: 'json_mode' },
  'meta-llama/llama-4-scout': { provider: 'openrouter', displayName: 'Llama 4 Scout', structuredOutput: 'json_mode' },

  // MiniMax family
  'minimax/minimax-01': { provider: 'openrouter', displayName: 'MiniMax 01', structuredOutput: 'json_mode' },
  'minimax/minimax-m1': { provider: 'openrouter', displayName: 'MiniMax M1', structuredOutput: 'json_mode' },

  // Mistral family
  'mistralai/devstral-2512': { provider: 'openrouter', displayName: 'Devstral', structuredOutput: 'json_mode' },
  'mistralai/devstral-2512:free': { provider: 'openrouter', displayName: 'Devstral (Free)', structuredOutput: 'json_mode' },
  'mistralai/ministral-14b-2512': { provider: 'openrouter', displayName: 'Ministral 14B', structuredOutput: 'json_mode' },
  'mistralai/ministral-8b-2512': { provider: 'openrouter', displayName: 'Ministral 8B', structuredOutput: 'json_mode' },
  'mistralai/mistral-large-2512': { provider: 'openrouter', displayName: 'Mistral Large', structuredOutput: 'json_mode' },

  // Moonshot Kimi family
  'moonshotai/kimi-k2-0905': { provider: 'openrouter', displayName: 'Kimi K2', structuredOutput: 'json_mode' },
  'moonshotai/kimi-k2-0905:exacto': { provider: 'openrouter', displayName: 'Kimi K2 Exacto', structuredOutput: 'json_mode' },
  'moonshotai/kimi-k2-thinking': { provider: 'openrouter', displayName: 'Kimi K2 Thinking', structuredOutput: 'json_mode' },

  // NVIDIA Nemotron
  'nvidia/nemotron-3-nano-30b-a3b': { provider: 'openrouter', displayName: 'Nemotron 3 Nano', structuredOutput: 'json_mode' },

  // OpenAI GPT-5.2 family
  'openai/gpt-5.2': { provider: 'openrouter', displayName: 'GPT-5.2', structuredOutput: 'schema' },
  'openai/gpt-5.2-pro': { provider: 'openrouter', displayName: 'GPT-5.2 Pro', structuredOutput: 'schema' },

  // Qwen family
  'qwen/qwen-plus-2025-07-28': { provider: 'openrouter', displayName: 'Qwen Plus', structuredOutput: 'json_mode' },
  'qwen/qwen-plus-2025-07-28:thinking': { provider: 'openrouter', displayName: 'Qwen Plus Thinking', structuredOutput: 'json_mode' },
  'qwen/qwen-turbo': { provider: 'openrouter', displayName: 'Qwen Turbo', structuredOutput: 'json_mode' },
  'qwen/qwen3-30b-a3b-instruct-2507': { provider: 'openrouter', displayName: 'Qwen3 30B', structuredOutput: 'json_mode' },
  'qwen/qwen3-next-80b-a3b-instruct': { provider: 'openrouter', displayName: 'Qwen3 Next 80B', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-235b-a22b-instruct': { provider: 'openrouter', displayName: 'Qwen3 VL 235B', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-235b-a22b-thinking': { provider: 'openrouter', displayName: 'Qwen3 VL 235B Thinking', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-30b-a3b-instruct': { provider: 'openrouter', displayName: 'Qwen3 VL 30B', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-32b-instruct': { provider: 'openrouter', displayName: 'Qwen3 VL 32B', structuredOutput: 'json_mode' },

  // xAI Grok family
  'x-ai/grok-4-fast': { provider: 'openrouter', displayName: 'Grok 4 Fast', structuredOutput: 'json_mode' },
  'x-ai/grok-4.1-fast': { provider: 'openrouter', displayName: 'Grok 4.1 Fast', structuredOutput: 'json_mode' },

  // Xiaomi MiMo
  'xiaomi/mimo-v2-flash:free': { provider: 'openrouter', displayName: 'MiMo V2 Flash (Free)', structuredOutput: 'json_mode' },
};

/**
 * Get provider name for a model ID.
 */
export function getProviderForModel(modelId: string): string | undefined {
  return SUPPORTED_MODELS[modelId]?.provider;
}

/**
 * Get structured output level for a model.
 */
export function getStructuredOutputLevel(modelId: string): StructuredOutputLevel {
  return SUPPORTED_MODELS[modelId]?.structuredOutput ?? 'prompt_only';
}

/**
 * Check if a model is supported.
 */
export function isModelSupported(modelId: string): boolean {
  return modelId in SUPPORTED_MODELS;
}

// =============================================================================
// Schema to Prompt Conversion (for json_mode and prompt_only fallbacks)
// =============================================================================

/**
 * Convert a JSON schema to human-readable prompt instructions.
 * Used for models that don't support native schema enforcement.
 */
export function schemaToPromptInstructions(schema: JsonSchema): string {
  const formatProperty = (name: string, prop: JsonSchemaProperty, indent = ''): string => {
    let line = `${indent}"${name}": `;
    
    if (prop.enum) {
      line += `one of: ${prop.enum.map(e => `"${e}"`).join(' | ')}`;
    } else if (prop.type === 'array' && prop.items) {
      line += `array of ${prop.items.type}`;
    } else if (prop.type === 'object' && prop.properties) {
      line += 'object';
    } else {
      line += prop.type;
    }
    
    if (prop.description) {
      line += ` // ${prop.description}`;
    }
    
    return line;
  };

  const lines = [
    'You MUST respond with valid JSON matching this exact structure:',
    '{',
  ];
  
  const propNames = Object.keys(schema.properties);
  propNames.forEach((name, i) => {
    const prop = schema.properties[name];
    if (!prop) return;
    const isRequired = schema.required.includes(name);
    const comma = i < propNames.length - 1 ? ',' : '';
    lines.push(`  ${formatProperty(name, prop)}${isRequired ? ' (required)' : ' (optional)'}${comma}`);
  });
  
  lines.push('}');
  lines.push('');
  lines.push('Respond with ONLY the JSON object, no additional text or markdown.');
  
  return lines.join('\n');
}

/**
 * Extract JSON from a potentially messy response.
 * Handles markdown code blocks, leading/trailing text, etc.
 */
export function extractJSON(text: string): string {
  // Try to find JSON in markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }
  
  // Try to find JSON object or array
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch?.[1]) {
    return jsonMatch[1].trim();
  }
  
  // Return trimmed original
  return text.trim();
}

/**
 * Validate that parsed JSON matches the expected schema structure.
 * Returns the parsed object if valid, throws if invalid.
 */
export function validateAgainstSchema(json: string, schema: JsonSchema): Record<string, unknown> {
  const parsed = JSON.parse(json);
  
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Response must be a JSON object');
  }
  
  // Check required fields
  for (const field of schema.required) {
    if (!(field in parsed)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  return parsed as Record<string, unknown>;
}


/**
 * AI Provider type definitions.
 */

// =============================================================================
// Suspense Pattern Types (for handling long AI calls without DO hibernation issues)
// =============================================================================

/**
 * Error thrown when an AI result is not yet available.
 * Signals the GameRunner to suspend execution and queue the request.
 * 
 * This implements the "Async Suspend-Resume" pattern:
 * 1. GameAIAdapter checks DO storage for cached response
 * 2. If not found, throws SuspenseError
 * 3. GameRunner catches this, queues the AI request, saves state, hibernates
 * 4. Queue worker executes AI call, POSTs result back to DO
 * 5. DO resumes, adapter finds cached response, game continues
 */
export class SuspenseError extends Error {
  readonly name = 'SuspenseError';
  
  constructor(
    public readonly requestId: string,
    public readonly request: CompletionRequest,
    public readonly modelId: string,
    public readonly context: {
      gameId: string;
      round: number;
      phase: string;
      playerId: string;
      actionType: string;
    }
  ) {
    super(`Suspended waiting for AI: ${requestId}`);
  }
}

/**
 * Message payload for the AI Request Queue.
 * Contains everything needed for the queue worker to execute the AI call
 * and route the response back to the correct DO.
 * 
 * CLAIM CHECK PATTERN:
 * If the request payload exceeds 128KB queue limit, it's offloaded to R2
 * and only the reference (requestRef) is sent in the queue message.
 */
export interface AIRequestMessage {
  requestId: string;
  gameId: string;
  modelId: string;
  /** The full request payload. Optional if offloaded to R2 via requestRef. */
  request?: CompletionRequest;
  /** R2 key for offloaded request payload (Claim Check pattern for large prompts) */
  requestRef?: string;
  context: {
    round: number;
    phase: string;
    playerId: string;
    actionType: string;
  };
  timestamp: number;
  traceId?: string;
}

/**
 * Structure stored in DO storage for cached AI responses.
 * Keyed by requestId (deterministic based on game state).
 */
export interface CachedAIResponse {
  response: CompletionResponse;
  timestamp: number;
}

/**
 * Function type for checking DO storage cache.
 * Injected into GameAIAdapter by GameRunner.
 */
export type ResponseCacheFn = (requestId: string) => Promise<CachedAIResponse | undefined>;

/**
 * Function type for queueing AI requests.
 * Injected into GameAIAdapter by GameRunner.
 */
export type QueueRequestFn = (message: AIRequestMessage) => Promise<void>;

// =============================================================================
// Core AI Provider Types
// =============================================================================

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
  /** Base URL override for OpenAI-compatible APIs */
  baseUrl?: string;
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
 * Extended model configuration with provider routing.
 * Used by the factory to determine which provider to use.
 */
export interface ModelRoutingConfig {
  /** Primary model ID (used for display and database lookups) */
  id: string;
  /** Model family/creator for UI grouping (e.g., 'google', 'openai') */
  family: string;
  /** Human-readable display name */
  displayName: string;
  /** Which API provider to use for requests */
  apiProvider: 'openrouter' | 'openai' | 'anthropic' | 'google' | 'cerebras' | 'minimax' | 'fireworks';
  /** The model ID to send to the specific API (may differ from primary ID) */
  apiModelId: string;
  /** Structured output capability level */
  structuredOutput: StructuredOutputLevel;
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


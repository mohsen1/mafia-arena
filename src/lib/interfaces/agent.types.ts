/**
 * Configuration for an AI agent.
 */
export interface AgentConfig {
  /** The specific model identifier (e.g., 'gpt-4o', 'claude-3-opus-20240229'). */
  model: string;
  /** The provider of the model (e.g., 'openai', 'anthropic', 'groq'). */
  provider: string; // Could be more specific like 'openai' | 'anthropic' | 'groq' if known
  /** Optional base system prompt or personality instructions. */
  personalityPrompt?: string;
  /** Optional flag indicating if the model should be forced to output JSON. */
  jsonMode?: boolean;
  /** Optional API key, if needed and not handled globally. */
  apiKey?: string;
  /** Optional temperature setting for model generation (0-1). */
  temperature?: number;
  // Add other common configuration parameters as needed (e.g., maxTokens, topP)
}

// We might add IAgent interface here later if needed centrally
// export interface IAgent { ... } 
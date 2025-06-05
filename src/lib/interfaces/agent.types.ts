/**
 * Configuration for an AI agent.
 * Aligned with persistence.types.ts
 */
export interface AgentConfig {
  /** Identifier for the type of agent (e.g., 'OpenAI', 'Human', 'Claude'). */
  agentType: string;
  /** The specific model identifier (optional). */
  modelName?: string;
  /** Identifier for the provider/endpoint (optional). */
  providerValue?: string;
  /** Optional base system prompt or personality instructions. */
  personalityPrompt?: string;
  /** Optional flag indicating if the model should be forced to output JSON. */
  jsonMode?: boolean;
  /** Optional API key, if needed and not handled globally. */
  apiKey?: string;
  /** Optional temperature setting for model generation (0-1). */
  temperature?: number;
}

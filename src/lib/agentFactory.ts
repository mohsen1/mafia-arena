import type { AgentConfig } from './interfaces/persistence.types';
import type { PlayerId } from './engine/interfaces/IPlayer';
import type { IAgent } from './engine/interfaces/IAgent';

// Import known agent classes
import { OpenAIAgent } from './engine/agents/OpenAIAgent';
import { HumanAgent } from './engine/agents/HumanAgent';
// Import the actual DummyAIAgent
import { DummyAIAgent } from './engine/agents/DummyAIAgent';
import { MockAIAgent } from './engine/agents/MockAIAgent';
import { ClaudeAgent } from './engine/agents/ClaudeAgent';
import { GeminiAgent } from './engine/agents/GeminiAgent';
import { OllamaAgent } from './engine/agents/OllamaAgent';

import { openAIProviders } from './models';
import { getDecryptedApiKey } from '@/app/actions/api-keys.actions';
import {
  getOllamaEndpoint,
  type CustomProviderConfig,
} from './utils/providerUtils';

// Remove internal DummyAgent definition

// Import PlayerAction if needed by DummyAgent
// import type { PlayerAction } from './engine/interfaces/IAgent'; // Likely not needed here anymore

/**
 * Creates an agent instance based on the provided configuration.
 * @param agentConfig Configuration object specifying the agent type and settings.
 * @param playerId The ID to assign to the created agent.
 * @param userId Optional user ID to use user-provided API keys.
 * @param customConfig Optional custom provider configuration (e.g., for Ollama endpoints).
 * @returns An instance of the specified agent conforming to IAgent.
 */
export async function createAgentInstance(
  agentConfig: AgentConfig,
  playerId: PlayerId,
  userId?: string,
  customConfig?: CustomProviderConfig
): Promise<IAgent> {
  if (process.env.USE_MOCK_AI === 'true') {
    return new MockAIAgent(playerId);
  }
  let apiBase: string | undefined = undefined;
  let apiKey: string | undefined = undefined;

  // First, try to get user-provided API key if userId is provided
  if (userId && agentConfig.providerValue) {
    try {
      const userApiKey = await getDecryptedApiKey(
        userId,
        agentConfig.providerValue
      );
      if (userApiKey) {
        apiKey = userApiKey;
      }
    } catch (error) {
      console.warn(
        `Failed to get user API key for ${agentConfig.providerValue}:`,
        error
      );
      // Fall back to environment variables
    }
  }

  const providerDef = openAIProviders.find(
    (p) => p.value === agentConfig.providerValue
  );
  if (providerDef) {
    // Use custom endpoint for Ollama if provided, otherwise use default
    if (providerDef.value === 'ollama_local') {
      apiBase = getOllamaEndpoint(customConfig);
    } else {
      apiBase = providerDef.endpoint;
    }

    // Use user API key if available, otherwise fall back to environment variable
    if (!apiKey) {
      apiKey = providerDef.apiKeyEnvVar
        ? process.env[providerDef.apiKeyEnvVar]
        : undefined;
    }
    if (
      providerDef.value === 'ollama_local' &&
      (!apiKey || apiKey === 'OLLAMA_API_KEY')
    ) {
      apiKey = undefined;
    }
  } else if (agentConfig.agentType === 'OpenAI') {
    apiBase = process.env.OPENAI_API_BASE;
    // Use user API key if available, otherwise fall back to environment variable
    if (!apiKey) {
      apiKey = process.env.OPENAI_API_KEY;
    }
  }

  switch (agentConfig.agentType) {
    case 'OpenAI':
    case 'Groq':
    case 'Fireworks':
      return new OpenAIAgent(playerId, agentConfig.modelName, apiBase, apiKey);

    case 'Ollama':
      return new OllamaAgent(playerId, agentConfig.modelName, apiBase, apiKey);

    case 'Claude':
      if (!agentConfig.modelName)
        throw new Error('ClaudeAgent requires modelName');

      // For Claude, try to get user API key if available
      if (userId) {
        const userClaudeKey = await getDecryptedApiKey(userId, 'anthropic');
        if (userClaudeKey) {
          // Temporarily set environment variable for Claude agent
          const originalKey = process.env.ANTHROPIC_API_KEY;
          process.env.ANTHROPIC_API_KEY = userClaudeKey;
          const agent = new ClaudeAgent(playerId, agentConfig.modelName);
          // Restore original key
          if (originalKey) {
            process.env.ANTHROPIC_API_KEY = originalKey;
          } else {
            delete process.env.ANTHROPIC_API_KEY;
          }
          return agent;
        }
      }
      return new ClaudeAgent(playerId, agentConfig.modelName);

    case 'Gemini':
      if (!agentConfig.modelName)
        throw new Error('GeminiAgent requires modelName');

      // For Gemini, try to get user API key if available
      if (userId) {
        const userGeminiKey = await getDecryptedApiKey(userId, 'gemini');
        if (userGeminiKey) {
          // Temporarily set environment variable for Gemini agent
          const originalKey = process.env.GEMINI_API_KEY;
          process.env.GEMINI_API_KEY = userGeminiKey;
          const agent = new GeminiAgent(playerId, agentConfig.modelName);
          // Restore original key
          if (originalKey) {
            process.env.GEMINI_API_KEY = originalKey;
          } else {
            delete process.env.GEMINI_API_KEY;
          }
          return agent;
        }
      }
      return new GeminiAgent(playerId, agentConfig.modelName);

    case 'Human':
      return new HumanAgent(playerId);

    default:
      return new DummyAIAgent(playerId);
  }
}

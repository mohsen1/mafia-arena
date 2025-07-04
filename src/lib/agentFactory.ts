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
  console.log(
    `[agentFactory] Creating agent for ${playerId}, type: ${agentConfig.agentType}, provider: ${agentConfig.providerValue}, model: ${agentConfig.modelName}`
  );

  if (process.env.USE_MOCK_AI === 'true') {
    console.log(`[agentFactory] Using MockAIAgent due to USE_MOCK_AI=true`);
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
        console.log(
          `[agentFactory] Found user API key for ${agentConfig.providerValue}`
        );
      }
    } catch (error) {
      console.warn(
        `[agentFactory] Failed to get user API key for ${agentConfig.providerValue}:`,
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
      if (apiKey) {
        console.log(
          `[agentFactory] Using environment API key for ${agentConfig.providerValue} from ${providerDef.apiKeyEnvVar}`
        );
      } else {
        console.warn(
          `[agentFactory] No API key found for ${agentConfig.providerValue} - expected in ${providerDef.apiKeyEnvVar}`
        );
      }
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
      if (apiKey) {
        console.log(
          `[agentFactory] Using environment API key for OpenAI from OPENAI_API_KEY`
        );
      } else {
        console.warn(`[agentFactory] No API key found for OpenAI`);
      }
    }
  }

  console.log(
    `[agentFactory] Final config - apiBase: ${apiBase}, hasApiKey: ${!!apiKey}`
  );

  switch (agentConfig.agentType) {
    case 'OpenAI':
    case 'Groq':
    case 'Fireworks':
      console.log(
        `[agentFactory] Creating OpenAIAgent for ${agentConfig.agentType}`
      );
      return new OpenAIAgent(playerId, agentConfig.modelName, apiBase, apiKey);

    case 'Ollama':
      console.log(`[agentFactory] Creating OllamaAgent`);
      return new OllamaAgent(playerId, agentConfig.modelName, apiBase, apiKey);

    case 'Claude':
      if (!agentConfig.modelName)
        throw new Error('ClaudeAgent requires modelName');

      // For Claude, try to get user API key if available
      if (userId) {
        const userClaudeKey = await getDecryptedApiKey(userId, 'anthropic');
        if (userClaudeKey) {
          console.log(`[agentFactory] Using user API key for Claude`);
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
      console.log(`[agentFactory] Creating ClaudeAgent with environment key`);
      return new ClaudeAgent(playerId, agentConfig.modelName);

    case 'Gemini':
      if (!agentConfig.modelName)
        throw new Error('GeminiAgent requires modelName');

      // For Gemini, try to get user API key if available
      if (userId) {
        const userGeminiKey = await getDecryptedApiKey(userId, 'gemini');
        if (userGeminiKey) {
          console.log(`[agentFactory] Using user API key for Gemini`);
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
      console.log(`[agentFactory] Creating GeminiAgent with environment key`);
      return new GeminiAgent(playerId, agentConfig.modelName);

    case 'Human':
      console.log(`[agentFactory] Creating HumanAgent`);
      return new HumanAgent(playerId);

    default:
      console.log(
        `[agentFactory] Unknown agent type ${agentConfig.agentType}, using DummyAIAgent`
      );
      return new DummyAIAgent(playerId);
  }
}

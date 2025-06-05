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

import { openAIProviders } from './models';

// Remove internal DummyAgent definition

// Import PlayerAction if needed by DummyAgent
// import type { PlayerAction } from './engine/interfaces/IAgent'; // Likely not needed here anymore

/**
 * Creates an agent instance based on the provided configuration.
 * @param agentConfig Configuration object specifying the agent type and settings.
 * @param playerId The ID to assign to the created agent.
 * @returns An instance of the specified agent conforming to IAgent.
 */
export function createAgentInstance(agentConfig: AgentConfig, playerId: PlayerId): IAgent {
    if (process.env.USE_MOCK_AI === 'true') {
        return new MockAIAgent(playerId);
    }
    let apiBase: string | undefined = undefined;
    let apiKey: string | undefined = undefined;

    const providerDef = openAIProviders.find(p => p.value === agentConfig.providerValue);
    if (providerDef) {
        apiBase = providerDef.endpoint;
        apiKey = providerDef.apiKeyEnvVar ? process.env[providerDef.apiKeyEnvVar] : undefined;
        if (providerDef.value === 'ollama_local' && (!apiKey || apiKey === 'OLLAMA_API_KEY')) {
            apiKey = undefined;
        }
    } else if (agentConfig.agentType === 'OpenAI') {
        apiBase = process.env.OPENAI_API_BASE;
        apiKey = process.env.OPENAI_API_KEY;
    }

    switch (agentConfig.agentType) {
        case 'OpenAI':
        case 'Groq':
        case 'Ollama':
        case 'Fireworks':
            return new OpenAIAgent(playerId, agentConfig.modelName, apiBase, apiKey);
        
        case 'Claude':
            if (!agentConfig.modelName) throw new Error('ClaudeAgent requires modelName');
            return new ClaudeAgent(playerId, agentConfig.modelName);
            
        case 'Gemini':
            if (!agentConfig.modelName) throw new Error('GeminiAgent requires modelName');
            return new GeminiAgent(playerId, agentConfig.modelName);

        case 'Human':
            return new HumanAgent(playerId);

        default:
            return new DummyAIAgent(playerId);
    }
} 
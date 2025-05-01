import type { AgentConfig } from './interfaces/persistence.types';
import type { PlayerId } from './engine/interfaces/IPlayer';
import type { IAgent } from './engine/interfaces/IAgent';

// Import known agent classes
import { OpenAIAgent } from './engine/agents/OpenAIAgent';
import { HumanAgent } from './engine/agents/HumanAgent';
// Import the actual DummyAIAgent
import { DummyAIAgent } from './engine/agents/DummyAIAgent';
// import { ClaudeAgent } from './engine/agents/ClaudeAgent'; // Placeholder
// import { GeminiAgent } from './engine/agents/GeminiAgent'; // Placeholder

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
    let apiBase: string | undefined = undefined;
    let apiKey: string | undefined = undefined;

    // Find provider definition based on providerValue
    const providerDef = openAIProviders.find(p => p.value === agentConfig.providerValue);
    if (providerDef) {
        apiBase = providerDef.endpoint;
        apiKey = providerDef.apiKeyEnvVar ? process.env[providerDef.apiKeyEnvVar] : undefined;
        // Special case for Ollama local: API key is often optional
        if (providerDef.value === 'ollama_local' && (!apiKey || apiKey === 'OLLAMA_API_KEY')) {
            apiKey = undefined;
        }
    } else if (agentConfig.agentType === 'OpenAI') {
        // Fallback to OpenAI defaults if providerValue missing but type is OpenAI
        console.warn(`Provider value missing for OpenAI type agent ${playerId}. Using default OpenAI endpoint.`);
        apiBase = process.env.OPENAI_API_BASE;
        apiKey = process.env.OPENAI_API_KEY;
    }

    switch (agentConfig.agentType) {
        case 'OpenAI':
        case 'Groq': // Treat Groq/Ollama/etc. compatible as OpenAIAgent for now
        case 'Ollama':
        case 'Fireworks':
            console.log(`Creating OpenAIAgent for ${playerId} (Type: ${agentConfig.agentType}, Model: ${agentConfig.modelName}, Provider: ${agentConfig.providerValue})`);
            return new OpenAIAgent(playerId, agentConfig.modelName, apiBase, apiKey);
        
        // case 'Claude':
        //     console.log(`Creating ClaudeAgent for ${playerId} (Model: ${agentConfig.modelName})`);
        //     if (!agentConfig.modelName) throw new Error('ClaudeAgent requires modelName');
        //     return new ClaudeAgent(playerId, agentConfig.modelName);
            
        // case 'Gemini':
        //     console.log(`Creating GeminiAgent for ${playerId} (Model: ${agentConfig.modelName})`);
        //     if (!agentConfig.modelName) throw new Error('GeminiAgent requires modelName');
        //     return new GeminiAgent(playerId, agentConfig.modelName);

        case 'Human':
            console.log(`Creating HumanAgent for ${playerId}`);
            return new HumanAgent(playerId);

        default:
            console.log(`Creating DummyAIAgent for ${playerId} (Type: ${agentConfig.agentType})`); // Log correct name
            // Use a default DummyAIAgent or log a warning for unknown types
            if (agentConfig.agentType !== 'Dummy') {
                console.warn(`Unknown agentType "${agentConfig.agentType}" requested for ${playerId}. Falling back to DummyAIAgent.`);
            }
            return new DummyAIAgent(playerId); // Use imported DummyAIAgent
    }
} 
import type { AgentConfig } from './interfaces/persistence.types';
import type { PlayerId } from './engine/interfaces/IPlayer';
import type { IAgent } from './engine/interfaces/IAgent';

// Import known agent classes
import { OpenAIAgent } from './engine/agents/OpenAIAgent';
import { HumanAgent } from './engine/agents/HumanAgent';
// import { ClaudeAgent } from './engine/agents/ClaudeAgent'; // Placeholder
// import { GeminiAgent } from './engine/agents/GeminiAgent'; // Placeholder
// import { DummyAgent } from './engine/agents/DummyAgent'; // Placeholder

// Placeholder for DummyAgent if not defined elsewhere
class DummyAgent implements IAgent {
    constructor(public readonly id: PlayerId) {}
    agentName = 'DummyAgent';
    persona = undefined;
    async getAction(): Promise<PlayerAction> {
        return { type: 'noAction' };
    }
}
// Import PlayerAction if needed by DummyAgent
import type { PlayerAction } from './engine/interfaces/IAgent';

/**
 * Creates an agent instance based on the provided configuration.
 * @param agentConfig Configuration object specifying the agent type and settings.
 * @param playerId The ID to assign to the created agent.
 * @returns An instance of the specified agent conforming to IAgent.
 */
export function createAgentInstance(agentConfig: AgentConfig, playerId: PlayerId): IAgent {
    switch (agentConfig.agentType) {
        case 'OpenAI':
        case 'Groq': // Treat Groq/Ollama/etc. compatible as OpenAIAgent for now
        case 'Ollama':
        case 'Fireworks':
            // TODO: Need a way to reconstruct apiBase and apiKey from providerValue/modelName?
            // For now, use defaults or environment variables as OpenAIAgent constructor does.
            // The constructor handles undefined apiKey.
            console.log(`Creating OpenAIAgent for ${playerId} (Type: ${agentConfig.agentType}, Model: ${agentConfig.modelName})`);
            return new OpenAIAgent(playerId, agentConfig.modelName);
        
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

        case 'Dummy':
        default:
            console.log(`Creating DummyAgent for ${playerId} (Type: ${agentConfig.agentType})`);
            // Use a default DummyAgent or log a warning for unknown types
            if (agentConfig.agentType !== 'Dummy') {
                console.warn(`Unknown agentType "${agentConfig.agentType}" requested for ${playerId}. Falling back to DummyAgent.`);
            }
            return new DummyAgent(playerId);
    }
} 
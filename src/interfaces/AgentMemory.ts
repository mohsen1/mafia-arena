import type { PlayerId } from "./IPlayer";
import type { IMessage } from "./IMessage";
import type { AIModelConfig, AIProviderConfig } from './AIConfig';
import type { PlayerAction } from './IAgent';
import type { GamePhaseType } from './IGamePhase';

/**
 * Represents the memory stored for a specific agent.
 */
export interface AgentMemory {
    // Agent-specific knowledge
    investigationResults: Array<{ round: number; targetId: PlayerId; allegiance: 'Mafia' | 'Town' }>;
    // Potentially add other role-specific results here (e.g., Doctor save confirmation?)

    // Game events relevant to all (but stored per agent)
    voteHistory: Array<{ round: number; votes: ReadonlyMap<PlayerId, PlayerId | null> }>;
    killHistory: Array<{ round: number; killedPlayerId: PlayerId | null }>;

    // Full conversation history visible to this agent
    messageHistory: ReadonlyArray<IMessage>;

    // Add the log field
    aiConversationLogs: AIConversationLog[];
}

/**
 * Represents a single logged interaction between an agent and its AI backend.
 */
export interface AIConversationLog {
    round: number;
    phase: GamePhaseType;
    timestamp: Date;
    model: string; // Model used for this interaction
    prompt: { // Store structured prompt messages
        system?: string;
        user: string;
    };
    response: {
        raw: string | null; // Raw content from the API
        parsedAction: PlayerAction | null; // Action parsed from the response
        error?: string; // Any error during API call or parsing
    };
}

/**
 * Creates an initial empty memory object for an agent.
 */
export function createInitialMemory(): AgentMemory {
    return {
        investigationResults: [],
        voteHistory: [],
        killHistory: [],
        messageHistory: [],
        aiConversationLogs: [], // Initialize with empty array
    };
} 
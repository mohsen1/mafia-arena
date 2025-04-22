import type { PlayerId } from "./IPlayer";
import type { IMessage } from "./IMessage";

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
    };
} 
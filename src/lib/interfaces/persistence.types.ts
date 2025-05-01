import type { GamePhaseType } from '@/lib/engine/interfaces/IGamePhase';
import type { RoleName, Allegiance } from '@/lib/engine/interfaces/IRole';
import type { PlayerId, PlayerStatus } from '@/lib/engine/interfaces/IPlayer';
import type { IMessage } from '@/lib/engine/interfaces/IMessage'; // Reusable engine type
import type { AgentMemory } from '@/lib/engine/interfaces/AgentMemory'; // Reusable? Ensure serializability
import type { LanguageName } from '@/lib/i18n/settings';
import type { Persona } from '@/lib/engine/interfaces/Persona'; // Reusable engine type
import type { MessageVisibility } from '@/lib/engine/interfaces/IMessage'; // Import MessageVisibility

// Import other necessary application-specific types
import type { PendingHumanAction } from './actions.types'; // Assuming definition moved

// Configuration needed to re-instantiate an agent
export interface AgentConfig {
    /* e.g., 'OpenAI', 'Human', 'Claude', 'Groq', 'Ollama', 'Dummy' */
    agentType: string; 
    modelName?: string;
    /* Identifier like 'openai', 'groq', 'ollama_local' */
    providerValue?: string;
}

// Serializable data for a single player
export interface SerializablePlayer {
    id: PlayerId;
    name: string;
    status: PlayerStatus;
    roleName: RoleName;
    allegiance: Allegiance;
    agentConfig: AgentConfig;
    persona: Persona; // Store the generated/assigned persona
    isHuman: boolean;
}

// Define a type for serialized messages with string timestamps
export interface SerializedMessage {
    id: string;
    round: number;
    phase: GamePhaseType;
    senderId: PlayerId | null;
    senderName: string;
    content: string;
    visibility: MessageVisibility; // Assuming MessageVisibility is serializable
    recipientId?: PlayerId;
    timestamp: string; // Use string for serialized state
}

// The main state object to be saved/loaded
export interface SerializableGameState {
    gameId: string;
    createdAt: number; // Store as ISO string or timestamp number
    updatedAt: number; // Store as ISO string or timestamp number
    themeKey: string;
    language: LanguageName;
    round: number;
    phase: GamePhaseType;
    players: Record<PlayerId, SerializablePlayer>;
    livingPlayerIds: PlayerId[];
    deadPlayerIds: PlayerId[];
    conversationLog: SerializedMessage[]; // Use the new SerializedMessage type here
    agentMemories: Record<PlayerId, AgentMemory>; // Reuses engine type (check map/set serialization)
    winCondition: { outcome: string; message: string } | null; // Simplified structure
    humanPlayerId: PlayerId | null;
    pendingHumanAction: PendingHumanAction | null;
    _phaseResults?: { // Optional results from the last completed phase step
        killedPlayerId?: PlayerId | null;
        savedPlayerId?: PlayerId | null;
        seerInvestigation?: { targetId: PlayerId; allegiance: Allegiance } | null;
        lastDayElimination?: PlayerId | null;
    };
    /** Current step within the active phase */
    phaseStep: string;
    /** Index of the next player to act within the current phase step */
    nextPlayerIndexToAction: number;
}
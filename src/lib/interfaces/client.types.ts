import type { GamePhaseType } from '@/lib/engine/interfaces/IGamePhase';
import type { RoleName, Allegiance } from '@/lib/engine/interfaces/IRole';
import type { PlayerId, PublicPlayerInfo } from '@/lib/engine/interfaces/IPlayer';
import type { IMessage } from '@/lib/engine/interfaces/IMessage';
import type { LanguageName } from '@/lib/i18n/settings';
import type { PendingHumanAction } from './actions.types';
import type { Persona } from '@/lib/engine/interfaces/Persona';

/**
 * Represents a message as seen by the client.
 * Re-exporting IMessage for client-side use, potentially add client-specific fields later.
 */
export type ClientMessage = IMessage;

/**
 * Represents a player's data as seen by the client.
 * Based on PublicPlayerInfo but might add UI-specific flags or role info based on context.
 */
export interface FilteredPlayer extends PublicPlayerInfo {
    // Add any client-specific player fields here if needed
    // Example: isHuman?: boolean;
    role?: RoleName; // Role might be revealed under certain conditions (e.g., game over)
    allegiance?: Allegiance; // Allegiance might be revealed
    persona?: Persona; // Include persona
    imageUrl?: string | null; // Add optional image URL
    voiceId?: string; // Add optional voice ID
    isHuman?: boolean; // Add optional isHuman flag
}

/**
 * Represents the game state data sent to the client.
 * This is derived from SerializableGameState but filtered for the specific client.
 */
export interface FilteredGameState {
    gameId: string;
    createdAt: number; // Add createdAt timestamp
    updatedAt: number; // Timestamp of the last update
    themeKey: string;
    themeTitle?: string; // Add optional theme title
    themeDescription?: string; // Add optional theme description
    language: LanguageName;
    round: number;
    phase: GamePhaseType;
    players: Record<PlayerId, FilteredPlayer>; // Use FilteredPlayer
    livingPlayerIds: PlayerId[];
    deadPlayerIds: PlayerId[];
    conversationLog: ClientMessage[]; // Use ClientMessage
    winCondition: { outcome: string; message: string } | null;
    humanPlayerId: PlayerId | null;
    pendingHumanAction: PendingHumanAction | null;
    // Phase results might be sent to the client for UI updates
    lastPhaseResults?: {
        killedPlayerId?: PlayerId | null;
        savedPlayerId?: PlayerId | null;
        seerInvestigation?: { targetId: PlayerId; allegiance: Allegiance } | null; // Only if human player is Seer?
        lastDayElimination?: PlayerId | null;
    };
    // Client specific state
    selfPlayer?: FilteredPlayer; // Detailed info about the human player themselves
    isSpectator?: boolean;
} 
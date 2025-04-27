import type { PlayerId } from "./IPlayer";
import type { GamePhaseType } from "./IGamePhase";

export enum MessageVisibility {
    Public = 'Public',      // Day chat, visible to all alive players
    Mafia = 'Mafia',        // Night chat, visible only to alive Mafia
    Private = 'Private',    // Visible only to specific roles or the system log
    // System = 'System'    // Game announcements (e.g., "Player X was killed")
}

export interface IMessage {
    readonly id: string; // Unique message ID
    readonly round: number;
    readonly phase: GamePhaseType; // e.g., 'Day', 'Night'
    readonly senderId: PlayerId | null; // null for system messages
    readonly senderName: string; // Denormalized for convenience
    readonly content: string;
    readonly timestamp: Date;
    readonly visibility: MessageVisibility;
    readonly recipientId?: PlayerId; // For potential private messages (future)
}

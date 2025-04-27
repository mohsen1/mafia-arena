import type { PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';

/**
 * Represents an action that requires input from a human player.
 */
export interface PendingHumanAction {
    playerId: PlayerId;
    allowedActions: PlayerAction['type'][];
    prompt: string; // A description of what action is needed
} 
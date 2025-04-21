import type { PlayerId } from './IPlayer';
import type { VisibleGameState } from './GameState';
import type { Message } from '../core/Message';

export type PlayerAction =
    | { type: 'message'; content: string }
    | { type: 'vote'; targetPlayerId: PlayerId | null } // null for abstain/no vote
    | { type: 'mafiaKill'; targetPlayerId: PlayerId }
    | { type: 'noAction' }; // For roles with no night action

export interface IAgent {
    playerId: PlayerId;
    /**
     * Called by the Game to get the agent's action for the current phase.
     * @param gameState A snapshot of the game state visible to this player.
     * @returns A promise resolving to the player's action.
     */
    getAction(gameState: VisibleGameState): Promise<PlayerAction>;

    /**
     * Optional: Informs the agent about a message directed at them or globally.
     * Not strictly needed if all info comes via getAction's gameState,
     * but can be useful for more interactive agents.
     */
    // receiveMessage?(message: Message): void;
}

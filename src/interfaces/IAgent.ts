import type { PlayerId } from './IPlayer';
import type { VisibleGameState } from './GameState';
import type { Message } from '../core/Message';

export type PlayerAction =
    | { type: 'message'; content: string }
    | { type: 'vote'; targetPlayerId: PlayerId | null } // null for abstain/no vote
    | { type: 'mafiaKill'; targetPlayerId: PlayerId }
    | { type: 'doctorSave'; targetPlayerId: PlayerId | null } // null for no save
    | { type: 'seerInvestigate'; targetPlayerId: PlayerId | null } // null for no investigation
    | { type: 'noAction' }; // For roles with no night action

export interface IAgent {
    playerId: PlayerId;
    /**
     * Called by the Game to get the agent's action for the current phase.
     * @param gameState A snapshot of the game state visible to this player.
     * @param allowedActions An array of actions that the player is allowed to take.
     * @returns A promise resolving to the player's action.
     */
    getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction>;

    /**
     * Optional: Informs the agent about a message directed at them or globally.
     * Not strictly needed if all info comes via getAction's gameState,
     * but can be useful for more interactive agents.
     */
    // receiveMessage?(message: Message): void;
}

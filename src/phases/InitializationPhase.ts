import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { DayPhase } from './DayPhase'; // Import next phase
import  { MessageVisibility } from '../interfaces/IMessage';

export class InitializationPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'Init';

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, "Game is starting...", MessageVisibility.Public, this.type);
        for (const player of game.getPlayers().values()) {
            // Maybe send a private "welcome" message to each player with their role?
             game.logMessage(null, `Welcome ${player.name}! You are a ${player.role.name}. Allegiance: ${player.role.allegiance}.`, MessageVisibility.Public, this.type); // For demo, make public
             // In real game: Send via a private channel or only show in agent's initial state
        };
        // No actions needed in init phase itself
        await Promise.resolve(); // Represents completion if setup were async
    }

    transition(game: Game): AbstractGamePhase {
        // After initialization, always go to the first Day phase
        return new DayPhase();
    }
}

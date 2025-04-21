import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';
import { MessageVisibility } from '../interfaces/IMessage';
import type { VisibleGameState } from '../interfaces/GameState';

export class GameOverPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'GameOver';

    constructor(private winner: 'Mafia' | 'Town') {
        super();
    }

    async runPhase(game: Game): Promise<void> {
        game.logMessage(null, `Game Over! The ${this.winner} has won.`, MessageVisibility.Public);

        // Get the final state visible to all (reveal roles etc)
        const finalState = this.createPublicFinalState(game);

        // Render the final game state
        game.notifyRenderers('renderGameOver', this.winner, finalState);
    }

    transition(game: Game): AbstractGamePhase {
        // No transition from GameOver, but we need to implement the abstract method
        return this; // Remain in GameOver phase
    }

    private createPublicFinalState(game: Game): VisibleGameState {
        // For the final state, we can show more information
        // such as all roles even for dead players
        
        // Get all players with roles
        const players = Array.from(game.getPlayers().values()).map(player => {
            return {
                id: player.id,
                name: player.name,
                status: player.status,
                role: player.role.name,
                allegiance: player.role.allegiance
            };
        });

        return {
            gameId: game.id,
            round: game.round,
            phase: this.type,
            self: {
                id: "system",
                name: "System",
                status: "Alive", 
                role: "System",
                isMafia: false,
            },
            players: game.getPublicPlayerArray(),
            alivePlayerIds: new Set(), // Empty since game is over
            winningTeam: this.winner,
            playerDetails: players
        } as unknown as VisibleGameState; // Type assertion since we're extending the interface
    }
}

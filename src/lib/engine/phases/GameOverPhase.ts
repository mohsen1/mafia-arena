import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';

export class GameOverPhase extends AbstractGamePhase {
    readonly type: GamePhaseType = 'GameOver';
    private winner: 'Mafia' | 'Town' | undefined;

    constructor(winner?: 'Mafia' | 'Town') {
        super();
        this.winner = winner;
    }

    async runStep(game: Game): Promise<void> {
        if (this.winner && game.checkWinCondition() !== this.winner) {
            console.log(`[GameOverPhase] Setting game win condition to: ${this.winner}`);
            game.setWinCondition(this.winner);
            const winMessage = this.winner === 'Mafia' ? 
                "The Mafia have eliminated all opposition!" :
                "The Town has successfully lynched all Mafia members!";
            game.logEvent(`Game Over: ${winMessage}`);
        } else {
            console.log('[GameOverPhase] Win condition already set or no winner defined for phase.');
        }
        
        console.log("[GameOverPhase] Game step executed.");
        
        game.setPhaseStep('End');
        
        return Promise.resolve();
    }

    transition(game: Game): GamePhaseType {
        return 'GameOver';
    }
}

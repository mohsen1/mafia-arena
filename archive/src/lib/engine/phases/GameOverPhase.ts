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
      game.setWinCondition(this.winner);
      const winMessage =
        this.winner === 'Mafia'
          ? 'The Mafia have eliminated all opposition!'
          : 'The Town has successfully lynched all Mafia members!';
      game.logEvent(`Game Over: ${winMessage}`);
    }

    game.setPhaseStep('End');

    return Promise.resolve();
  }

  transition(): GamePhaseType {
    return 'GameOver';
  }
}

import { AbstractGamePhase } from './AbstractGamePhase';
import type { Game } from '../core/Game';
import type { GamePhaseType } from '../interfaces/IGamePhase';

export class CharacterGenerationPhase extends AbstractGamePhase {
  readonly type: GamePhaseType = 'CharacterGeneration';

  async runStep(game: Game): Promise<void> {
    game.setPhaseStep('WaitingForCharacterGeneration');

    // Log that character generation is needed
    game.logEvent('Character generation in progress...');

    return Promise.resolve();
  }

  transition(game: Game): GamePhaseType {
    // This phase will be manually transitioned by the character generation action
    // For now, stay in CharacterGeneration until explicitly moved
    const phaseStep = game.getPhaseStep();

    if (phaseStep === 'Complete') {
      return 'Init';
    }

    return 'CharacterGeneration';
  }
}

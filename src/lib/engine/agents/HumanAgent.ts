import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { DEFAULT_PERSONA } from '../interfaces/Persona';
import type { Persona } from '../interfaces/Persona';

export class HumanAgent implements IAgent {
  readonly id: PlayerId;
  readonly agentName = 'Human';
  persona: Persona;

  constructor(id: PlayerId, persona?: Persona) {
    this.id = id;
    this.persona = persona || {
      ...DEFAULT_PERSONA,
      name: 'Human Player',
    };
  }

  async getAction(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _gameState: VisibleGameState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _allowedActions?: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    // Human actions are now handled by the Game loop calling a renderer's promptHumanInput method.
    // This method should not be called directly for a HumanAgent.
    console.error(
      `[${this.id}] HumanAgent.getAction was called directly. This indicates an error in the game loop logic.`
    );

    return { type: 'noAction' };
  }
}

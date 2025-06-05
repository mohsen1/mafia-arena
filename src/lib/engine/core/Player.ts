import {
  PlayerStatus,
  type IPlayer,
  type PlayerId,
  type PublicPlayerInfo,
} from '../interfaces/IPlayer';
import type { IRole } from '../interfaces/IRole';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { AgentConfig } from '../../interfaces/persistence.types';
import type { Persona } from '../interfaces/Persona';

export class Player implements IPlayer {
  readonly id: PlayerId;
  #name: string;
  #status: PlayerStatus = PlayerStatus.Alive;
  readonly #role: IRole;
  readonly #agent: IAgent;
  readonly #initialAgentConfig: AgentConfig;
  imageUrl?: string | null;
  private persona: Persona | null;
  readonly isHuman: boolean;

  constructor(
    id: PlayerId,
    initialName: string,
    role: IRole,
    agent: IAgent,
    initialAgentConfig: AgentConfig,
    imageUrl?: string | null,
    status: PlayerStatus = PlayerStatus.Alive,
    isHuman: boolean = false,
    persona: Persona | null = null
  ) {
    this.id = id;
    this.#name = initialName;
    this.#role = role;
    this.#agent = agent;
    this.#initialAgentConfig = initialAgentConfig;
    this.imageUrl = imageUrl;
    this.#status = status;
    this.isHuman = isHuman;
    this.persona = persona;
  }

  get name(): string {
    return this.#name;
  }

  setName(newName: string): void {
    if (typeof newName === 'string' && newName.trim().length > 0) {
      this.#name = newName.trim();
    } else {
      console.warn(
        `Attempted to set invalid name for player ${this.id}: ${newName}`
      );
    }
  }

  get status(): PlayerStatus {
    return this.#status;
  }

  get role(): IRole {
    return this.#role;
  }

  get agent(): IAgent {
    return this.#agent;
  }

  get initialAgentConfig(): AgentConfig {
    return this.#initialAgentConfig;
  }

  isAlive(): boolean {
    return this.#status === PlayerStatus.Alive;
  }

  kill(): void {
    this.#status = PlayerStatus.Dead;
  }

  getPublicRepresentation(): PublicPlayerInfo {
    return {
      id: this.id,
      name: this.#name,
      status: this.status,
      imageUrl: this.imageUrl,
      isHuman: this.isHuman,
    };
  }

  async decideAction(
    gameState: VisibleGameState,
    allowedActions?: PlayerAction['type'][]
  ): Promise<PlayerAction> {
    if (!this.isAlive()) {
      console.warn(`Attempted to get action from dead player ${this.id}`);
      return { type: 'noAction' };
    }
    try {
      if (typeof this.#agent.getAction === 'function') {
        return await this.#agent.getAction(gameState, allowedActions);
      }
      console.warn(
        `Agent for player ${this.id} does not have a getAction method. Defaulting to noAction.`
      );
      return { type: 'noAction' };
    } catch (error) {
      console.error(
        `Error getting action from agent ${this.id} (${this.#name}):`,
        error
      );
      return { type: 'noAction' };
    }
  }

  public setPersona(persona: Persona): void {
    this.persona = persona;
    this.agent.persona = persona;
    if (persona.name) {
      this.setName(persona.name);
    }
  }

  getPersona(): Persona | null {
    return this.persona;
  }
}

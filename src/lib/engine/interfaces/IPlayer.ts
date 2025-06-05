import type { IRole } from './IRole';
import type { IAgent } from './IAgent';

export type PlayerId = string;
export enum PlayerStatus {
  Alive = 'Alive',
  Dead = 'Dead',
}

export interface IPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly status: PlayerStatus;
  readonly role: IRole; // Role is known internally, but maybe not publicly
  readonly agent: IAgent;

  isAlive(): boolean;
  getPublicRepresentation(): PublicPlayerInfo; // Info safe to share publicly
}

/**
 * Information about a player that is safe to be publicly known.
 */
export interface PublicPlayerInfo {
  readonly id: PlayerId;
  readonly name: string;
  status: PlayerStatus; // Status can change, so not readonly from game perspective
  // Role and allegiance are typically not public during the game.
  // isHuman might be public depending on game settings.
  readonly isHuman: boolean; // Or a game setting controlled value
  readonly imageUrl?: string | null; // Added imageUrl as optional
}

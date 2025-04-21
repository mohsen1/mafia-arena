import type { IRole } from './IRole';
import type { IAgent } from './IAgent';

export type PlayerId = string;
export enum PlayerStatus { Alive = 'Alive', Dead = 'Dead' }

export interface IPlayer {
    readonly id: PlayerId;
    readonly name: string;
    readonly status: PlayerStatus;
    readonly role: IRole; // Role is known internally, but maybe not publicly
    readonly agent: IAgent;

    isAlive(): boolean;
    getPublicRepresentation(): PublicPlayerInfo; // Info safe to share publicly
}

// Info safe to share publicly
export interface PublicPlayerInfo {
    readonly id: PlayerId;
    readonly name: string;
    readonly status: PlayerStatus;
    // Role is intentionally omitted here
}

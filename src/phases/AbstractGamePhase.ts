import type { IGamePhase, GamePhaseType } from '../interfaces/IGamePhase';
import type { Game } from '../core/Game';

export abstract class AbstractGamePhase implements IGamePhase {
    abstract readonly type: GamePhaseType;
    abstract runPhase(game: Game): Promise<void>;
    abstract transition(game: Game): IGamePhase;
}

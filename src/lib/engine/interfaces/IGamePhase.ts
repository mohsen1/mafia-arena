import type { Game } from '../core/Game'; // Forward declaration/type import

export type GamePhaseType = 'Init' | 'Day' | 'Night' | 'GameOver';

export interface IGamePhase {
    readonly type: GamePhaseType;
    /**
     * Execute the logic for this phase (e.g., collect votes, process actions).
     * @param game The main game instance.
     */
    runPhase(game: Game): Promise<void>;

    /**
     * Determine and transition to the next game phase.
     * @param game The main game instance.
     * @returns The next game phase instance.
     */
    transition(game: Game): IGamePhase;
}

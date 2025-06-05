import type { Game } from '../core/Game';

/**
 * Represents a distinct phase of the game (e.g., Day, Night).
 */

// Define the possible game phase types
export type GamePhaseType =
  | 'CharacterGeneration' // Character generation phase
  | 'Init' // Initial setup phase
  | 'Briefing' // Presenting roles and initial info
  | 'FirstNight' // Special first night (e.g., Mafia meet)
  | 'Day' // Discussion and voting
  | 'Night' // Night actions (kill, save, investigate)
  | 'GameOver'; // Game conclusion

export interface IGamePhase {
  readonly type: GamePhaseType;

  /**
   * Executes the logic for a single step within this phase.
   * @param game The current game instance.
   * @returns A promise that resolves when the step's logic is complete.
   */
  runStep(game: Game): Promise<void>;

  /**
   * Determines the next phase based on the current game state.
   * @param game The current game instance.
   * @returns The type of the next game phase.
   */
  transition(game: Game): GamePhaseType;
}

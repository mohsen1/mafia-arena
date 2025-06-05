import type { PlayerId } from './IPlayer';
import type { Persona } from './Theme';
import type { VisibleGameState } from './GameState';
import type { PendingHumanAction } from '../../interfaces/actions.types';

export type PlayerAction =
  | { type: 'message'; content: string }
  | { type: 'vote'; targetPlayerId: PlayerId | null } // null for abstain/no vote
  | { type: 'mafiaKill'; targetPlayerId: PlayerId }
  | { type: 'doctorSave'; targetPlayerId: PlayerId | null } // null for no save
  | { type: 'seerInvestigate'; targetPlayerId: PlayerId | null } // null for no investigation
  | { type: 'noAction' } // For roles with no night action
  | { type: 'humanActionRequired'; pendingAction: PendingHumanAction }; // Signal for human input

/**
 * Interface for all game agents (AI or Human).
 */
export interface IAgent {
  readonly id: PlayerId;
  readonly agentName: string; // Name of the agent type (e.g., "GeminiAgent", "HumanAgent")
  /**
   * Called by the Game to get the agent's action for the current phase.
   * @param gameState A snapshot of the game state visible to this player.
   * @param allowedActions An array of actions that the player is allowed to take.
   * @returns A promise resolving to the player's action.
   */
  getAction(
    gameState: VisibleGameState,
    allowedActions?: PlayerAction['type'][]
  ): Promise<PlayerAction>;

  /**
   * Optional: Informs the agent about a message directed at them or globally.
   * Not strictly needed if all info comes via getAction's gameState,
   * but can be useful for more interactive agents.
   */
  // receiveMessage?(message: Message): void;

  /**
   * Optional method for LLM-based agents to generate their own persona
   * based on the game theme. It should store the generated persona internally.
   * @param themeDescription A one-liner describing the game's theme.
   * @param language Optional language code for the persona generation (defaults to English if not provided).
   * @returns A promise that resolves when the persona is generated (or fallback used).
   */
  generatePersona?(themeDescription: string, language?: string): Promise<void>;

  /**
   * The persona associated with this agent, potentially generated.
   * Should be defined after initialization or persona generation.
   */
  persona: Persona | undefined;
}

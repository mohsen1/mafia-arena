import type { PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import type { AgentConfig } from "./agent.types";
import type { FilteredGameState } from "./gameState.types";
import type { LanguageCode } from "@/lib/i18n/settings";
import type { RoleName } from "../engine/interfaces/IRole"; // Assuming RoleName path

/**
 * Represents an action that requires input from a human player.
 */
export interface PendingHumanAction {
    playerId: PlayerId;
    allowedActions: PlayerAction['type'][];
    prompt: string; // A description of what action is needed
}

/**
 * Data required to initialize and start a new game.
 */
export interface StartGameSetupData {
  themeKey: string;
  language: LanguageCode;

  players: Array<{
    name: string;
    rolePreference: RoleName;
    isHuman: boolean;
    imageUrl: string | null;
    agentConfig: AgentConfig; // Specific config for this player (Human or AI variant)
  }>;

  // DEPRECATED Fields - replaced by `players` array
  // playerCount: number;
  // humanPlayerName?: string;
  // humanPlayerIndex: number; // -1 if no human player
  // humanRolePreference?: RoleName; // Optional role preference for the human
  // townAgentConfig: AgentConfig; // Configuration for Town AI agents
  // mafiaAgentConfig: AgentConfig; // Configuration for Mafia AI agents
  // Optional: Add specific role distribution settings if needed
  // roleSettings?: Partial<Record<RoleName, number>>;
}

/**
 * Result returned after successfully starting a game.
 */
export interface StartGameResult {
  gameId: string;
  initialState: FilteredGameState;
  error?: undefined; // Explicitly undefined on success
}

/**
 * Result returned on failure to start a game.
 */
export interface StartGameErrorResult {
  error: string;
  gameId?: undefined;
  initialState?: undefined;
}

/**
 * Payload for actions submitted by a human player.
 */
export interface HumanActionPayload {
  /** The type of action being performed. */
  type: "message" | "vote" | "mafiaKill" | "doctorSave" | "seerInvestigate";
  /** Content of the message, if type is 'message'. */
  content?: string;
  /** Target player ID, if type is 'vote' or a night action targeting a player. Allow null for skip/abstain. */
  targetPlayerId?: string | null;
  // Add other potential payload fields as needed
}

// We can add types for other actions (advanceGameState, deleteGame) if needed,
// though their inputs/outputs might be simple enough (gameId, boolean/error, FilteredGameState/error)
// not to require dedicated types beyond what's in gameState.types.ts. 
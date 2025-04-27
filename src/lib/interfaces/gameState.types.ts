import type { LanguageCode } from "@/lib/i18n/settings";
import type { RoleName, Allegiance } from "../engine/interfaces/IRole";
import type { PlayerStatus } from "../engine/interfaces/IPlayer";

/** Unique identifier for a player. */
export type PlayerId = string;

/** Represents the type of phase the game is currently in. */
export type GamePhaseType = "Initialization" | "Night" | "Day" | "Voting" | "GameOver";

/** Represents possible actions a human player might need to take. */
export type HumanActionType = "message" | "vote" | "mafiaKill" | "doctorSave" | "seerInvestigate";

/** Information about a pending action required from the human player. */
export interface PendingHumanAction {
  playerId: PlayerId;
  /** The specific type(s) of action(s) allowed. */
  allowedActions: HumanActionType[];
  /** Optional message/prompt related to the action (e.g., "Vote for who to eliminate."). */
  prompt?: string;
  /** Optional list of valid target player IDs, if applicable (e.g., for voting, night actions). */
  validTargets?: PlayerId[];
  /** Optional timeout timestamp (ISO string or number) */
  timeout?: string | number;
}

/** Base interface for player information included in the game state. */
export interface BasePlayerState {
  id: PlayerId;
  name: string;
  status: PlayerStatus;
}

/** Player state information filtered for the client (public view). */
export interface FilteredPlayer extends BasePlayerState {
  // Add any other publicly visible player properties here
  // Example: isOnline?: boolean;
  /** Optional: Player's role (might only be included for the player themselves). */
  role?: RoleName;
  /** Optional: URL for the player's avatar image. */
  imageUrl?: string | null;
}

/** Player state information including potentially sensitive details. */
export interface SerializablePlayer extends BasePlayerState {
  role: RoleName;
  allegiance: Allegiance;
  isHuman: boolean;
  // Persona might be included here or handled separately depending on filtering
  // persona?: any; // Use actual Persona type
  // agentConfig?: AgentConfig; // Include if needed server-side
}

/** Structure for messages exchanged during the game. */
export interface ClientMessage {
  senderId: PlayerId;
  /** The name of the sender (denormalized for easy display). */
  senderName: string;
  content: string;
  /** ISO timestamp string */
  timestamp: string;
  /** Optional: Indicates if the message is only visible to certain players (e.g., Mafia). */
  visibility?: "all" | "mafia" | RoleName;
  /** Optional: Type of message (e.g., chat, system announcement, action result) */
  type?: "chat" | "system" | "action";
}

/** Base interface for the overall game state. */
interface BaseGameState {
  id: string;
  phase: GamePhaseType;
  round: number;
  /** Optional: Title of the game instance. */
  title?: string;
  /** Optional: Generated description for the game. */
  description?: string;
  /** ISO timestamp string for creation time. */
  createdAt: string;
  /** ISO timestamp string for last update. */
  lastUpdatedAt: string;
  /** Optional: Winner information if the game is over. */
  winner?: Allegiance | null;
  /** Language code for the game. */
  language: LanguageCode;
  /** Theme identifier (e.g., 'classic', 'sci-fi'). */
  themeKey: string;
}

/**
 * The complete game state intended for serialization (saving/loading).
 * Contains all information needed to resume the game.
 */
export interface SerializableGameState extends BaseGameState {
  players: SerializablePlayer[];
  /** History of messages/events. */
  log: ClientMessage[];
  /** Information about the pending human action, if any. */
  pendingHumanAction: PendingHumanAction | null;
  /** ID of the human player, if one exists. */
  humanPlayerId: PlayerId | null;
  // Add any other internal state needed for saving/loading
  // Example: internalVoteCounts?: Record<PlayerId, PlayerId>;
}

/**
 * The game state filtered for sending to a client.
 * Excludes sensitive information like hidden roles, full personas, internal agent state.
 */
export interface FilteredGameState extends BaseGameState {
  players: FilteredPlayer[];
  /** Filtered message log (e.g., removing Mafia-only messages for non-Mafia players). */
  log: ClientMessage[]; // Filtering might happen dynamically based on recipient
  /** Information about the pending human action, if any. */
  pendingHumanAction: PendingHumanAction | null;
  /** ID of the human player, if one exists and the client needs to know. */
  humanPlayerId?: PlayerId | null; // Optional depending on client needs
  // Add any other state needed by the client UI
  // Example: selfPlayerInfo?: FilteredPlayer & { role: RoleName }; // Info about the client's own player
} 
import type { LanguageName } from '@/lib/i18n/settings';
import type { RoleName, Allegiance } from '../engine/interfaces/IRole';
import type { PlayerStatus } from '../engine/interfaces/IPlayer';
import type { GamePhaseType as EngineGamePhaseType } from '../engine/interfaces/IGamePhase';
export type GamePhaseType = EngineGamePhaseType;
import type { MessageVisibility } from '../engine/interfaces/IMessage';
import type { PlayerAction } from '../engine/interfaces/IAgent';
import type { SerializableGameState as PersistenceSerializableGameState } from './persistence.types';
import type { AgentMemory } from '@/lib/engine/interfaces/AgentMemory';

/** Unique identifier for a player. */
export type PlayerId = string;

/** Information about a pending action required from the human player. */
export interface PendingHumanAction {
  playerId: PlayerId;
  allowedActions: PlayerAction['type'][];
  prompt?: string;
  validTargets?: PlayerId[];
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
  /** Optional: Player's role (might only be included for the player themselves). */
  role?: RoleName;
  /** Optional: URL for the player's avatar image. */
  imageUrl?: string | null;
  voiceId?: string;
  /** Optional: Indicates if this player is Mafia (visible to fellow Mafia members). */
  isMafia?: boolean;
}

/** Player state information including potentially sensitive details. */
export interface SerializablePlayer extends BasePlayerState {
  role: RoleName;
  allegiance: Allegiance;
  isHuman: boolean;
}

/** Structure for messages exchanged during the game (Client view). */
export interface ClientMessage {
  id: string;
  round: number;
  phase: GamePhaseType;
  senderId: PlayerId | null;
  senderName: string;
  content: string;
  timestamp: string;
  visibility?: MessageVisibility | 'mafia';
  type?: 'chat' | 'system' | 'action';
  recipientId?: PlayerId;
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
  winner?: string | null;
  /** Language code for the game. */
  language: LanguageName;
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
}

/**
 * The game state filtered for sending to a client.
 * Excludes sensitive information like hidden roles, full personas, internal agent state.
 */
export interface FilteredGameState extends BaseGameState {
  players: Record<PlayerId, FilteredPlayer>;
  log: ClientMessage[];
  pendingHumanAction: PendingHumanAction | null;
  humanPlayerId?: PlayerId | null;
  livingPlayerIds?: PlayerId[];
  deadPlayerIds?: PlayerId[];
  canSeeWerewolfChat?: boolean;
  canSeeDeadChat?: boolean;
  availableVoices?: string[];
  _rawStateForDebug?: PersistenceSerializableGameState;
  winCondition?: string | null;
  /** Agent memories including AI conversation logs - only included when game is over */
  agentMemories?: Record<PlayerId, AgentMemory>;
}

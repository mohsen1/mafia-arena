import type { GamePhaseType, PendingHumanAction } from './gameState.types';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import type { RoleName, Allegiance } from '@/lib/engine/interfaces/IRole';
import type { IMessage } from '@/lib/engine/interfaces/IMessage';
import type { LanguageName } from '@/lib/i18n/settings';
import type { PlayerStatus } from '@/lib/engine/interfaces/IPlayer';

/**
 * Represents a message as seen by the client.
 * Re-exporting IMessage for client-side use, potentially add client-specific fields later.
 */
export type ClientMessage = IMessage;

/**
 * Represents a player's data as seen by the client.
 * Based on PublicPlayerInfo but might add UI-specific flags or role info based on context.
 */
export interface FilteredPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly status: PlayerStatus; // This should be PlayerStatus from IPlayer
  readonly isHuman: boolean; // Aligning with PublicPlayerInfo
  readonly imageUrl?: string | null;
  readonly roleName?: RoleName; // Only for self or if revealed
  readonly isMafia?: boolean; // Only for self or if revealed to fellow mafia
  readonly hasNightAction?: boolean; // UI hint, e.g., for displaying action buttons
  // Add other UI-specific or selectively revealed fields here
}

/**
 * Represents the game state data sent to the client.
 * This is derived from SerializableGameState but filtered for the specific client.
 */
export interface FilteredGameState {
  gameId: string;
  createdAt: number; // Add createdAt timestamp
  updatedAt: number; // Timestamp of the last update
  themeKey: string;
  themeTitle?: string; // Add optional theme title
  themeDescription?: string; // Add optional theme description
  language: LanguageName;
  round: number;
  phase: GamePhaseType;
  players: Record<PlayerId, FilteredPlayer>; // Use FilteredPlayer
  livingPlayerIds: PlayerId[];
  deadPlayerIds: PlayerId[];
  conversationLog: ClientMessage[]; // Use ClientMessage
  winCondition: { outcome: string; message: string } | null;
  humanPlayerId: PlayerId | null;
  pendingHumanAction: PendingHumanAction | null;
  // Phase results might be sent to the client for UI updates
  lastPhaseResults?: {
    killedPlayerId?: PlayerId | null;
    savedPlayerId?: PlayerId | null;
    seerInvestigation?: { targetId: PlayerId; allegiance: Allegiance } | null; // Only if human player is Seer?
    lastDayElimination?: PlayerId | null;
  };
  // Client specific state
  selfPlayer?: FilteredPlayer; // Detailed info about the human player themselves
  isSpectator?: boolean;
}

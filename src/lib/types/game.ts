import { type ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// Use string literal unions instead of enums
export type Role = 'Villager' | 'Werewolf' | 'Seer' | 'Doctor';

// Moderator is not a role, but a concept for messages/speakers
export type SpeakerType = 'player' | 'moderator';

export type GamePhase =
  | 'Night'
  | 'DayIntroductions' // Players introduce themselves
  | 'DayDiscussion' // Main discussion phase
  | 'Voting'
  | 'GameOver';

export type PlayerStatus = 'alive' | 'dead';

export interface Player {
  readonly id: string; // e.g., uuid
  readonly name: string;
  readonly role: Role;
  readonly persona: string; // Detailed description for AI
  readonly imageUrl?: string; // Optional URL for the character image
  status: PlayerStatus;
}

// Discriminated union for message audience clarity
export type MessageAudience =
  | { type: 'all' }
  | { type: 'werewolves' }
  | { type: 'player'; playerId: string }; // For Seer results, private messages?

export interface ChatMessage {
  readonly messageId: string; // e.g., uuid
  readonly gameId: string;
  readonly speaker: { type: 'player'; playerId: string } | { type: 'moderator' };
  readonly speakerName: string; // Denormalized name for display
  readonly content: string;
  readonly timestamp: number; // Unix timestamp (ms or s)
  readonly round: number;
  readonly phase: GamePhase;
  readonly audience: MessageAudience;
  readonly turnNumber?: number; // Optional: Track speaking order within a round
  readonly isThinking?: boolean; // Re-add optional flag for loading state
}

// More specific night action types
export type NightAction =
  | { type: 'werewolf_kill'; actingPlayerId: string; targetPlayerId: string }
  | { type: 'doctor_save'; actingPlayerId: string; targetPlayerId: string }
  | { type: 'seer_investigation'; actingPlayerId: string; targetPlayerId: string; result: 'Werewolf' | 'Villager' }; // Use string literals for result

export interface Vote {
 voterPlayerId: string;
 targetPlayerId: string;
}

export interface GameSettings {
 readonly numPlayers: number; // Maybe derive from roles?
 readonly roleDistribution: Readonly<Record<Role, number>>;
 readonly discussionRoundsPerPlayer: number;
 readonly aiModel: string; // e.g., 'gpt-4o'
}

export interface GameState {
  readonly gameId: string;
  readonly createdAt: number; // Unix timestamp (ms or s)
  title?: string; // Optional generated title
  description?: string; // Optional generated description
  readonly settings: GameSettings;
  players: Readonly<Record<string, Player>>; // Map Player ID to Player object
  livingPlayerIds: string[]; // Maintain order for turns
  phase: GamePhase;
  round: number;
  turnOrderIndex: number; // Index into livingPlayerIds for current turn
  conversationLog: ReadonlyArray<ChatMessage>;
  nightActions: ReadonlyArray<NightAction>;
  votes: ReadonlyArray<Vote>; // Votes cast in the current voting phase
  lastEliminatedPlayerId?: string;
  winner?: 'Villager' | 'Werewolf'; // Use string literals for winner team
  // Internal state not sent to client
  _internalState?: {
    werewolfChatLog?: ReadonlyArray<ChatMessage>;
    seerResults?: Record<string, 'Werewolf' | 'Villager'>; // seerId -> targetId -> result (string literals)
  }
}

// Subset of GameState safe to send to the client
export type FilteredGameState = Omit<GameState, '_internalState' | 'players' | 'conversationLog'> & {
  conversationLog: ReadonlyArray<Omit<ChatMessage, 'audience'> & { speakerName: string }>;
  players: Readonly<Record<string, Omit<Player, 'role' | 'persona'>>>; // Also hide persona from client
};


// Example Character Preset Structure
export interface CharacterPreset {
  readonly name: string;
  readonly persona: string;
}

// Type for AI Interaction function
export type GetAIResponseFunction = (
  messages: ChatCompletionMessageParam[],
  gameId: string,
  playerId: string,
  settings: { model: string; temperature?: number; max_tokens?: number }
) => Promise<string>; 
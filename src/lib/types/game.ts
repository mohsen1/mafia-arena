import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
// Import language type
import type { SupportedLanguage } from "@/hooks/useGameConfig";

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
  readonly aiModel: string; // The AI model used for this player
  readonly imageUrl?: string; // Optional URL for the character image
  readonly voiceId?: string; // Optional ElevenLabs voice ID
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
}

export interface AICharacterProfile {
  readonly characterName: string;
  readonly gender: 'male' | 'female';
  readonly ageCategory: 'young' | 'old';
  readonly shortBio: string; // Simplified bio replacing multiple fields
}

export interface PlayerInitializationData {
    readonly role: Role;
    readonly profile: AICharacterProfile;
    readonly aiModel: string; // Model for this player
    readonly imageUrl?: string | null; // Added imageUrl
    readonly voiceId?: string; // Added voiceId
}

// Define Win Condition Type
export type WinConditionOutcome = 'Villager Win' | 'Werewolf Win' | 'Tie';
export type WinCondition = {
    outcome: WinConditionOutcome;
    message: string; // e.g., "The Villagers have eliminated all Werewolves!"
};

// Define Player Perspective Type
// Information specific to the player receiving the FilteredGameState
export interface PlayerPerspective {
    role: Role; // Player's own role
    // Add other private info here, e.g., seer results for the seer
    seerResults?: Record<string, 'Werewolf' | 'Villager'>; // targetId -> result for *this* seer
}

export interface GameState {
  readonly gameId: string;
  readonly createdAt: number; // Unix timestamp (ms or s)
  readonly updatedAt: number;
  title?: string; // Optional generated title
  description?: string; // Optional generated description
  readonly settings: GameSettings;
  players: Readonly<Record<string, Player>>; // Map Player ID to Player object
  livingPlayerIds: string[]; // Maintain order for turns
  deadPlayerIds: string[]; // List of IDs
  turnOrder: string[]; // Order for phases like DayIntroductions
  turnOrderIndex: number; // Current position in turnOrder
  phase: GamePhase;
  round: number;
  conversationLog: ChatMessage[]; // Use mutable array
  votes: Vote[]; // Use mutable array
  lastEliminatedPlayerId: string | null; // Track who was last eliminated (day or night)
  nightActions: NightAction[]; // Use mutable array
  lastWerewolfTargetId: string | null; // Tracks the target even if saved
  lastDoctorSaveId: string | null; // Track successful save
  lastSeerTargetId: string | null; // Track seer's target
  winCondition: WinCondition | null;
  language: SupportedLanguage; // <-- Add language field
  // Internal state not sent to client
  _internalState?: {
    werewolfChatLog?: ChatMessage[]; // Use mutable array
    seerResults?: Record<string, 'Werewolf' | 'Villager'>; // seerId -> targetId -> result (string literals)
    initialProfiles?: PlayerInitializationData[]; // Add storage for initial profiles
  }
}

// Subset of GameState safe to send to the client
export type FilteredGameState = Omit<GameState, '_internalState' | 'players' | 'conversationLog'> & {
  conversationLog: ReadonlyArray<Omit<ChatMessage, 'audience'> & { speakerName: string }>;
  players: Readonly<Record<string, Omit<Player, 'persona' | 'role'> & { role?: Role, voiceId?: string }>>;
  playerPerspective?: PlayerPerspective; // <-- Use defined type
  title?: string; // Add optional title
  description?: string; // Add optional description
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
  settings: { model: string; temperature?: number }
) => Promise<string>;

// Add 'export'
export interface ConfigCharacterSlot {
    clientId: string;
    aiModel: string;
    roleSelection: Role; // Or Role | 'Auto' if you revert
    assignedRole?: Role;
    profile?: AICharacterProfile;
    persona?: string; // Add field to store the generated persona
    imageUrl?: string | null;
    isGenerated: boolean;
    generationError?: string;
}

// Add 'export'
export interface ValidationResult {
    isValid: boolean;
    message?: string;
} 
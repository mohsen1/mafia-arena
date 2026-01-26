/**
 * Type definitions for game-related data structures.
 * Shared between game routes and components.
 */

import type { ParsedPersona } from '../lib/game-types';

// =============================================================================
// GAME SUMMARY TYPES
// =============================================================================

/**
 * Game summary as returned from the API.
 * Used in games list and live games views.
 */
export interface GameSummary {
  id: string;
  batch_id: string | null;
  winner: 'mafia' | 'town' | null;
  rounds: number;
  duration_ms: number;
  total_tokens: number;
  cost_usd?: number | null;
  persona_theme: 'noir' | 'victorian' | 'modern' | 'fantasy' | null;
  status: 'running' | 'completed' | 'failed';
  created_at: number;
  /** Hash encoding the game configuration for model matchups */
  config_hash?: string;
  /** Number of mafia players in the game */
  mafia_count?: number;
  /** Participants if available (for completed games) */
  participants?: GameParticipant[];
}

/**
 * Game participant information.
 */
export interface GameParticipant {
  model_id: string;
  model_name: string;
  team: 'mafia' | 'town';
  player_count: number;
  won: boolean;
}

// =============================================================================
// TRANSCRIPT EVENT TYPES
// =============================================================================

/**
 * Discriminated union for all transcript event types.
 * Each event type has its own specific structure.
 */
export type TranscriptEvent =
  | AiCallEvent
  | EliminationEvent
  | GameEndEvent
  | GameStartEvent
  | PersonaGenerationEvent
  | PersonaGenerationStartEvent
  | PersonaGenerationProgressEvent
  | SummarizationEvent
  | PhaseStartEvent
  | PhaseEndEvent
  | IntroductionEvent
  | DiscussionEvent
  | VoteEvent
  | ThinkingEvent;

/**
 * Base event fields shared by all event types.
 */
interface BaseEvent {
  type: string;
  phase?: string;
  round?: number;
  timestamp?: number;
}

/**
 * AI call event - when a model is queried.
 */
export interface AiCallEvent extends BaseEvent {
  type: 'ai_call';
  playerId: string;
  playerName: string;
  modelId: string;
  team: 'mafia' | 'town';
  response: {
    raw?: string;
    parsed?: unknown;
    usage?: {
      total_tokens?: number;
      input?: number;
      output?: number;
    };
  };
}

/**
 * Player elimination event.
 */
export interface EliminationEvent extends BaseEvent {
  type: 'elimination';
  playerId: string;
  playerName?: string;
  team: 'mafia' | 'town';
}

/**
 * Game end event.
 */
export interface GameEndEvent extends BaseEvent {
  type: 'game_end';
  winner: 'mafia' | 'town';
}

/**
 * Game start event.
 */
export interface GameStartEvent extends BaseEvent {
  type: 'game_start';
  players?: Array<{
    id: string;
    name: string;
    modelId: string;
    team: 'mafia' | 'town';
  }>;
}

/**
 * Persona generation complete event.
 */
export interface PersonaGenerationEvent extends BaseEvent {
  type: 'persona_generation';
  playerId: string;
  playerName?: string;
  modelId: string;
  team: 'mafia' | 'town';
  persona: ParsedPersona;
}

/**
 * Persona generation start event.
 */
export interface PersonaGenerationStartEvent extends BaseEvent {
  type: 'persona_generation_start';
  playerCount?: number;
}

/**
 * Persona generation progress event.
 */
export interface PersonaGenerationProgressEvent extends BaseEvent {
  type: 'persona_generation_progress';
  completed?: number;
  total?: number;
}

/**
 * Summarization event - when older rounds are summarized to save tokens.
 */
export interface SummarizationEvent extends BaseEvent {
  type: 'summarization';
  roundRangeSummarized: [number, number];
  tokensSaved?: number;
}

/**
 * Phase start event.
 */
export interface PhaseStartEvent extends BaseEvent {
  type: 'phase_start';
  phase: string;
  round: number;
}

/**
 * Phase end event.
 */
export interface PhaseEndEvent extends BaseEvent {
  type: 'phase_end';
  phase: string;
  round: number;
}

/**
 * Introduction phase event.
 */
export interface IntroductionEvent extends BaseEvent {
  type: 'introduction';
  playerId: string;
  playerName: string;
  modelId: string;
  team: 'mafia' | 'town';
}

/**
 * Discussion phase event.
 */
export interface DiscussionEvent extends BaseEvent {
  type: 'discussion';
  playerId: string;
  playerName: string;
  modelId: string;
  team: 'mafia' | 'town';
}

/**
 * Vote event.
 */
export interface VoteEvent extends BaseEvent {
  type: 'vote';
  voterId: string;
  round: number;
}

/**
 * Thinking event - when a model is processing.
 */
export interface ThinkingEvent extends BaseEvent {
  type: 'thinking';
  playerId?: string;
  playerName?: string;
  round?: number;
}

/**
 * Transcript data structure.
 */
export interface TranscriptData {
  events: TranscriptEvent[];
  status?: 'completed' | 'failed';
  error?: string;
}

// =============================================================================
// MATCHUP TYPES
// =============================================================================

/**
 * Matchup display data for a game.
 * Extracted from game summary or config hash.
 */
export interface MatchupData {
  /** Formatted mafia model display name */
  mafia: string;
  /** Formatted town model display name */
  town: string;
  /** Whether mafia won the game */
  mafiaWon: boolean;
  /** Display name of the winning model */
  winnerModel: string;
}

// =============================================================================
// GAME DETAIL TYPES
// =============================================================================

/**
 * Complete game detail as returned from the API.
 */
export interface GameDetail {
  id: string;
  winner: string | null;
  rounds: number;
  durationMs: number;
  totalTokens: number;
  createdAt: number;
  personaTheme?: string;
  costUsd?: number;
  status?: string;
  errorMessage?: string | null;
  participants?: GameParticipant[];
}

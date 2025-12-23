/**
 * Core type definitions for the Mafia game engine.
 * This file contains all types used throughout the engine.
 */

// =============================================================================
// Teams and Phases
// =============================================================================

export type Team = 'mafia' | 'town';

export type Phase = 'introduction' | 'night' | 'day_discussion' | 'day_vote';

// =============================================================================
// Personas
// =============================================================================

export type PersonaConstraints = 'strict' | 'moderate' | 'free';

export interface Persona {
  readonly name: string;
  readonly background: string;
  readonly personality: string;
  readonly occupation?: string | undefined;
}

// =============================================================================
// Players
// =============================================================================

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly modelId: string;
  readonly team: Team;
  readonly isAlive: boolean;
  readonly persona?: Persona;
}

export interface DeadPlayer {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly eliminatedRound: number;
  readonly eliminatedPhase: Phase;
}

// =============================================================================
// Game Configuration
// =============================================================================

/**
 * Context level determines how much game history is passed to AI players.
 * - 'full': All history verbatim (High Cost, Maximum Strategy)
 * - 'windowed': Last N rounds verbatim, summary before that (Medium Cost)
 * - 'summary': Only current round + event log (Low Cost, Current Behavior)
 */
export type ContextLevel = 'full' | 'windowed' | 'summary';

export interface GameConfig {
  readonly playerCount: number;
  readonly mafiaCount: number;
  readonly teams: readonly TeamAssignment[];
  readonly maxRounds: number;
  readonly discussionEnabled: boolean;
  readonly personaConstraints?: PersonaConstraints | undefined;
  /** Number of discussion rounds for mafia during night (default: 2) */
  readonly nightDiscussionRounds?: number | undefined;
  /** Number of discussion rounds during day phase (default: 3) */
  readonly dayDiscussionRounds?: number | undefined;
  /** Seed for deterministic random number generation (for reproducibility) */
  readonly seed?: number | undefined;
  /**
   * How much game history context to provide to AI players.
   * - 'full': Complete verbatim history from Round 1 (leverages large context windows)
   * - 'windowed': Last 3 rounds verbatim + summary of earlier rounds
   * - 'summary': Current round only (default, original behavior)
   */
  readonly contextLevel?: ContextLevel | undefined;
  /** Number of rounds to include in windowed context (default: 3) */
  readonly contextWindowSize?: number | undefined;
  /** 
   * Persona theme for pre-assigned names and archetypes (default: 'noir') 
   * Ensures unique names and diverse personalities across players.
   */
  readonly personaTheme?: 'noir' | 'victorian' | 'modern' | 'fantasy' | undefined;
}

export interface TeamAssignment {
  readonly modelId: string;
  readonly team: Team;
  readonly count: number;
}

// =============================================================================
// Game Result
// =============================================================================

export interface GameResult {
  readonly id: string;
  readonly config: GameConfig;
  readonly winner: Team;
  readonly rounds: number;
  readonly events: readonly GameEvent[];
  readonly tokenUsage: TokenUsage;
  readonly durationMs: number;
  readonly participants: readonly ParticipantResult[];
  readonly personaAnalysis?: PersonaAnalysis | undefined;
}

export interface ParticipantResult {
  readonly modelId: string;
  readonly team: Team;
  readonly playerCount: number;
  readonly won: boolean;
  readonly tokensUsed: number;
  readonly consistencyScore?: number | undefined;
}

export interface PersonaAnalysis {
  readonly playerScores: readonly PlayerConsistencyScore[];
  readonly averageScore: number;
  readonly teamScores: {
    readonly mafia: number;
    readonly town: number;
  };
}

export interface PlayerConsistencyScore {
  readonly playerId: string;
  readonly playerName: string;
  readonly modelId: string;
  readonly team: Team;
  readonly persona: Persona;
  readonly score: number;
  readonly nameUsageCount: number;
  readonly personalityAlignmentScore: number;
  readonly inconsistencies: readonly string[];
}

export interface TokenUsage {
  readonly input: number;
  readonly output: number;
  readonly total: number;
}

// =============================================================================
// AI Provider Interface (Dependency Injection)
// =============================================================================

export interface AIProvider {
  getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse>;
}

export interface AIContext {
  readonly gameId: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly modelId: string;
  readonly team: Team;
  readonly phase: Phase;
  readonly round: number;
  readonly visibleState: VisibleGameState;
}

export interface ActionPrompt {
  readonly type: 'persona_generation' | 'introduction' | 'kill_vote' | 'discussion' | 'mafia_discussion' | 'elimination_vote';
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly validTargets?: readonly string[];
}

export interface AIResponse {
  readonly action: PlayerAction;
  readonly rawResponse: string;
  readonly reasoning?: string;
  readonly tokensUsed: { readonly input: number; readonly output: number };
  readonly latencyMs: number;
}

// =============================================================================
// Player Actions
// =============================================================================

export type PlayerAction =
  | PersonaGenerationAction
  | IntroductionAction
  | KillVoteAction
  | DiscussionAction
  | MafiaDiscussionAction
  | EliminationVoteAction;

export interface PersonaGenerationAction {
  readonly type: 'persona_generation';
  readonly persona: Persona;
}

export interface IntroductionAction {
  readonly type: 'introduction';
  readonly message: string;
}

export interface KillVoteAction {
  readonly type: 'kill_vote';
  readonly target: string;
}

export interface DiscussionAction {
  readonly type: 'discussion';
  readonly message: string;
}

export interface MafiaDiscussionAction {
  readonly type: 'mafia_discussion';
  readonly message: string;
}

export interface EliminationVoteAction {
  readonly type: 'elimination_vote';
  readonly target: string | null; // null = abstain
}

// =============================================================================
// Visible State (What AI can see)
// =============================================================================

/**
 * A record of a vote cast during the game.
 * Used to track voting patterns across rounds.
 */
export interface VoteRecord {
  readonly round: number;
  readonly phase: 'night' | 'day_vote';
  readonly voterName: string;
  readonly targetName: string | null; // null = abstain
  readonly voterTeam?: Team | undefined; // Only revealed after voter is eliminated
}

/**
 * A high-level game event for the game log.
 * Summarizes eliminations and major game events.
 */
export interface GameLogEntry {
  readonly round: number;
  readonly phase: Phase;
  readonly event: string;
  readonly playerName?: string;
  readonly playerTeam?: Team;
}

export interface VisibleGameState {
  readonly round: number;
  readonly phase: Phase;
  readonly alivePlayers: readonly VisiblePlayer[];
  readonly deadPlayers: readonly VisibleDeadPlayer[];
  /** Public conversation history visible to all players */
  readonly conversationHistory: readonly ConversationMessage[];
  /** Private mafia strategy discussion (only visible to mafia members) */
  readonly mafiaHistory?: readonly ConversationMessage[] | undefined;
  readonly teammates: readonly string[] | undefined; // Only for mafia
  /** Current discussion sub-round (1-indexed) */
  readonly currentDiscussionRound?: number | undefined;
  /** Total discussion rounds for this phase */
  readonly totalDiscussionRounds?: number | undefined;
  
  // === LARGE CONTEXT FIELDS (for leveraging 100k+ token context windows) ===
  
  /** Full history of ALL public conversations from Round 1 to now */
  readonly fullConversationHistory?: readonly ConversationMessage[] | undefined;
  /** Full history of ALL mafia conversations (only for mafia members) */
  readonly fullMafiaHistory?: readonly ConversationMessage[] | undefined;
  /** Complete history of all public votes revealed to this player */
  readonly voteHistory?: readonly VoteRecord[] | undefined;
  /** High-level summary of game events (eliminations, phase transitions) */
  readonly gameLog?: readonly GameLogEntry[] | undefined;
}

export interface VisiblePlayer {
  readonly id: string;
  readonly name: string;
  readonly persona?: Persona | undefined;
}

export interface VisibleDeadPlayer {
  readonly id: string;
  readonly name: string;
  readonly team: Team; // Revealed on death
  readonly persona?: Persona | undefined;
}

/** Channel for conversation messages - public for all, mafia for private strategy */
export type ConversationChannel = 'public' | 'mafia';

export interface ConversationMessage {
  readonly playerId: string;
  readonly playerName: string;
  readonly message: string;
  readonly round: number;
  /** The channel this message was sent on (default: 'public') */
  readonly channel?: ConversationChannel | undefined;
  /** Which discussion sub-round this message occurred in (1-indexed) */
  readonly discussionRound?: number | undefined;
}

// =============================================================================
// Game Events
// =============================================================================

export type GameEvent =
  | PhaseStartEvent
  | PhaseEndEvent
  | AICallEvent
  | PersonaGenerationEvent
  | IntroductionEvent
  | DiscussionEvent
  | VoteEvent
  | EliminationEvent
  | GameEndEvent
  | AIParseErrorEvent
  | SummarizationEvent;

export interface AIParseErrorEvent {
  readonly type: 'ai_parse_error';
  readonly phase: Phase;
  readonly round: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly modelId: string;
  readonly team: Team;
  readonly actionType: ActionPrompt['type'];
  readonly rawResponse: string;
  readonly error: string;
  readonly timestamp: number;
}

export interface PhaseStartEvent {
  readonly type: 'phase_start';
  readonly phase: Phase;
  readonly round: number;
  readonly timestamp: number;
}

export interface PhaseEndEvent {
  readonly type: 'phase_end';
  readonly phase: Phase;
  readonly round: number;
  readonly timestamp: number;
}

export interface PersonaGenerationEvent {
  readonly type: 'persona_generation';
  readonly round: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly persona: Persona;
  readonly timestamp: number;
}

export interface AICallEvent {
  readonly type: 'ai_call';
  readonly phase: Phase;
  readonly round: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly modelId: string;
  readonly team: Team;
  readonly actionType: 'persona_generation' | 'introduction' | 'kill_vote' | 'discussion' | 'mafia_discussion' | 'elimination_vote';
  readonly prompt: {
    readonly system: string;
    readonly user: string;
  };
  readonly response: {
    readonly raw: string;
    readonly parsed: PlayerAction;
  };
  readonly tokensUsed: {
    readonly input: number;
    readonly output: number;
  };
  readonly latencyMs: number;
  readonly timestamp: number;
}

export interface DiscussionEvent {
  readonly type: 'discussion';
  readonly round: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly message: string;
  readonly timestamp: number;
  /** The channel this message was sent on */
  readonly channel?: ConversationChannel | undefined;
  /** Which discussion sub-round this occurred in */
  readonly discussionRound?: number | undefined;
}

export interface IntroductionEvent {
  readonly type: 'introduction';
  readonly round: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly message: string;
  readonly timestamp: number;
}

export interface VoteEvent {
  readonly type: 'vote';
  readonly phase: 'night' | 'day_vote';
  readonly round: number;
  readonly voterId: string;
  readonly voterName: string;
  readonly targetId: string | null;
  readonly timestamp: number;
}

export interface EliminationEvent {
  readonly type: 'elimination';
  readonly phase: Phase;
  readonly round: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly team: Team;
  readonly timestamp: number;
}

export interface GameEndEvent {
  readonly type: 'game_end';
  readonly winner: Team;
  readonly round: number;
  readonly finalState: {
    readonly mafiaAlive: number;
    readonly townAlive: number;
  };
  readonly timestamp: number;
}

/**
 * Event emitted when conversation history is summarized to fit within model context limits.
 * This allows the frontend to indicate which rounds were summarized.
 */
export interface SummarizationEvent {
  readonly type: 'summarization';
  readonly round: number;
  /** The range of rounds that were summarized [start, end] */
  readonly roundRangeSummarized: readonly [number, number];
  /** The model that triggered the summarization */
  readonly modelId: string;
  /** Estimated tokens saved by summarization */
  readonly tokensSaved: number;
  /** Token count of the summary */
  readonly summaryTokens: number;
  /** Original token count before summarization */
  readonly originalTokens: number;
  readonly timestamp: number;
}

// =============================================================================
// Serialization (for DO state persistence)
// =============================================================================

/**
 * Serialized form of GameState for persistence to Durable Object storage.
 * Used to survive DO evictions during long-running games (discount pricing mode).
 */
export interface SerializedGameState {
  readonly players: readonly Player[];
  readonly phase: Phase;
  readonly round: number;
  readonly events: readonly GameEvent[];
  readonly conversationHistory: readonly ConversationMessage[];
  readonly gameId: string;
  readonly config: GameConfig;
  readonly seed: number;
}


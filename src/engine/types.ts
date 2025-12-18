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

export interface GameConfig {
  readonly playerCount: number;
  readonly mafiaCount: number;
  readonly teams: readonly TeamAssignment[];
  readonly maxRounds: number;
  readonly discussionEnabled: boolean;
  readonly personaEnabled?: boolean | undefined;
  readonly personaConstraints?: PersonaConstraints | undefined;
  /** Number of discussion rounds for mafia during night (default: 2) */
  readonly nightDiscussionRounds?: number | undefined;
  /** Number of discussion rounds during day phase (default: 3) */
  readonly dayDiscussionRounds?: number | undefined;
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
  | GameEndEvent;

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


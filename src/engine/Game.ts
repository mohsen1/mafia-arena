/**
 * Main Game orchestrator.
 * Coordinates phases and runs the game to completion.
 */

import { GameState } from './GameState.js';
import { executeIntroductionPhase } from './phases/IntroductionPhase.js';
import { executeNightPhase } from './phases/NightPhase.js';
import { executeDiscussionPhase } from './phases/DiscussionPhase.js';
import { executeVotePhase } from './phases/VotePhase.js';
import { checkWinCondition } from './utils/winCondition.js';
import { analyzePersonaConsistency, getModelConsistencyScore } from './utils/consistency.js';
import type {
  GameConfig,
  GameResult,
  AIProvider,
  GameEndEvent,
  ParticipantResult,
  TokenUsage,
  Team,
  PersonaAnalysis,
  GameEvent,
  SerializedGameState,
} from './types.js';

/** Callback invoked when a game event occurs (for live streaming) */
export type GameEventCallback = (event: GameEvent) => void | Promise<void>;

/** Callback invoked after each phase completes (for checkpointing) */
export type PhaseCheckpointCallback = (state: SerializedGameState) => void | Promise<void>;

export interface GameOptions {
  readonly gameId?: string;
  /** Optional callback invoked for each game event (enables live streaming) */
  readonly onEvent?: GameEventCallback;
  /** Optional callback invoked after each phase completes (for DO state persistence) */
  readonly onPhaseComplete?: PhaseCheckpointCallback;
  /** Optional serialized state to resume from (for DO eviction recovery) */
  readonly resumeFrom?: SerializedGameState;
}

/**
 * The main Game class that orchestrates a complete Mafia game.
 * 
 * This is a pure TypeScript implementation with no external dependencies.
 * The AI provider is injected, making the engine fully testable.
 * 
 * Supports resumption from saved state for DO eviction recovery.
 */
export class Game {
  private readonly config: GameConfig;
  private readonly aiProvider: AIProvider;
  private readonly gameId: string;
  private readonly onEvent: GameEventCallback | undefined;
  private readonly onPhaseComplete: PhaseCheckpointCallback | undefined;
  private state: GameState;
  private startTime: number = 0;
  /** Whether this game is resuming from a saved state */
  private readonly isResuming: boolean;

  constructor(
    config: GameConfig,
    aiProvider: AIProvider,
    options: GameOptions = {}
  ) {
    this.config = config;
    this.aiProvider = aiProvider;
    this.gameId = options.gameId ?? generateGameId();
    this.onEvent = options.onEvent;
    this.onPhaseComplete = options.onPhaseComplete;
    
    // Resume from saved state if provided
    if (options.resumeFrom) {
      this.state = GameState.deserialize(options.resumeFrom);
      this.isResuming = true;
    } else {
      this.state = GameState.create(this.gameId, config);
      this.isResuming = false;
    }
  }

  /**
   * Add an event to state and emit to live listeners.
   */
  private async emitEvent(event: GameEvent): Promise<void> {
    this.state = this.state.withEvent(event);
    if (this.onEvent) {
      await this.onEvent(event);
    }
  }

  /**
   * Run the game to completion.
   * Returns the final game result with all events and statistics.
   * 
   * Game loop order: Day Discussion → Day Vote → Night (kills)
   * This ensures Town always gets a chance to discuss before anyone dies,
   * creating a proper social deduction benchmark.
   * 
   * Supports resumption from saved state - skips already-completed phases.
   */
  async run(): Promise<GameResult> {
    this.startTime = Date.now();

    // Emit game_start event with full player roster (for immediate frontend display)
    // Skip if resuming - players are already known from the saved state
    if (!this.isResuming) {
      await this.emitEvent({
        type: 'game_start',
        gameId: this.gameId,
        players: this.state.players,
        config: this.config,
        timestamp: this.startTime,
      });
    }

    // Introduction Phase - Players introduce themselves (runs once)
    // Skip if resuming and introduction already completed
    if (!this.isResuming || !this.hasCompletedIntroduction()) {
      const introResult = await executeIntroductionPhase(this.state, this.aiProvider);
      await this.updateStateAndEmitEvents(introResult.state);
      await this.checkpoint();
    }

    // Main game loop: Day → Night order
    // This ensures discussion happens BEFORE any kills
    while (this.state.round <= this.config.maxRounds) {
      // Determine starting phase for this round (for resumption)
      const startPhase = this.determineResumePhase();
      
      // Day Discussion Phase (if enabled)
      // Town discusses and analyzes behavior before voting
      if (this.config.discussionEnabled && startPhase !== 'day_vote' && startPhase !== 'night') {
        const discussionResult = await executeDiscussionPhase(
          this.state,
          this.aiProvider,
          this.onEvent // Pass callback for real-time streaming
        );
        // Only sync state (events already emitted by phase)
        this.state = discussionResult.state;
        await this.checkpoint();
      }

      // Day Vote Phase - Town votes to eliminate a suspect
      if (startPhase !== 'night') {
        const voteResult = await executeVotePhase(this.state, this.aiProvider, this.onEvent);
        // Only sync state (events already emitted by phase)
        this.state = voteResult.state;
        await this.checkpoint();

        // Check win condition after vote
        const winnerAfterVote = checkWinCondition(this.state);
        if (winnerAfterVote) {
          return await this.createResult(winnerAfterVote);
        }
      }

      // Night Phase - Mafia kills a town member
      const nightResult = await executeNightPhase(this.state, this.aiProvider, this.onEvent);
      // Only sync state (events already emitted by phase)
      this.state = nightResult.state;
      await this.checkpoint();

      // Check win condition after night
      const winnerAfterNight = checkWinCondition(this.state);
      if (winnerAfterNight) {
        return await this.createResult(winnerAfterNight);
      }

      // Advance to next round
      this.state = this.state.withNextRound();
      await this.checkpoint();
    }

    // Max rounds reached - determine winner by surviving counts
    const winner = this.determineWinnerByCount();
    return await this.createResult(winner);
  }

  /**
   * Check if introduction phase has already been completed.
   * Used for resumption logic.
   */
  private hasCompletedIntroduction(): boolean {
    // Introduction is complete if ALL players have persona_generation events
    const personaEventPlayerIds = new Set(
      this.state.events
        .filter(e => e.type === 'persona_generation')
        .map(e => e.playerId)
    );
    return personaEventPlayerIds.size === this.state.players.length;
  }

  /**
   * Determine which phase to resume from based on current state.
   * Returns the phase to START from (phases before this are skipped).
   */
  private determineResumePhase(): 'day_discussion' | 'day_vote' | 'night' {
    if (!this.isResuming) {
      return 'day_discussion';
    }
    
    // Check events for this round to see what's completed
    const roundEvents = this.state.events.filter(e => 'round' in e && e.round === this.state.round);
    
    // Check which phases have started (for detecting partial phases)
    const hasVotePhase = roundEvents.some(e => e.type === 'phase_start' && e.phase === 'day_vote');
    const hasDiscussionPhase = roundEvents.some(e => e.type === 'phase_start' && e.phase === 'day_discussion');
    
    // Check which phases have completed (for skipping)
    const nightCompleted = roundEvents.some(e => e.type === 'phase_end' && e.phase === 'night');
    const voteCompleted = roundEvents.some(e => e.type === 'phase_end' && e.phase === 'day_vote');
    const discussionCompleted = roundEvents.some(e => e.type === 'phase_end' && e.phase === 'day_discussion');
    
    if (nightCompleted) {
      // This round is done, let the loop advance
      return 'day_discussion';
    }
    if (voteCompleted) {
      return 'night';
    }
    if (discussionCompleted || hasVotePhase) {
      return 'day_vote';
    }
    if (hasDiscussionPhase) {
      // Discussion started but not completed - restart it
      return 'day_discussion';
    }
    
    return 'day_discussion';
  }

  /**
   * Save checkpoint after each phase for DO state persistence.
   */
  private async checkpoint(): Promise<void> {
    if (this.onPhaseComplete) {
      await this.onPhaseComplete(this.state.serialize());
    }
  }

  /**
   * Update state and emit any new events to live listeners.
   */
  private async updateStateAndEmitEvents(newState: GameState): Promise<void> {
    const previousEventCount = this.state.events.length;
    const newEvents = newState.events.slice(previousEventCount);
    
    this.state = newState;
    
    // Emit new events to live listeners
    if (this.onEvent) {
      for (const event of newEvents) {
        await this.onEvent(event);
      }
    }
  }

  /**
   * Get the current game state (for debugging/monitoring).
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Create the final game result.
   */
  private async createResult(winner: Team): Promise<GameResult> {
    const durationMs = Date.now() - this.startTime;

    // Add game end event
    const gameEndEvent: GameEndEvent = {
      type: 'game_end',
      winner,
      round: this.state.round,
      finalState: {
        mafiaAlive: this.state.aliveMafia.length,
        townAlive: this.state.aliveTown.length,
      },
      timestamp: Date.now(),
    };
    await this.emitEvent(gameEndEvent);

    // Calculate token usage
    const tokenUsage = this.calculateTokenUsage();

    // Analyze persona consistency (personas are always enabled)
    const personaAnalysis = analyzePersonaConsistency(this.state.players, this.state.events);

    // Create participant results
    const participants = this.createParticipantResults(winner, personaAnalysis);

    return {
      id: this.gameId,
      config: this.config,
      winner,
      rounds: this.state.round,
      events: this.state.events,
      tokenUsage,
      durationMs,
      participants,
      personaAnalysis: personaAnalysis ?? undefined,
    };
  }

  /**
   * Calculate total token usage from all AI calls.
   */
  private calculateTokenUsage(): TokenUsage {
    let input = 0;
    let output = 0;

    for (const event of this.state.events) {
      if (event.type === 'ai_call') {
        input += event.tokensUsed.input;
        output += event.tokensUsed.output;
      }
    }

    return { input, output, total: input + output };
  }

  /**
   * Create participant result summaries.
   * Tracks input/output tokens separately for accurate cost calculation.
   */
  private createParticipantResults(
    winner: Team,
    personaAnalysis: PersonaAnalysis | null | undefined
  ): ParticipantResult[] {
    // Use a separator that won't appear in model IDs (they contain ':' in free tier models)
    const SEPARATOR = '|||';
    
    // Group players by model and team, tracking input/output tokens separately
    const modelTeamMap = new Map<string, { 
      modelId: string; 
      team: Team; 
      count: number; 
      inputTokens: number;
      outputTokens: number;
    }>();

    for (const player of this.state.players) {
      const key = `${player.modelId}${SEPARATOR}${player.team}`;
      const existing = modelTeamMap.get(key);

      if (existing) {
        existing.count++;
      } else {
        modelTeamMap.set(key, { 
          modelId: player.modelId, 
          team: player.team, 
          count: 1, 
          inputTokens: 0,
          outputTokens: 0,
        });
      }
    }

    // Sum up tokens per model, keeping input/output separate
    for (const event of this.state.events) {
      if (event.type === 'ai_call') {
        const player = this.state.getPlayer(event.playerId);
        if (player) {
          const key = `${player.modelId}${SEPARATOR}${player.team}`;
          const entry = modelTeamMap.get(key);
          if (entry) {
            entry.inputTokens += event.tokensUsed.input;
            entry.outputTokens += event.tokensUsed.output;
          }
        }
      }
    }

    // Create results with structured token usage
    const results: ParticipantResult[] = [];
    for (const [, value] of modelTeamMap) {
      // Get consistency score for this model if available
      const consistencyScore = personaAnalysis
        ? getModelConsistencyScore(personaAnalysis, value.modelId) ?? undefined
        : undefined;

      results.push({
        modelId: value.modelId,
        team: value.team,
        playerCount: value.count,
        won: value.team === winner,
        tokensUsed: {
          input: value.inputTokens,
          output: value.outputTokens,
          total: value.inputTokens + value.outputTokens,
        },
        consistencyScore,
      });
    }

    return results;
  }

  /**
   * Determine winner when max rounds reached.
   * Mafia wins if they have equal or greater count.
   */
  private determineWinnerByCount(): Team {
    const mafiaCount = this.state.aliveMafia.length;
    const townCount = this.state.aliveTown.length;

    return mafiaCount >= townCount ? 'mafia' : 'town';
  }
}

/**
 * Generate a unique game ID.
 */
function generateGameId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `game_${timestamp}_${random}`;
}

/**
 * Validate game configuration.
 * 
 * For a proper social intelligence benchmark, we require:
 * - Minimum 7 players (2 mafia, 5 town) for meaningful deduction
 * - At least 2 mafia for coordination testing
 * - Town must outnumber mafia by at least 3 for multi-round games
 */
export function validateConfig(config: GameConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Minimum 7 players for a proper social deduction game
  // With fewer players, games end too quickly for meaningful benchmark data
  if (config.playerCount < 7) {
    errors.push('Player count must be at least 7 for a valid social intelligence benchmark');
  }

  // Need at least 2 mafia for coordination testing
  if (config.mafiaCount < 2) {
    errors.push('Mafia count must be at least 2 for coordination testing');
  }

  if (config.mafiaCount >= config.playerCount) {
    errors.push('Mafia count must be less than player count');
  }

  // Town should significantly outnumber mafia for multiple rounds
  const townCount = config.playerCount - config.mafiaCount;
  if (townCount < config.mafiaCount + 3) {
    errors.push(`Town (${townCount}) must outnumber mafia (${config.mafiaCount}) by at least 3 for multi-round games`);
  }

  // Validate team assignments match player count
  const totalAssigned = config.teams.reduce((sum, t) => sum + t.count, 0);
  if (totalAssigned !== config.playerCount) {
    errors.push(`Team assignments (${totalAssigned}) don't match player count (${config.playerCount})`);
  }

  // Validate mafia assignments match mafia count
  const mafiaAssigned = config.teams
    .filter((t) => t.team === 'mafia')
    .reduce((sum, t) => sum + t.count, 0);
  if (mafiaAssigned !== config.mafiaCount) {
    errors.push(`Mafia assignments (${mafiaAssigned}) don't match mafia count (${config.mafiaCount})`);
  }

  if (config.maxRounds < 1) {
    errors.push('Max rounds must be at least 1');
  }

  return { valid: errors.length === 0, errors };
}


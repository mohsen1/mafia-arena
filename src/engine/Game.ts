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
} from './types.js';

/** Callback invoked when a game event occurs (for live streaming) */
export type GameEventCallback = (event: GameEvent) => void | Promise<void>;

export interface GameOptions {
  readonly gameId?: string;
  /** Optional callback invoked for each game event (enables live streaming) */
  readonly onEvent?: GameEventCallback;
}

/**
 * The main Game class that orchestrates a complete Mafia game.
 * 
 * This is a pure TypeScript implementation with no external dependencies.
 * The AI provider is injected, making the engine fully testable.
 */
export class Game {
  private readonly config: GameConfig;
  private readonly aiProvider: AIProvider;
  private readonly gameId: string;
  private readonly onEvent: GameEventCallback | undefined;
  private state: GameState;
  private startTime: number = 0;

  constructor(
    config: GameConfig,
    aiProvider: AIProvider,
    options: GameOptions = {}
  ) {
    this.config = config;
    this.aiProvider = aiProvider;
    this.gameId = options.gameId ?? generateGameId();
    this.onEvent = options.onEvent;
    this.state = GameState.create(this.gameId, config);
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
   */
  async run(): Promise<GameResult> {
    this.startTime = Date.now();

    // Introduction Phase - Players introduce themselves (runs once)
    const introResult = await executeIntroductionPhase(this.state, this.aiProvider);
    await this.updateStateAndEmitEvents(introResult.state);

    // Main game loop: Day → Night order
    // This ensures discussion happens BEFORE any kills
    while (this.state.round <= this.config.maxRounds) {
      // Day Discussion Phase (if enabled)
      // Town discusses and analyzes behavior before voting
      if (this.config.discussionEnabled) {
        const discussionResult = await executeDiscussionPhase(
          this.state,
          this.aiProvider
        );
        await this.updateStateAndEmitEvents(discussionResult.state);
      }

      // Day Vote Phase - Town votes to eliminate a suspect
      const voteResult = await executeVotePhase(this.state, this.aiProvider);
      await this.updateStateAndEmitEvents(voteResult.state);

      // Check win condition after vote
      const winnerAfterVote = checkWinCondition(this.state);
      if (winnerAfterVote) {
        return await this.createResult(winnerAfterVote);
      }

      // Night Phase - Mafia kills a town member
      const nightResult = await executeNightPhase(this.state, this.aiProvider);
      await this.updateStateAndEmitEvents(nightResult.state);

      // Check win condition after night
      const winnerAfterNight = checkWinCondition(this.state);
      if (winnerAfterNight) {
        return await this.createResult(winnerAfterNight);
      }

      // Advance to next round
      this.state = this.state.withNextRound();
    }

    // Max rounds reached - determine winner by surviving counts
    const winner = this.determineWinnerByCount();
    return await this.createResult(winner);
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
   */
  private createParticipantResults(
    winner: Team,
    personaAnalysis: PersonaAnalysis | null | undefined
  ): ParticipantResult[] {
    // Group players by model and team
    const modelTeamMap = new Map<string, { team: Team; count: number; tokens: number }>();

    for (const player of this.state.players) {
      const key = `${player.modelId}:${player.team}`;
      const existing = modelTeamMap.get(key);

      if (existing) {
        existing.count++;
      } else {
        modelTeamMap.set(key, { team: player.team, count: 1, tokens: 0 });
      }
    }

    // Sum up tokens per model
    for (const event of this.state.events) {
      if (event.type === 'ai_call') {
        const player = this.state.getPlayer(event.playerId);
        if (player) {
          const key = `${player.modelId}:${player.team}`;
          const entry = modelTeamMap.get(key);
          if (entry) {
            entry.tokens += event.tokensUsed.input + event.tokensUsed.output;
          }
        }
      }
    }

    // Create results
    const results: ParticipantResult[] = [];
    for (const [key, value] of modelTeamMap) {
      const [modelId] = key.split(':') as [string, Team];
      
      // Get consistency score for this model if available
      const consistencyScore = personaAnalysis
        ? getModelConsistencyScore(personaAnalysis, modelId!) ?? undefined
        : undefined;

      results.push({
        modelId: modelId!,
        team: value.team,
        playerCount: value.count,
        won: value.team === winner,
        tokensUsed: value.tokens,
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


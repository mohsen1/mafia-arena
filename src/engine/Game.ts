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
} from './types.js';

export interface GameOptions {
  readonly gameId?: string;
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
    this.state = GameState.create(this.gameId, config);
  }

  /**
   * Run the game to completion.
   * Returns the final game result with all events and statistics.
   */
  async run(): Promise<GameResult> {
    this.startTime = Date.now();

    // Introduction Phase - Players introduce themselves (runs once)
    const introResult = await executeIntroductionPhase(this.state, this.aiProvider);
    this.state = introResult.state;

    // Main game loop
    while (this.state.round <= this.config.maxRounds) {
      // Night Phase - Mafia kills
      const nightResult = await executeNightPhase(this.state, this.aiProvider);
      this.state = nightResult.state;

      // Check win condition after night
      const winnerAfterNight = checkWinCondition(this.state);
      if (winnerAfterNight) {
        return this.createResult(winnerAfterNight);
      }

      // Day Discussion Phase (if enabled)
      if (this.config.discussionEnabled) {
        const discussionResult = await executeDiscussionPhase(
          this.state,
          this.aiProvider
        );
        this.state = discussionResult.state;
      }

      // Day Vote Phase
      const voteResult = await executeVotePhase(this.state, this.aiProvider);
      this.state = voteResult.state;

      // Check win condition after vote
      const winnerAfterVote = checkWinCondition(this.state);
      if (winnerAfterVote) {
        return this.createResult(winnerAfterVote);
      }

      // Advance to next round
      this.state = this.state.withNextRound();
    }

    // Max rounds reached - determine winner by surviving counts
    const winner = this.determineWinnerByCount();
    return this.createResult(winner);
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
  private createResult(winner: Team): GameResult {
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
    this.state = this.state.withEvent(gameEndEvent);

    // Calculate token usage
    const tokenUsage = this.calculateTokenUsage();

    // Analyze persona consistency (if personas are enabled)
    const personaAnalysis = this.config.personaEnabled
      ? analyzePersonaConsistency(this.state.players, this.state.events)
      : undefined;

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
 */
export function validateConfig(config: GameConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.playerCount < 3) {
    errors.push('Player count must be at least 3');
  }

  if (config.mafiaCount < 1) {
    errors.push('Mafia count must be at least 1');
  }

  if (config.mafiaCount >= config.playerCount) {
    errors.push('Mafia count must be less than player count');
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


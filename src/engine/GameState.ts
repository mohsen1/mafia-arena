/**
 * Immutable game state management.
 * All state changes return new instances, preserving immutability.
 */

import type {
  Player,
  Phase,
  GameConfig,
  GameEvent,
  ConversationMessage,
  Persona,
  SerializedGameState,
} from './types.js';
import { 
  createRandomGenerator, 
  createDefaultRandomGenerator,
  generateSeed,
  type RandomGenerator 
} from './utils/random.js';

export class GameState {
  /** The seeded random generator for reproducible games */
  public readonly rng: RandomGenerator;
  /** The seed used for this game (for reproducibility) */
  public readonly seed: number;

  private constructor(
    public readonly players: readonly Player[],
    public readonly phase: Phase,
    public readonly round: number,
    public readonly events: readonly GameEvent[],
    public readonly conversationHistory: readonly ConversationMessage[],
    public readonly gameId: string,
    public readonly config: GameConfig,
    rng: RandomGenerator,
    seed: number
  ) {
    this.rng = rng;
    this.seed = seed;
  }

  /**
   * Create initial game state from configuration.
   */
  static create(gameId: string, config: GameConfig): GameState {
    // Use provided seed or generate a new one
    const seed = config.seed ?? generateSeed();
    const rng = config.seed !== undefined 
      ? createRandomGenerator(seed)
      : createDefaultRandomGenerator();
    
    const players = createPlayers(config, rng);
    return new GameState(players, 'night', 1, [], [], gameId, config, rng, seed);
  }

  // ===========================================================================
  // Computed Properties
  // ===========================================================================

  get alivePlayers(): readonly Player[] {
    return this.players.filter((p) => p.isAlive);
  }

  get deadPlayers(): readonly Player[] {
    return this.players.filter((p) => !p.isAlive);
  }

  get aliveMafia(): readonly Player[] {
    return this.alivePlayers.filter((p) => p.team === 'mafia');
  }

  get aliveTown(): readonly Player[] {
    return this.alivePlayers.filter((p) => p.team === 'town');
  }

  // ===========================================================================
  // State Transitions (Return new instances)
  // ===========================================================================

  /**
   * Mark a player as eliminated.
   */
  withPlayerEliminated(playerId: string): GameState {
    const players = this.players.map((p) =>
      p.id === playerId ? { ...p, isAlive: false } : p
    );
    return new GameState(
      players,
      this.phase,
      this.round,
      this.events,
      this.conversationHistory,
      this.gameId,
      this.config,
      this.rng,
      this.seed
    );
  }

  /**
   * Set a player's persona.
   */
  withPlayerPersona(playerId: string, persona: Persona): GameState {
    const players = this.players.map((p) =>
      p.id === playerId ? { ...p, persona, name: persona.name } : p
    );
    return new GameState(
      players,
      this.phase,
      this.round,
      this.events,
      this.conversationHistory,
      this.gameId,
      this.config,
      this.rng,
      this.seed
    );
  }

  /**
   * Add an event to the event log.
   */
  withEvent(event: GameEvent): GameState {
    return new GameState(
      this.players,
      this.phase,
      this.round,
      [...this.events, event],
      this.conversationHistory,
      this.gameId,
      this.config,
      this.rng,
      this.seed
    );
  }

  /**
   * Add multiple events to the event log.
   */
  withEvents(events: readonly GameEvent[]): GameState {
    return new GameState(
      this.players,
      this.phase,
      this.round,
      [...this.events, ...events],
      this.conversationHistory,
      this.gameId,
      this.config,
      this.rng,
      this.seed
    );
  }

  /**
   * Transition to a new phase.
   */
  withPhase(phase: Phase): GameState {
    return new GameState(
      this.players,
      phase,
      this.round,
      this.events,
      this.conversationHistory,
      this.gameId,
      this.config,
      this.rng,
      this.seed
    );
  }

  /**
   * Advance to the next round.
   */
  withNextRound(): GameState {
    return new GameState(
      this.players,
      'night',
      this.round + 1,
      this.events,
      this.conversationHistory,
      this.gameId,
      this.config,
      this.rng,
      this.seed
    );
  }

  /**
   * Add a message to the conversation history.
   */
  withConversationMessage(message: ConversationMessage): GameState {
    return new GameState(
      this.players,
      this.phase,
      this.round,
      this.events,
      [...this.conversationHistory, message],
      this.gameId,
      this.config,
      this.rng,
      this.seed
    );
  }

  // ===========================================================================
  // Queries
  // ===========================================================================

  /**
   * Get a player by ID.
   */
  getPlayer(playerId: string): Player | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  /**
   * Get conversation history for the current round.
   */
  getCurrentRoundConversation(): readonly ConversationMessage[] {
    return this.conversationHistory.filter((m) => m.round === this.round);
  }

  /**
   * Get public conversation history for the current round.
   * Filters out mafia-only messages.
   */
  getCurrentRoundPublicConversation(): readonly ConversationMessage[] {
    return this.conversationHistory.filter(
      (m) => m.round === this.round && m.channel !== 'mafia'
    );
  }

  /**
   * Get mafia-only conversation history for the current round.
   */
  getCurrentRoundMafiaConversation(): readonly ConversationMessage[] {
    return this.conversationHistory.filter(
      (m) => m.round === this.round && m.channel === 'mafia'
    );
  }

  // ===========================================================================
  // Progress Tracking (for UI visibility)
  // ===========================================================================

  /**
   * Action type for pending actions.
   */
  static readonly ActionTypes = {
    INTRODUCTION: 'introduction',
    DISCUSSION: 'discussion',
    VOTE: 'vote',
    NIGHT_ACTION: 'night_action',
  } as const;

  /**
   * Get list of players who still need to act in the current phase/round.
   * Used for UI progress indicators.
   */
  getPendingActions(): Array<{
    playerId: string;
    name: string;
    team: string;
    modelId: string;
    actionType: 'introduction' | 'discussion' | 'vote' | 'night_action';
  }> {
    const pending: Array<{
      playerId: string;
      name: string;
      team: string;
      modelId: string;
      actionType: 'introduction' | 'discussion' | 'vote' | 'night_action';
    }> = [];

    if (this.phase === 'night' && this.round === 1) {
      // Introduction phase - check who hasn't introduced themselves
      for (const p of this.alivePlayers) {
        const hasIntro = this.events.some(
          (e) => e.type === 'introduction' && e.playerId === p.id
        );
        if (!hasIntro) {
          pending.push({
            playerId: p.id,
            name: p.name,
            team: p.team,
            modelId: p.modelId,
            actionType: 'introduction',
          });
        }
      }
    } else if (this.phase === 'day_discussion') {
      // Discussion phase - check who hasn't spoken in this round
      // Note: Discussion can have multiple sub-rounds, so we check by round
      for (const p of this.alivePlayers) {
        const hasSpoken = this.events.some(
          (e) =>
            e.type === 'discussion' &&
            e.round === this.round &&
            e.playerId === p.id
        );
        if (!hasSpoken) {
          pending.push({
            playerId: p.id,
            name: p.name,
            team: p.team,
            modelId: p.modelId,
            actionType: 'discussion',
          });
        }
      }
    } else if (this.phase === 'day_vote') {
      // Voting phase - check who hasn't voted
      for (const p of this.alivePlayers) {
        const hasVoted = this.events.some(
          (e) =>
            e.type === 'vote' && e.round === this.round && e.voterId === p.id
        );
        if (!hasVoted) {
          pending.push({
            playerId: p.id,
            name: p.name,
            team: p.team,
            modelId: p.modelId,
            actionType: 'vote',
          });
        }
      }
    } else if (this.phase === 'night' && this.round > 1) {
      // Night phase - check which mafia haven't voted for kill target
      const mafia = this.alivePlayers.filter((p) => p.team === 'mafia');
      for (const p of mafia) {
        const hasVoted = this.events.some(
          (e) =>
            e.type === 'vote' &&
            e.phase === 'night' &&
            e.round === this.round &&
            e.voterId === p.id
        );
        if (!hasVoted) {
          pending.push({
            playerId: p.id,
            name: p.name,
            team: p.team,
            modelId: p.modelId,
            actionType: 'night_action',
          });
        }
      }
    }

    return pending;
  }

  /**
   * Get progress information for UI display.
   */
  getProgress(): {
    current: number;
    total: number;
    label: string;
    pendingPlayers: string[];
  } {
    const pending = this.getPendingActions();
    
    // Calculate total based on phase
    let total: number;
    if (this.phase === 'night' && this.round > 1) {
      // Night phase - only mafia act
      total = this.aliveMafia.length;
    } else {
      // Other phases - all alive players act
      total = this.alivePlayers.length;
    }
    
    const completed = total - pending.length;
    const pendingNames = pending.map((p) => p.name);

    const label =
      pending.length === 0
        ? 'All actions complete'
        : `Waiting for ${pending.length} player${pending.length > 1 ? 's' : ''}`;

    return { current: completed, total, label, pendingPlayers: pendingNames };
  }

  // ===========================================================================
  // Serialization (for DO state persistence)
  // ===========================================================================

  /**
   * Serialize state for persistence to Durable Object storage.
   * Used to survive DO evictions during long-running games (discount pricing mode).
   */
  serialize(): SerializedGameState {
    return {
      players: this.players,
      phase: this.phase,
      round: this.round,
      events: this.events,
      conversationHistory: this.conversationHistory,
      gameId: this.gameId,
      config: this.config,
      seed: this.seed,
    };
  }

  /**
   * Deserialize state from Durable Object storage.
   * Recreates the RNG from seed for any future random operations.
   * Note: RNG position is not preserved, but this is acceptable because:
   * - Player shuffle already happened (stored in players array)
   * - Future operations will be deterministic from seed
   */
  static deserialize(data: SerializedGameState): GameState {
    // Recreate RNG from seed for any future random operations
    const rng = createRandomGenerator(data.seed);
    
    return new GameState(
      data.players,
      data.phase,
      data.round,
      data.events,
      data.conversationHistory,
      data.gameId,
      data.config,
      rng,
      data.seed
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create players from game configuration.
 * Shuffles players using the provided RNG for reproducibility.
 */
function createPlayers(config: GameConfig, rng: RandomGenerator): readonly Player[] {
  const players: Player[] = [];
  let playerIndex = 1;

  for (const assignment of config.teams) {
    for (let i = 0; i < assignment.count; i++) {
      players.push({
        id: `player_${playerIndex}`,
        name: `Player ${playerIndex}`,
        modelId: assignment.modelId,
        team: assignment.team,
        isAlive: true,
      });
      playerIndex++;
    }
  }

  // Shuffle players using seeded RNG for reproducibility
  return rng.shuffled(players);
}

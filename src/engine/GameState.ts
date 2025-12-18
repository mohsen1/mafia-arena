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
} from './types.js';

export class GameState {
  private constructor(
    public readonly players: readonly Player[],
    public readonly phase: Phase,
    public readonly round: number,
    public readonly events: readonly GameEvent[],
    public readonly conversationHistory: readonly ConversationMessage[],
    public readonly gameId: string,
    public readonly config: GameConfig
  ) {}

  /**
   * Create initial game state from configuration.
   */
  static create(gameId: string, config: GameConfig): GameState {
    const players = createPlayers(config);
    return new GameState(players, 'night', 1, [], [], gameId, config);
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
      this.config
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
      this.config
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
      this.config
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
      this.config
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
      this.config
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
      this.config
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
      this.config
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
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create players from game configuration.
 * Shuffles players to randomize seating.
 */
function createPlayers(config: GameConfig): readonly Player[] {
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

  // Shuffle players to randomize positions
  return shuffleArray(players);
}

/**
 * Fisher-Yates shuffle algorithm.
 */
function shuffleArray<T>(array: readonly T[]): readonly T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}


/**
 * GameState tests - Immutable state management.
 */

import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState.js';
import type { GameConfig } from '../types.js';

describe('GameState', () => {
  const createTestConfig = (): GameConfig => ({
    playerCount: 5,
    mafiaCount: 1,
    teams: [
      { modelId: 'test-mafia', team: 'mafia', count: 1 },
      { modelId: 'test-town', team: 'town', count: 4 },
    ],
    maxRounds: 10,
    discussionEnabled: true,
    personaConstraints: 'moderate',
  });

  describe('create', () => {
    it('should create initial state with correct player count', () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      expect(state.players.length).toBe(5);
      expect(state.phase).toBe('night');
      expect(state.round).toBe(1);
      expect(state.events.length).toBe(0);
    });

    it('should assign correct teams to players', () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const mafiaPlayers = state.players.filter((p) => p.team === 'mafia');
      const townPlayers = state.players.filter((p) => p.team === 'town');

      expect(mafiaPlayers.length).toBe(1);
      expect(townPlayers.length).toBe(4);
    });

    it('should create all players as alive initially', () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      expect(state.players.every((p) => p.isAlive)).toBe(true);
      expect(state.alivePlayers.length).toBe(5);
      expect(state.deadPlayers.length).toBe(0);
    });
  });

  describe('immutability', () => {
    it('should return new state when eliminating player', () => {
      const config = createTestConfig();
      const state1 = GameState.create('test-game', config);
      const playerId = state1.players[0]!.id;

      const state2 = state1.withPlayerEliminated(playerId);

      expect(state1.alivePlayers.length).toBe(5);
      expect(state2.alivePlayers.length).toBe(4);
      expect(state1).not.toBe(state2);
    });

    it('should return new state when adding event', () => {
      const config = createTestConfig();
      const state1 = GameState.create('test-game', config);

      const state2 = state1.withEvent({
        type: 'phase_start',
        phase: 'night',
        round: 1,
        timestamp: Date.now(),
      });

      expect(state1.events.length).toBe(0);
      expect(state2.events.length).toBe(1);
      expect(state1).not.toBe(state2);
    });

    it('should return new state when changing phase', () => {
      const config = createTestConfig();
      const state1 = GameState.create('test-game', config);

      const state2 = state1.withPhase('day_discussion');

      expect(state1.phase).toBe('night');
      expect(state2.phase).toBe('day_discussion');
      expect(state1).not.toBe(state2);
    });

    it('should return new state when advancing round', () => {
      const config = createTestConfig();
      const state1 = GameState.create('test-game', config);

      const state2 = state1.withNextRound();

      expect(state1.round).toBe(1);
      expect(state2.round).toBe(2);
      expect(state2.phase).toBe('night');
      expect(state1).not.toBe(state2);
    });
  });

  describe('computed properties', () => {
    it('should correctly filter alive mafia', () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      expect(state.aliveMafia.length).toBe(1);

      // Eliminate the mafia player
      const mafiaPlayer = state.aliveMafia[0]!;
      state = state.withPlayerEliminated(mafiaPlayer.id);

      expect(state.aliveMafia.length).toBe(0);
    });

    it('should correctly filter alive town', () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      expect(state.aliveTown.length).toBe(4);

      // Eliminate a town player
      const townPlayer = state.aliveTown[0]!;
      state = state.withPlayerEliminated(townPlayer.id);

      expect(state.aliveTown.length).toBe(3);
    });

    it('should correctly return dead players', () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      expect(state.deadPlayers.length).toBe(0);

      const player = state.players[0]!;
      state = state.withPlayerEliminated(player.id);

      expect(state.deadPlayers.length).toBe(1);
      expect(state.deadPlayers[0]!.id).toBe(player.id);
    });
  });

  describe('conversation history', () => {
    it('should add messages to conversation history', () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      const message = {
        playerId: 'player_1',
        playerName: 'Player 1',
        message: 'Hello everyone!',
        round: 1,
      };

      state = state.withConversationMessage(message);

      expect(state.conversationHistory.length).toBe(1);
      expect(state.conversationHistory[0]).toEqual(message);
    });

    it('should filter conversation by current round', () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      // Add message in round 1
      state = state.withConversationMessage({
        playerId: 'player_1',
        playerName: 'Player 1',
        message: 'Round 1 message',
        round: 1,
      });

      // Advance to round 2
      state = state.withNextRound();

      // Add message in round 2
      state = state.withConversationMessage({
        playerId: 'player_1',
        playerName: 'Player 1',
        message: 'Round 2 message',
        round: 2,
      });

      const currentRoundMessages = state.getCurrentRoundConversation();
      expect(currentRoundMessages.length).toBe(1);
      expect(currentRoundMessages[0]!.message).toBe('Round 2 message');
    });
  });

  describe('getPlayer', () => {
    it('should return player by ID', () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);
      const player = state.players[0]!;

      const foundPlayer = state.getPlayer(player.id);

      expect(foundPlayer).toBeDefined();
      expect(foundPlayer!.id).toBe(player.id);
    });

    it('should return undefined for non-existent player', () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const foundPlayer = state.getPlayer('non-existent');

      expect(foundPlayer).toBeUndefined();
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize preserving all state', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        seed: 12345, // Use a fixed seed for reproducibility
      };
      let state = GameState.create('test-game', config);

      // Add some state changes
      state = state.withPhase('day_discussion');
      state = state.withEvent({
        type: 'phase_start',
        phase: 'day_discussion',
        round: 1,
        timestamp: Date.now(),
      });
      state = state.withConversationMessage({
        playerId: 'player_1',
        playerName: 'Player 1',
        message: 'Hello everyone!',
        round: 1,
      });
      state = state.withPlayerEliminated(state.players[0]!.id);

      // Serialize
      const serialized = state.serialize();

      // Deserialize
      const restored = GameState.deserialize(serialized);

      // Verify all state is preserved
      expect(restored.gameId).toBe(state.gameId);
      expect(restored.phase).toBe(state.phase);
      expect(restored.round).toBe(state.round);
      expect(restored.seed).toBe(state.seed);
      expect(restored.players.length).toBe(state.players.length);
      expect(restored.events.length).toBe(state.events.length);
      expect(restored.conversationHistory.length).toBe(state.conversationHistory.length);
      expect(restored.alivePlayers.length).toBe(state.alivePlayers.length);
      expect(restored.deadPlayers.length).toBe(state.deadPlayers.length);
    });

    it('should serialize to JSON-compatible format', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        seed: 12345,
      };
      const state = GameState.create('test-game', config);

      const serialized = state.serialize();

      // Should be JSON-serializable
      const json = JSON.stringify(serialized);
      expect(json).toBeTruthy();

      // Should roundtrip through JSON
      const parsed = JSON.parse(json);
      const restored = GameState.deserialize(parsed);

      expect(restored.gameId).toBe(state.gameId);
      expect(restored.seed).toBe(state.seed);
    });

    it('should preserve player personas after deserialization', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        seed: 12345,
      };
      let state = GameState.create('test-game', config);

      // Add a persona
      const player = state.players[0]!;
      state = state.withPlayerPersona(player.id, {
        name: 'Detective Smith',
        background: 'A seasoned investigator',
        personality: 'Analytical and cautious',
      });

      const serialized = state.serialize();
      const restored = GameState.deserialize(serialized);

      const restoredPlayer = restored.getPlayer(player.id);
      expect(restoredPlayer?.persona).toBeDefined();
      expect(restoredPlayer?.persona?.name).toBe('Detective Smith');
      expect(restoredPlayer?.name).toBe('Detective Smith');
    });

    it('should recreate RNG from seed', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        seed: 12345,
      };
      const state = GameState.create('test-game', config);

      const serialized = state.serialize();
      const restored = GameState.deserialize(serialized);

      // RNG should be recreated
      expect(restored.rng).toBeDefined();
      expect(restored.seed).toBe(12345);
    });

    it('should handle complex conversation history', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        seed: 12345,
      };
      let state = GameState.create('test-game', config);

      // Add messages with different channels
      state = state.withConversationMessage({
        playerId: 'player_1',
        playerName: 'Player 1',
        message: 'Public message',
        round: 1,
        channel: 'public',
        discussionRound: 1,
      });
      state = state.withConversationMessage({
        playerId: 'player_2',
        playerName: 'Player 2',
        message: 'Mafia message',
        round: 1,
        channel: 'mafia',
        discussionRound: 1,
      });

      const serialized = state.serialize();
      const restored = GameState.deserialize(serialized);

      expect(restored.conversationHistory.length).toBe(2);
      expect(restored.conversationHistory[0]?.channel).toBe('public');
      expect(restored.conversationHistory[1]?.channel).toBe('mafia');
    });
  });
});


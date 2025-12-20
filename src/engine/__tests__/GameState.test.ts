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
});


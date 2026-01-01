/**
 * E2E tests for GameState management.
 *
 * Tests the immutable game state operations:
 * - State creation and initialization
 * - Player management
 * - Event handling
 * - Win condition checks
 * - Serialization/deserialization for workflow checkpointing
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { initializeTestDatabase, cleanupTestData } from '../setup.js';
import {
  GameState,
  checkWinCondition,
  generateSeed,
  type GameConfig,
  type GameEvent,
  type PlayerState,
} from '../../../engine/index.js';

describe('GameState E2E', () => {
  beforeAll(async () => {
    await initializeTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupTestData(env.DB);
  });

  describe('State Creation', () => {
    it('should create initial game state with correct players', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model-a', team: 'mafia', count: 2 },
          { modelId: 'test/model-b', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 42,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-game-1', config);

      expect(state.gameId).toBe('test-game-1');
      expect(state.round).toBe(1);
      expect(state.players.length).toBe(7);
      expect(state.aliveMafia.length).toBe(2);
      expect(state.aliveTown.length).toBe(5);
      expect(state.deadPlayers.length).toBe(0);
      expect(state.events.length).toBe(0);
    });

    it('should assign correct teams based on config', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model-mafia', team: 'mafia', count: 2 },
          { modelId: 'test/model-town', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 123,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-game-2', config);

      const mafiaPlayers = state.players.filter(p => p.team === 'mafia');
      const townPlayers = state.players.filter(p => p.team === 'town');

      expect(mafiaPlayers.length).toBe(2);
      expect(townPlayers.length).toBe(5);
      
      // Verify model assignments
      for (const p of mafiaPlayers) {
        expect(p.modelId).toBe('test/model-mafia');
      }
      for (const p of townPlayers) {
        expect(p.modelId).toBe('test/model-town');
      }
    });

    it('should use provided seed for reproducibility', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 99999,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state1 = GameState.create('game-a', config);
      const state2 = GameState.create('game-b', config);

      // Same seed should produce same player order
      expect(state1.players.map(p => p.team)).toEqual(
        state2.players.map(p => p.team)
      );
    });
  });

  describe('Player Management', () => {
    it('should get player by ID', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-game-3', config);

      const player = state.getPlayer('player_1');
      expect(player).toBeDefined();
      expect(player!.id).toBe('player_1');
    });

    it('should return undefined for non-existent player', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-game-4', config);

      const player = state.getPlayer('player_99');
      expect(player).toBeUndefined();
    });

    it('should eliminate player and update lists', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-game-5', config);
      const townPlayer = state.aliveTown[0]!;

      const newState = state.withPlayerEliminated(townPlayer.id);

      expect(newState.deadPlayers.length).toBe(1);
      expect(newState.alivePlayers.length).toBe(6);
      expect(newState.getPlayer(townPlayer.id)!.isAlive).toBe(false);
      
      // Original state unchanged (immutability)
      expect(state.deadPlayers.length).toBe(0);
      expect(state.alivePlayers.length).toBe(7);
    });
  });

  describe('Event Handling', () => {
    it('should add event to state immutably', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-game-6', config);

      const event: GameEvent = {
        type: 'phase_start',
        phase: 'introduction',
        round: 1,
        timestamp: Date.now(),
      };

      const newState = state.withEvent(event);

      expect(newState.events.length).toBe(1);
      expect(newState.events[0]!.type).toBe('phase_start');
      
      // Original unchanged
      expect(state.events.length).toBe(0);
    });

    it('should chain multiple events', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      let state = GameState.create('test-game-7', config);

      state = state.withEvent({
        type: 'phase_start',
        phase: 'introduction',
        round: 1,
        timestamp: Date.now(),
      });

      state = state.withEvent({
        type: 'phase_end',
        phase: 'introduction',
        round: 1,
        timestamp: Date.now(),
      });

      expect(state.events.length).toBe(2);
    });
  });

  describe('Round Management', () => {
    it('should advance to next round', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-game-8', config);
      expect(state.round).toBe(1);

      const newState = state.withNextRound();
      expect(newState.round).toBe(2);
      
      // Original unchanged
      expect(state.round).toBe(1);
    });
  });

  describe('Win Conditions', () => {
    it('should detect mafia win when mafia >= town', () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-win-1', config);
      
      // Mafia = Town (2 = 2), mafia wins
      const winner = checkWinCondition(state);
      expect(winner).toBe('mafia');
    });

    it('should detect town win when all mafia eliminated', () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      let state = GameState.create('test-win-2', config);
      
      // Eliminate both mafia
      for (const mafiaPlayer of state.aliveMafia) {
        state = state.withPlayerEliminated(mafiaPlayer.id);
      }

      const winner = checkWinCondition(state);
      expect(winner).toBe('town');
    });

    it('should return null when game not over', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      const state = GameState.create('test-win-3', config);

      const winner = checkWinCondition(state);
      expect(winner).toBeNull();
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize state correctly', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 2,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 2 },
          { modelId: 'test/model', team: 'town', count: 5 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      let state = GameState.create('test-serialize-1', config);
      
      // Add some events
      state = state.withEvent({
        type: 'phase_start',
        phase: 'introduction',
        round: 1,
        timestamp: Date.now(),
      });
      
      // Eliminate a player
      state = state.withPlayerEliminated('player_1');
      
      // Advance round
      state = state.withNextRound();

      // Serialize
      const serialized = state.serialize();
      
      // Verify serialized format
      expect(serialized.gameId).toBe('test-serialize-1');
      expect(serialized.round).toBe(2);
      expect(serialized.events.length).toBe(1);
      expect(typeof serialized.players).toBe('object');

      // Deserialize
      const restored = GameState.deserialize(serialized);

      expect(restored.gameId).toBe(state.gameId);
      expect(restored.round).toBe(state.round);
      expect(restored.events.length).toBe(state.events.length);
      expect(restored.deadPlayers.length).toBe(state.deadPlayers.length);
      expect(restored.alivePlayers.length).toBe(state.alivePlayers.length);
    });

    it('should preserve player personas through serialization', () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'test/model', team: 'mafia', count: 1 },
          { modelId: 'test/model', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaConstraints: 'moderate',
        seed: 12345,
        contextLevel: 'full',
        contextWindowSize: 3,
        personaTheme: 'noir',
      };

      let state = GameState.create('test-persona-serialize', config);
      
      // Add persona to a player
      state = state.withPlayerPersona('player_1', {
        name: 'Detective Marcus',
        background: 'A seasoned detective with a keen eye for detail.',
        personality: 'Analytical and cautious',
        occupation: 'Private Investigator',
      });

      const serialized = state.serialize();
      const restored = GameState.deserialize(serialized);

      const restoredPlayer = restored.getPlayer('player_1');
      expect(restoredPlayer!.persona).toBeDefined();
      expect(restoredPlayer!.persona!.name).toBe('Detective Marcus');
    });
  });

  describe('Seed Generation', () => {
    it('should generate unique seeds', () => {
      const seeds = new Set<number>();
      for (let i = 0; i < 100; i++) {
        seeds.add(generateSeed());
      }
      
      // Should have high uniqueness (allow for some collisions)
      expect(seeds.size).toBeGreaterThan(95);
    });

    it('should generate valid numeric seeds', () => {
      for (let i = 0; i < 10; i++) {
        const seed = generateSeed();
        expect(typeof seed).toBe('number');
        expect(Number.isInteger(seed)).toBe(true);
        // Seeds can be negative (using signed 32-bit integers)
        expect(Number.isFinite(seed)).toBe(true);
      }
    });
  });
});

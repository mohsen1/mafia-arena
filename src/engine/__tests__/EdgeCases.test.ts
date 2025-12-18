/**
 * Edge Case Tests
 * Tests for unusual game states and boundary conditions.
 */

import { describe, it, expect } from 'vitest';
import { Game, validateConfig } from '../Game.js';
import { GameState } from '../GameState.js';
import { checkWinCondition } from '../utils/winCondition.js';
import { resolveVotes } from '../utils/votes.js';
import { ScenarioMockAIProvider, FirstTargetStrategy, GameStrategy } from './mocks/MockAIProvider.js';
import type { GameConfig, AIContext, Player } from '../types.js';

describe('Edge Cases', () => {
  describe('Win Conditions', () => {
    it('should declare mafia win when mafia equals town at game start', () => {
      // Edge case: Config allows this but game should end immediately
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 2, // 2 mafia, 2 town = instant mafia win
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 2 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const state = GameState.create('test', config);
      const winner = checkWinCondition(state);

      // checkWinCondition returns Team | null
      expect(winner).toBe('mafia');
    });

    it('should declare mafia win when mafia outnumbers town', () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 3, // 3 mafia, 2 town
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 3 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const state = GameState.create('test', config);
      const winner = checkWinCondition(state);

      expect(winner).toBe('mafia');
    });

    it('should declare town win when all mafia are eliminated', () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      let state = GameState.create('test', config);
      
      // Eliminate the mafia player
      const mafiaPlayer = state.aliveMafia[0]!;
      state = state.withPlayerEliminated(mafiaPlayer.id);

      const winner = checkWinCondition(state);

      expect(winner).toBe('town');
    });

    it('should not end game when town still outnumbers mafia', () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 2 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const state = GameState.create('test', config);
      const winner = checkWinCondition(state);

      // null means game continues
      expect(winner).toBeNull();
    });

    it('should handle 1v1 scenario (mafia wins tie)', () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      let state = GameState.create('test', config);
      
      // Eliminate all but one town player
      const townPlayers = state.aliveTown;
      state = state.withPlayerEliminated(townPlayers[0]!.id);
      state = state.withPlayerEliminated(townPlayers[1]!.id);

      // Now it's 1 mafia vs 1 town
      const winner = checkWinCondition(state);

      expect(winner).toBe('mafia');
    });
  });

  describe('Vote Resolution Edge Cases', () => {
    it('should return null on exact tie', () => {
      const players: readonly Player[] = [
        { id: 'p1', name: 'Player 1', modelId: 'test', team: 'town', isAlive: true },
        { id: 'p2', name: 'Player 2', modelId: 'test', team: 'town', isAlive: true },
      ];

      const votes = new Map<string, string>();
      votes.set('voter1', 'p1');
      votes.set('voter2', 'p2');

      const result = resolveVotes(votes, players);
      expect(result).toBeNull();
    });

    it('should handle single vote scenario', () => {
      const players: readonly Player[] = [
        { id: 'p1', name: 'Player 1', modelId: 'test', team: 'town', isAlive: true },
        { id: 'p2', name: 'Player 2', modelId: 'test', team: 'town', isAlive: true },
      ];

      const votes = new Map<string, string>();
      votes.set('voter1', 'p1');

      const result = resolveVotes(votes, players);
      expect(result?.id).toBe('p1');
    });

    it('should handle empty votes', () => {
      const players: readonly Player[] = [
        { id: 'p1', name: 'Player 1', modelId: 'test', team: 'town', isAlive: true },
      ];

      const votes = new Map<string, string>();

      const result = resolveVotes(votes, players);
      expect(result).toBeNull();
    });

    it('should handle all votes for same player', () => {
      const players: readonly Player[] = [
        { id: 'p1', name: 'Player 1', modelId: 'test', team: 'town', isAlive: true },
        { id: 'p2', name: 'Player 2', modelId: 'test', team: 'town', isAlive: true },
      ];

      const votes = new Map<string, string>();
      votes.set('voter1', 'p1');
      votes.set('voter2', 'p1');
      votes.set('voter3', 'p1');

      const result = resolveVotes(votes, players);
      expect(result?.id).toBe('p1');
    });

    it('should handle three-way tie', () => {
      const players: readonly Player[] = [
        { id: 'p1', name: 'Player 1', modelId: 'test', team: 'town', isAlive: true },
        { id: 'p2', name: 'Player 2', modelId: 'test', team: 'town', isAlive: true },
        { id: 'p3', name: 'Player 3', modelId: 'test', team: 'town', isAlive: true },
      ];

      const votes = new Map<string, string>();
      votes.set('voter1', 'p1');
      votes.set('voter2', 'p2');
      votes.set('voter3', 'p3');

      const result = resolveVotes(votes, players);
      expect(result).toBeNull();
    });
  });

  describe('Configuration Validation', () => {
    it('should reject player count less than 7', () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 2 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 7'))).toBe(true);
    });

    it('should reject mafia count less than 2', () => {
      const config: GameConfig = {
        playerCount: 7,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 6 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 2'))).toBe(true);
    });

    it('should reject mafia equal to player count', () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 3,
        teams: [{ modelId: 'mafia', team: 'mafia', count: 3 }],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mafia count must be less than player count');
    });

    it('should reject mismatched team assignments', () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 }, // Only 3 assigned, not 5
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const result = validateConfig(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("don't match"))).toBe(true);
    });
  });

  describe('Max Rounds Behavior', () => {
    it('should end game when max rounds reached', async () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 2,
        discussionEnabled: false,
        nightDiscussionRounds: 0,
      };

      const provider = new ScenarioMockAIProvider(new FirstTargetStrategy());
      const game = new Game(config, provider);
      const result = await game.run();

      // Game should end (either by win condition or maxRounds)
      expect(result.rounds).toBeLessThanOrEqual(3); // Round counter increments after each round
      expect(['mafia', 'town']).toContain(result.winner);
    });

    it('should eventually end even with many ties', async () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 4 },
        ],
        maxRounds: 3,
        discussionEnabled: false,
        nightDiscussionRounds: 0,
      };

      // Strategy that spreads votes (may cause ties)
      class SpreadVotesStrategy implements GameStrategy {
        private voteIndex = 0;

        getIntroductionMessage(ctx: AIContext) { return `Hello from ${ctx.playerName}`; }
        getKillTarget(_ctx: AIContext, targets: readonly string[]) {
          // Always target the first available
          return targets[0]!;
        }
        getDiscussionMessage() { return 'Discussing...'; }
        getEliminationTarget(_ctx: AIContext, targets: readonly string[]) {
          // Cycle through targets
          return targets[this.voteIndex++ % targets.length] ?? null;
        }
      }

      const provider = new ScenarioMockAIProvider(new SpreadVotesStrategy());
      const game = new Game(config, provider);
      const result = await game.run();

      // Game must end
      expect(['mafia', 'town']).toContain(result.winner);
      expect(result.rounds).toBeLessThanOrEqual(4); // maxRounds + 1 (counter incremented after last round)
    });
  });

  describe('Phase Transitions', () => {
    it('should correctly transition from night to day', () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
      };

      let state = GameState.create('test', config);
      expect(state.phase).toBe('night');

      state = state.withPhase('day_discussion');
      expect(state.phase).toBe('day_discussion');

      state = state.withPhase('day_vote');
      expect(state.phase).toBe('day_vote');

      state = state.withNextRound();
      expect(state.phase).toBe('night');
      expect(state.round).toBe(2);
    });
  });

  describe('Large Player Counts', () => {
    it('should handle games with many players', async () => {
      const config: GameConfig = {
        playerCount: 15,
        mafiaCount: 4,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 4 },
          { modelId: 'town', team: 'town', count: 11 },
        ],
        maxRounds: 3, // Limit rounds for test speed
        discussionEnabled: false,
        nightDiscussionRounds: 0,
      };

      const provider = new ScenarioMockAIProvider(new FirstTargetStrategy());
      const game = new Game(config, provider);
      const result = await game.run();

      expect(result.participants.length).toBe(2);
      expect(['mafia', 'town']).toContain(result.winner);
    });
  });

  describe('State Immutability', () => {
    it('should not mutate original state when creating new states', () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
      };

      const originalState = GameState.create('test', config);
      const originalPlayers = originalState.players;
      const originalPhase = originalState.phase;
      const originalRound = originalState.round;

      // Create modified states
      const stateWithElimination = originalState.withPlayerEliminated(originalState.players[0]!.id);
      const stateWithPhase = originalState.withPhase('day_discussion');
      const stateWithRound = originalState.withNextRound();

      // Original state should be unchanged
      expect(originalState.players).toBe(originalPlayers);
      expect(originalState.phase).toBe(originalPhase);
      expect(originalState.round).toBe(originalRound);
      expect(originalState.players.every(p => p.isAlive)).toBe(true);

      // New states should be different
      expect(stateWithElimination.players).not.toBe(originalPlayers);
      expect(stateWithPhase.phase).toBe('day_discussion');
      expect(stateWithRound.round).toBe(2);
    });
  });
});


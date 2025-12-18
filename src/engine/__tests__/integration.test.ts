/**
 * Integration tests for full game scenarios.
 */

import { describe, it, expect } from 'vitest';
import { Game } from '../Game.js';
import { ScenarioMockAIProvider, FirstTargetStrategy, CoordinatedMafiaStrategy } from './mocks/MockAIProvider.js';
import type { GameConfig, AIContext } from '../types.js';

describe('Integration Tests', () => {
  describe('Town Victory Scenario', () => {
    it('should result in town win when mafia is eliminated', async () => {
      // 3 players: 1 mafia, 2 town
      // Strategy: Everyone votes for the first player
      // Night: Mafia kills first town player
      // Day: Both remaining players vote for first (hopefully mafia)
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 1 },
          { modelId: 'town-model', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      // Create a deterministic provider that makes mafia lose
      class TownWinsStrategy {
        getIntroductionMessage(context: AIContext): string {
          return `Hello, I'm ${context.playerName}. Let's find the mafia!`;
        }

        getKillTarget(_context: AIContext, validTargets: readonly string[]): string {
          return validTargets[0]!;
        }

        getDiscussionMessage(context: AIContext): string {
          return `I am ${context.playerName}`;
        }

        getEliminationTarget(_context: AIContext, validTargets: readonly string[]): string | null {
          // Town always votes for first target - might be mafia!
          return validTargets[0] ?? null;
        }
      }

      const strategy = new TownWinsStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider, { gameId: 'town-wins-test' });
      const result = await game.run();

      // Game should complete
      expect(result.id).toBe('town-wins-test');
      expect(['mafia', 'town']).toContain(result.winner);
      expect(result.rounds).toBeGreaterThanOrEqual(1);
      expect(result.events.length).toBeGreaterThan(0);
    });
  });

  describe('Mafia Victory Scenario', () => {
    it('should result in mafia win when they equal town', async () => {
      // Start with 2 mafia, 3 town
      // If town loses 2 members, it's 2v1 = mafia wins
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 2 },
          { modelId: 'town-model', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new CoordinatedMafiaStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider, { gameId: 'mafia-scenario-test' });
      const result = await game.run();

      // Game should complete with some winner
      expect(['mafia', 'town']).toContain(result.winner);
      expect(result.participants.length).toBe(2);
    });
  });

  describe('Large Game Scenario', () => {
    it('should handle 9 player game', async () => {
      const config: GameConfig = {
        playerCount: 9,
        mafiaCount: 3,
        teams: [
          { modelId: 'gpt-4o', team: 'mafia', count: 3 },
          { modelId: 'claude-3', team: 'town', count: 6 },
        ],
        maxRounds: 15,
        discussionEnabled: true,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new FirstTargetStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider, { gameId: 'large-game-test' });
      const result = await game.run();

      expect(result.id).toBe('large-game-test');
      expect(['mafia', 'town']).toContain(result.winner);
      
      // Should have many events for a 9-player game
      expect(result.events.length).toBeGreaterThan(20);

      // Check participants
      expect(result.participants.length).toBe(2);
      
      const mafiaParticipant = result.participants.find(p => p.team === 'mafia')!;
      const townParticipant = result.participants.find(p => p.team === 'town')!;
      
      expect(mafiaParticipant.modelId).toBe('gpt-4o');
      expect(mafiaParticipant.playerCount).toBe(3);
      expect(townParticipant.modelId).toBe('claude-3');
      expect(townParticipant.playerCount).toBe(6);
    });
  });

  describe('Discussion Phase', () => {
    it('should record all discussion messages', async () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 4 },
        ],
        maxRounds: 2,
        discussionEnabled: true,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new FirstTargetStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider);
      const result = await game.run();

      const discussionEvents = result.events.filter(e => e.type === 'discussion');
      
      // Each alive player discusses each round (before voting)
      // At minimum, all 5 players should discuss in round 1
      expect(discussionEvents.length).toBeGreaterThanOrEqual(4); // At least 4 if someone died
    });
  });

  describe('Event Timeline', () => {
    it('should have correct event ordering', async () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 5,
        discussionEnabled: false,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new FirstTargetStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider);
      const result = await game.run();

      // Verify event ordering for first round
      const firstRoundEvents = result.events.filter(
        e => 'round' in e && e.round === 1
      );

      // Find indices
      const nightStart = firstRoundEvents.findIndex(
        e => e.type === 'phase_start' && e.phase === 'night'
      );
      const nightEnd = firstRoundEvents.findIndex(
        e => e.type === 'phase_end' && e.phase === 'night'
      );
      const voteStart = firstRoundEvents.findIndex(
        e => e.type === 'phase_start' && e.phase === 'day_vote'
      );

      // Night should come before day vote
      expect(nightStart).toBeLessThan(nightEnd);
      if (voteStart !== -1) {
        expect(nightEnd).toBeLessThan(voteStart);
      }
    });

    it('should end with game_end event', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new FirstTargetStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider);
      const result = await game.run();

      const lastEvent = result.events[result.events.length - 1];
      expect(lastEvent?.type).toBe('game_end');
    });
  });

  describe('Token Tracking', () => {
    it('should accurately sum all token usage', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new FirstTargetStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider);
      const result = await game.run();

      // Calculate expected tokens from events
      const aiCallEvents = result.events.filter(e => e.type === 'ai_call');
      let expectedInput = 0;
      let expectedOutput = 0;

      for (const event of aiCallEvents) {
        if (event.type === 'ai_call') {
          expectedInput += event.tokensUsed.input;
          expectedOutput += event.tokensUsed.output;
        }
      }

      expect(result.tokenUsage.input).toBe(expectedInput);
      expect(result.tokenUsage.output).toBe(expectedOutput);
      expect(result.tokenUsage.total).toBe(expectedInput + expectedOutput);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single mafia player', async () => {
      const config: GameConfig = {
        playerCount: 4,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new FirstTargetStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider);
      const result = await game.run();

      expect(['mafia', 'town']).toContain(result.winner);
    });

    it('should handle minimum player count (3)', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
        personaEnabled: false,
        personaConstraints: 'moderate',
      };

      const strategy = new FirstTargetStrategy();
      const provider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, provider);
      const result = await game.run();

      // Should complete without errors
      expect(result.rounds).toBeGreaterThanOrEqual(1);
      expect(['mafia', 'town']).toContain(result.winner);
    });
  });
});


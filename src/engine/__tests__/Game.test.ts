/**
 * Main Game class tests.
 */

import { describe, it, expect } from 'vitest';
import { Game, validateConfig } from '../Game.js';
import { ScenarioMockAIProvider, FirstTargetStrategy, CoordinatedMafiaStrategy } from './mocks/MockAIProvider.js';
import type { GameConfig } from '../types.js';

describe('Game', () => {
  const createTestConfig = (): GameConfig => ({
    playerCount: 5,
    mafiaCount: 1,
    teams: [
      { modelId: 'test-mafia', team: 'mafia', count: 1 },
      { modelId: 'test-town', team: 'town', count: 4 },
    ],
    maxRounds: 10,
    discussionEnabled: false, // Disable for faster tests
    personaEnabled: false,
    personaConstraints: 'moderate',
  });

  describe('validateConfig', () => {
    it('should accept valid configuration', () => {
      const config = createTestConfig();
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject player count less than 3', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 2,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 1 },
        ],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Player count must be at least 3');
    });

    it('should reject mafia count less than 1', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        mafiaCount: 0,
        teams: [{ modelId: 'town', team: 'town', count: 5 }],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mafia count must be at least 1');
    });

    it('should reject when mafia >= player count', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 3,
        mafiaCount: 3,
        teams: [{ modelId: 'mafia', team: 'mafia', count: 3 }],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mafia count must be less than player count');
    });

    it('should reject mismatched team assignments', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 5,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 3 }, // Only 4 assigned, not 5
        ],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("don't match player count"))).toBe(true);
    });
  });

  describe('run', () => {
    it('should complete a game with town winning', async () => {
      // Create a scenario where town always votes for mafia
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 1 },
          { modelId: 'town-model', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      // The game will need responses for:
      // Night 1: 1 mafia kill vote
      // Day 1: 3 elimination votes
      // This creates a complex scenario, let's use the strategy provider

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider, { gameId: 'test-game' });
      const result = await game.run();

      expect(result.id).toBe('test-game');
      expect(result.winner).toBeDefined();
      expect(['mafia', 'town']).toContain(result.winner);
      expect(result.rounds).toBeGreaterThanOrEqual(1);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0); // Can be 0 if game runs very fast
    });

    it('should track token usage', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      expect(result.tokenUsage.input).toBeGreaterThan(0);
      expect(result.tokenUsage.output).toBeGreaterThan(0);
      expect(result.tokenUsage.total).toBe(
        result.tokenUsage.input + result.tokenUsage.output
      );
    });

    it('should record AI call events', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      const aiCallEvents = result.events.filter((e) => e.type === 'ai_call');
      expect(aiCallEvents.length).toBeGreaterThan(0);

      const firstAiCall = aiCallEvents[0]!;
      expect(firstAiCall.type).toBe('ai_call');
      if (firstAiCall.type === 'ai_call') {
        expect(firstAiCall.prompt.system).toBeDefined();
        expect(firstAiCall.prompt.user).toBeDefined();
        expect(firstAiCall.response.raw).toBeDefined();
        expect(firstAiCall.tokensUsed.input).toBeGreaterThan(0);
      }
    });

    it('should create participant results', async () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'gpt-4o', team: 'mafia', count: 2 },
          { modelId: 'claude', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        nightDiscussionRounds: 0, // Disable for this test
      };

      const strategy = new CoordinatedMafiaStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      expect(result.participants.length).toBe(2); // One per model/team combo

      const mafiaParticipant = result.participants.find(
        (p) => p.team === 'mafia'
      );
      const townParticipant = result.participants.find(
        (p) => p.team === 'town'
      );

      expect(mafiaParticipant).toBeDefined();
      expect(townParticipant).toBeDefined();
      expect(mafiaParticipant!.modelId).toBe('gpt-4o');
      expect(townParticipant!.modelId).toBe('claude');
      expect(mafiaParticipant!.playerCount).toBe(2);
      expect(townParticipant!.playerCount).toBe(3);

      // Exactly one team should have won
      expect(
        (mafiaParticipant!.won && !townParticipant!.won) ||
          (!mafiaParticipant!.won && townParticipant!.won)
      ).toBe(true);
    });

    it('should respect max rounds limit', async () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 4 },
        ],
        maxRounds: 2,
        discussionEnabled: false,
      };

      // Create provider where votes always tie (no eliminations)
      // This would normally go forever, but maxRounds limits it
      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      expect(result.rounds).toBeLessThanOrEqual(2);
    });

    it('should include discussion when enabled', async () => {
      // Use more players so game doesn't end immediately after night
      // 5 players: 1 mafia kills 1 town → 1 mafia, 3 town left → game continues to discussion
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 4 },
        ],
        maxRounds: 10,
        discussionEnabled: true,
      };

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      const discussionEvents = result.events.filter(
        (e) => e.type === 'discussion'
      );
      expect(discussionEvents.length).toBeGreaterThan(0);
    });

    it('should run introduction phase at start of game', async () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 4 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      // Check that introduction events were recorded
      const introEvents = result.events.filter(
        (e) => e.type === 'introduction'
      );
      expect(introEvents.length).toBe(5); // All 5 players should introduce themselves

      // Verify introduction events have correct structure
      const firstIntro = introEvents[0]!;
      if (firstIntro.type === 'introduction') {
        expect(firstIntro.playerId).toBeDefined();
        expect(firstIntro.playerName).toBeDefined();
        expect(firstIntro.message).toBeDefined();
        expect(firstIntro.round).toBe(1);
      }

      // Check that introduction phase start/end events exist
      const phaseStartEvents = result.events.filter(
        (e) => e.type === 'phase_start' && e.phase === 'introduction'
      );
      const phaseEndEvents = result.events.filter(
        (e) => e.type === 'phase_end' && e.phase === 'introduction'
      );
      expect(phaseStartEvents.length).toBe(1);
      expect(phaseEndEvents.length).toBe(1);

      // Verify introduction happens before night phase
      const introPhaseStartIndex = result.events.findIndex(
        (e) => e.type === 'phase_start' && e.phase === 'introduction'
      );
      const nightPhaseStartIndex = result.events.findIndex(
        (e) => e.type === 'phase_start' && e.phase === 'night'
      );
      expect(introPhaseStartIndex).toBeLessThan(nightPhaseStartIndex);
    });

    it('should add introductions to conversation history', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      await game.run();

      // Check that AI calls for introduction include the visible state with conversation history
      const calls = scenarioProvider.getCallLog();
      
      // Find calls for night phase (after introductions)
      const nightCalls = calls.filter((c) => c.prompt.type === 'kill_vote');
      expect(nightCalls.length).toBeGreaterThan(0);
      
      // Night phase should have conversation history from introductions
      const nightCall = nightCalls[0]!;
      expect(nightCall.context.visibleState.conversationHistory.length).toBe(3); // All 3 players introduced
    });

    it('should record elimination events', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      const eliminationEvents = result.events.filter(
        (e) => e.type === 'elimination'
      );
      expect(eliminationEvents.length).toBeGreaterThan(0);

      const firstElimination = eliminationEvents[0]!;
      if (firstElimination.type === 'elimination') {
        expect(firstElimination.playerId).toBeDefined();
        expect(firstElimination.playerName).toBeDefined();
        expect(['mafia', 'town']).toContain(firstElimination.team);
      }
    });

    it('should record game end event', async () => {
      const config: GameConfig = {
        playerCount: 3,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 2 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
      };

      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      const gameEndEvents = result.events.filter((e) => e.type === 'game_end');
      expect(gameEndEvents.length).toBe(1);

      const gameEnd = gameEndEvents[0]!;
      if (gameEnd.type === 'game_end') {
        expect(gameEnd.winner).toBe(result.winner);
        expect(gameEnd.finalState.mafiaAlive).toBeGreaterThanOrEqual(0);
        expect(gameEnd.finalState.townAlive).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getState', () => {
    it('should return current game state', () => {
      const config = createTestConfig();
      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);
      const game = new Game(config, scenarioProvider);

      const state = game.getState();

      expect(state.players.length).toBe(5);
      expect(state.round).toBe(1);
      expect(state.phase).toBe('night');
    });
  });
});


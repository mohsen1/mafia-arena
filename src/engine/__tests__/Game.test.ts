/**
 * Main Game class tests.
 */

import { describe, it, expect } from 'vitest';
import { Game, validateConfig } from '../Game.js';
import { ScenarioMockAIProvider, FirstTargetStrategy, CoordinatedMafiaStrategy } from './mocks/MockAIProvider.js';
import type { GameConfig } from '../types.js';

describe('Game', () => {
  // Standard benchmark config: 9 players (2 mafia, 7 town)
  // This allows for multi-round games with meaningful social deduction
  const createTestConfig = (): GameConfig => ({
    playerCount: 9,
    mafiaCount: 2,
    teams: [
      { modelId: 'test-mafia', team: 'mafia', count: 2 },
      { modelId: 'test-town', team: 'town', count: 7 },
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

    it('should reject player count less than 7', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 2 },
          { modelId: 'town', team: 'town', count: 3 },
        ],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 7'))).toBe(true);
    });

    it('should reject mafia count less than 2', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 7,
        mafiaCount: 1,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 1 },
          { modelId: 'town', team: 'town', count: 6 },
        ],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 2'))).toBe(true);
    });

    it('should reject when mafia >= player count', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 7,
        mafiaCount: 7,
        teams: [{ modelId: 'mafia', team: 'mafia', count: 7 }],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Mafia count must be less than player count');
    });

    it('should reject when town does not outnumber mafia by 3', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 7,
        mafiaCount: 3,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 3 },
          { modelId: 'town', team: 'town', count: 4 }, // 4 town, 3 mafia - only +1
        ],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('outnumber mafia'))).toBe(true);
    });

    it('should reject mismatched team assignments', () => {
      const config: GameConfig = {
        ...createTestConfig(),
        playerCount: 9,
        teams: [
          { modelId: 'mafia', team: 'mafia', count: 2 },
          { modelId: 'town', team: 'town', count: 5 }, // Only 7 assigned, not 9
        ],
      };

      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("don't match player count"))).toBe(true);
    });
  });

  describe('run', () => {
    // Standard benchmark config for tests: 7 players (2 mafia, 5 town)
    const createBenchmarkConfig = (overrides?: Partial<GameConfig>): GameConfig => ({
      playerCount: 7,
      mafiaCount: 2,
      teams: [
        { modelId: 'mafia-model', team: 'mafia', count: 2 },
        { modelId: 'town-model', team: 'town', count: 5 },
      ],
      maxRounds: 10,
      discussionEnabled: false,
      ...overrides,
    });

    it('should complete a game with a winner', async () => {
      const config = createBenchmarkConfig();
      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider, { gameId: 'test-game' });
      const result = await game.run();

      expect(result.id).toBe('test-game');
      expect(result.winner).toBeDefined();
      expect(['mafia', 'town']).toContain(result.winner);
      expect(result.rounds).toBeGreaterThanOrEqual(1);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track token usage', async () => {
      const config = createBenchmarkConfig();
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
      const config = createBenchmarkConfig();
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
        playerCount: 9,
        mafiaCount: 2,
        teams: [
          { modelId: 'gpt-4o', team: 'mafia', count: 2 },
          { modelId: 'claude', team: 'town', count: 7 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        nightDiscussionRounds: 0,
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
      expect(townParticipant!.playerCount).toBe(7);

      // Exactly one team should have won
      expect(
        (mafiaParticipant!.won && !townParticipant!.won) ||
          (!mafiaParticipant!.won && townParticipant!.won)
      ).toBe(true);
    });

    it('should respect max rounds limit', async () => {
      // With 7 players (2 mafia, 5 town) and Day-first order,
      // games naturally take more rounds. Use a higher limit.
      const config = createBenchmarkConfig({ maxRounds: 5 });
      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      // Game should end at or before maxRounds
      expect(result.rounds).toBeLessThanOrEqual(5);
    });

    it('should include discussion when enabled', async () => {
      // With Day-first order, discussion happens before any deaths
      const config = createBenchmarkConfig({ discussionEnabled: true });
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
      const config = createBenchmarkConfig();
      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      const result = await game.run();

      // Check that introduction events were recorded
      const introEvents = result.events.filter(
        (e) => e.type === 'introduction'
      );
      expect(introEvents.length).toBe(7); // All 7 players should introduce themselves

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

      // Verify introduction happens before day vote phase (Day-first order)
      const introPhaseStartIndex = result.events.findIndex(
        (e) => e.type === 'phase_start' && e.phase === 'introduction'
      );
      const votePhaseStartIndex = result.events.findIndex(
        (e) => e.type === 'phase_start' && e.phase === 'day_vote'
      );
      expect(introPhaseStartIndex).toBeLessThan(votePhaseStartIndex);
    });

    it('should add introductions to conversation history', async () => {
      const config = createBenchmarkConfig();
      const strategy = new FirstTargetStrategy();
      const scenarioProvider = new ScenarioMockAIProvider(strategy);

      const game = new Game(config, scenarioProvider);
      await game.run();

      // Check AI calls include conversation history from introductions
      const calls = scenarioProvider.getCallLog();
      
      // Find calls for vote phase (after introductions, Day-first order)
      const voteCalls = calls.filter((c) => c.prompt.type === 'elimination_vote');
      expect(voteCalls.length).toBeGreaterThan(0);
      
      // Vote phase should have conversation history from introductions
      const voteCall = voteCalls[0]!;
      expect(voteCall.context.visibleState.conversationHistory.length).toBe(7); // All 7 players introduced
    });

    it('should record elimination events', async () => {
      const config = createBenchmarkConfig();
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
      const config = createBenchmarkConfig();
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

      expect(state.players.length).toBe(9); // Updated for benchmark config
      expect(state.round).toBe(1);
      expect(state.phase).toBe('night'); // Initial phase before game starts
    });
  });
});


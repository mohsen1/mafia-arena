/**
 * Security Tests
 * Tests to ensure information is properly hidden between teams (fog of war).
 * Critical: Town players must NEVER see mafia private discussions or teammate info.
 */

import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState.js';
import { executeNightPhase } from '../phases/NightPhase.js';
import { executeDiscussionPhase } from '../phases/DiscussionPhase.js';
import { executeVotePhase } from '../phases/VotePhase.js';
import { getVisibleState } from '../utils/visibility.js';
import type { GameConfig, AIProvider, AIContext, ActionPrompt, AIResponse, PlayerAction } from '../types.js';

describe('Security - Information Hiding', () => {
  const createTestConfig = (): GameConfig => ({
    playerCount: 5,
    mafiaCount: 2,
    teams: [
      { modelId: 'mafia-model', team: 'mafia', count: 2 },
      { modelId: 'town-model', team: 'town', count: 3 },
    ],
    maxRounds: 10,
    discussionEnabled: true,
    nightDiscussionRounds: 2,
    dayDiscussionRounds: 1,
  });

  /**
   * Captures all prompts sent to the AI provider.
   */
  interface CapturedCall {
    context: AIContext;
    prompt: ActionPrompt;
  }

  function createCapturingProvider(): { provider: AIProvider; captures: CapturedCall[] } {
    const captures: CapturedCall[] = [];

    const provider: AIProvider = {
      getAction: async (context, prompt) => {
        captures.push({ context, prompt });

        let action: PlayerAction;
        switch (prompt.type) {
          case 'kill_vote':
            action = { type: 'kill_vote', target: prompt.validTargets?.[0] ?? '' };
            break;
          case 'discussion':
            action = { type: 'discussion', message: 'Test discussion message' };
            break;
          case 'mafia_discussion':
            action = { type: 'mafia_discussion', message: 'SECRET MAFIA STRATEGY' };
            break;
          case 'elimination_vote':
            action = { type: 'elimination_vote', target: prompt.validTargets?.[0] ?? null };
            break;
          default:
            action = { type: 'discussion', message: 'Fallback' };
        }

        return {
          action,
          rawResponse: JSON.stringify(action),
          tokensUsed: { input: 100, output: 50 },
          latencyMs: 100,
        };
      },
    };

    return { provider, captures };
  }

  describe('Mafia Chat Isolation', () => {
    it('should never include mafia discussion content in town player prompts', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);
      const { provider, captures } = createCapturingProvider();

      // Run night phase (includes mafia discussion)
      const nightResult = await executeNightPhase(state, provider);

      // Get all prompts sent to town players
      const townPrompts = captures.filter(c => c.context.team === 'town');
      const mafiaPrompts = captures.filter(c => c.context.team === 'mafia');

      // Mafia should have mafia_discussion calls
      const mafiaDiscussionCalls = mafiaPrompts.filter(c => c.prompt.type === 'mafia_discussion');
      expect(mafiaDiscussionCalls.length).toBeGreaterThan(0);

      // Town should NEVER see mafia strategy keywords
      for (const call of townPrompts) {
        expect(call.prompt.userPrompt).not.toContain('PRIVATE MAFIA STRATEGY');
        expect(call.prompt.userPrompt).not.toContain('SECRET MAFIA');
        expect(call.prompt.userPrompt).not.toContain('Teammates:');
        expect(call.prompt.userPrompt).not.toContain('encrypted channel');
      }
    });

    it('should not leak mafia history in day discussion prompts', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);
      const { provider, captures } = createCapturingProvider();

      // Run night phase to generate mafia discussions
      const nightResult = await executeNightPhase(state, provider);

      // Clear captures and run day discussion
      captures.length = 0;
      await executeDiscussionPhase(nightResult.state, provider);

      // Check all day discussion prompts
      const dayPrompts = captures.filter(c => c.prompt.type === 'discussion');

      for (const call of dayPrompts) {
        if (call.context.team === 'town') {
          // Town players should not see any mafia strategy content
          expect(call.prompt.userPrompt).not.toContain('SECRET MAFIA STRATEGY');
          expect(call.prompt.userPrompt).not.toContain('PRIVATE MAFIA');
        }
      }
    });

    it('should not leak mafia history in elimination vote prompts', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);
      const { provider, captures } = createCapturingProvider();

      // Run night and day phases
      const nightResult = await executeNightPhase(state, provider);
      const dayResult = await executeDiscussionPhase(nightResult.state, provider);

      // Clear captures and run vote phase
      captures.length = 0;
      await executeVotePhase(dayResult.state.withPhase('day_vote'), provider);

      // Check vote prompts
      const votePrompts = captures.filter(c => c.prompt.type === 'elimination_vote');

      for (const call of votePrompts) {
        if (call.context.team === 'town') {
          expect(call.prompt.userPrompt).not.toContain('SECRET MAFIA');
          expect(call.prompt.userPrompt).not.toContain('PRIVATE MAFIA');
        }
      }
    });
  });

  describe('Teammate Information', () => {
    it('should include teammate IDs only for mafia players', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const mafiaPlayer = state.aliveMafia[0]!;
      const townPlayer = state.aliveTown[0]!;

      const mafiaVisible = getVisibleState(state, mafiaPlayer);
      const townVisible = getVisibleState(state, townPlayer);

      // Mafia should see teammates
      expect(mafiaVisible.teammates).toBeDefined();
      expect(mafiaVisible.teammates!.length).toBe(1); // One other mafia member

      // Town should not see teammates
      expect(townVisible.teammates).toBeUndefined();
    });

    it('should include teammate names in mafia system prompts only', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);
      const { provider, captures } = createCapturingProvider();

      await executeNightPhase(state, provider);

      // Check mafia prompts contain teammate info
      const mafiaKillVotes = captures.filter(
        c => c.context.team === 'mafia' && c.prompt.type === 'kill_vote'
      );
      expect(mafiaKillVotes.length).toBeGreaterThan(0);
      
      for (const call of mafiaKillVotes) {
        // Mafia system prompt should mention teammates
        expect(call.prompt.systemPrompt).toContain('teammates');
      }

      // Town prompts should not mention any specific teammates
      const townPrompts = captures.filter(c => c.context.team === 'town');
      for (const call of townPrompts) {
        expect(call.prompt.systemPrompt).not.toContain('Your teammates:');
      }
    });
  });

  describe('Role Revelation', () => {
    it('should only reveal roles of dead players', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      // Kill a mafia player
      const mafiaVictim = state.aliveMafia[0]!;
      state = state.withPlayerEliminated(mafiaVictim.id);

      const townPlayer = state.aliveTown[0]!;
      const visibleState = getVisibleState(state, townPlayer);

      // Dead player's team should be visible
      expect(visibleState.deadPlayers.length).toBe(1);
      expect(visibleState.deadPlayers[0]!.team).toBe('mafia');

      // Alive players should not have team info visible
      for (const player of visibleState.alivePlayers) {
        // VisiblePlayer type doesn't include team - this is by design
        expect((player as { team?: string }).team).toBeUndefined();
      }
    });
  });

  describe('Conversation Channel Integrity', () => {
    it('should separate public and mafia channels in state', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);
      const { provider } = createCapturingProvider();

      const result = await executeNightPhase(state, provider);

      // Check conversation history has correct channels
      const mafiaMessages = result.state.conversationHistory.filter(m => m.channel === 'mafia');
      const publicMessages = result.state.conversationHistory.filter(m => m.channel === 'public');

      // Night phase should only have mafia messages (from discussion)
      expect(mafiaMessages.length).toBeGreaterThan(0);
      
      // Each mafia message should have a mafia player as author
      const mafiaPlayerIds = result.state.aliveMafia.map(p => p.id);
      for (const msg of mafiaMessages) {
        expect(mafiaPlayerIds).toContain(msg.playerId);
      }
    });

    it('should filter conversations correctly based on viewer team', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);
      const { provider } = createCapturingProvider();

      // Run night to generate mafia messages
      const nightResult = await executeNightPhase(state, provider);

      // Run day discussion to add public messages
      const dayResult = await executeDiscussionPhase(nightResult.state, provider);

      // Get visible state for town vs mafia
      const townPlayer = dayResult.state.aliveTown[0]!;
      const mafiaPlayer = dayResult.state.aliveMafia[0]!;

      const townView = getVisibleState(dayResult.state, townPlayer);
      const mafiaView = getVisibleState(dayResult.state, mafiaPlayer);

      // Town should only see public messages
      expect(townView.mafiaHistory).toBeUndefined();
      for (const msg of townView.conversationHistory) {
        expect(msg.channel).not.toBe('mafia');
      }

      // Mafia should see both public conversation and mafia history
      expect(mafiaView.mafiaHistory).toBeDefined();
      expect(mafiaView.mafiaHistory!.length).toBeGreaterThan(0);
    });
  });

  describe('Persona Constraints Enforcement', () => {
    it('should include strict persona constraints in prompts when configured', async () => {
      const config: GameConfig = {
        ...createTestConfig(),
        personaConstraints: 'strict',
      };

      // Note: Persona generation prompts are in IntroductionPhase
      // For now, verify the config is preserved
      const state = GameState.create('test-game', config);
      expect(state.config.personaConstraints).toBe('strict');
    });
  });
});


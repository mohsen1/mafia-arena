/**
 * Error Handling Tests
 * Tests for AI provider failures, malformed responses, and graceful degradation.
 */

import { describe, it, expect } from 'vitest';
import { GameState } from '../GameState.js';
import { executeNightPhase } from '../phases/NightPhase.js';
import { executeDiscussionPhase } from '../phases/DiscussionPhase.js';
import { executeVotePhase } from '../phases/VotePhase.js';
import type { GameConfig, AIProvider, AIContext, ActionPrompt, AIResponse, PlayerAction } from '../types.js';

describe('Error Handling', () => {
  const createTestConfig = (): GameConfig => ({
    playerCount: 4,
    mafiaCount: 1,
    teams: [
      { modelId: 'mafia-model', team: 'mafia', count: 1 },
      { modelId: 'town-model', team: 'town', count: 3 },
    ],
    maxRounds: 10,
    discussionEnabled: true,
    nightDiscussionRounds: 0, // Simplified for these tests
    dayDiscussionRounds: 1,
  });

  /**
   * Creates a mock AI provider with custom behavior.
   */
  function createMockProvider(
    handler: (context: AIContext, prompt: ActionPrompt) => Promise<AIResponse> | AIResponse
  ): AIProvider {
    return {
      getAction: async (context, prompt) => handler(context, prompt),
    };
  }

  /**
   * Creates a standard valid response for a given action type.
   */
  function createValidResponse(type: ActionPrompt['type'], validTargets?: readonly string[]): AIResponse {
    let action: PlayerAction;

    switch (type) {
      case 'kill_vote':
        action = { type: 'kill_vote', target: validTargets?.[0] ?? 'player_1' };
        break;
      case 'discussion':
        action = { type: 'discussion', message: 'I have something to say.' };
        break;
      case 'mafia_discussion':
        action = { type: 'mafia_discussion', message: 'Let us target someone.' };
        break;
      case 'elimination_vote':
        action = { type: 'elimination_vote', target: validTargets?.[0] ?? null };
        break;
      case 'introduction':
        action = { type: 'introduction', message: 'Hello everyone!' };
        break;
      case 'persona_generation':
        action = {
          type: 'persona_generation',
          persona: { name: 'TestPlayer', background: 'A test character', personality: 'Analytical' },
        };
        break;
    }

    return {
      action,
      rawResponse: JSON.stringify(action),
      tokensUsed: { input: 100, output: 50 },
      latencyMs: 100,
    };
  }

  describe('AI Provider Failures', () => {
    it('should propagate AI provider errors', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const failingProvider = createMockProvider(() => {
        throw new Error('Rate limit exceeded');
      });

      // The engine currently doesn't handle errors - verify it throws
      await expect(executeNightPhase(state, failingProvider)).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle provider returning undefined action', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const brokenProvider = createMockProvider((context, prompt) => {
        return {
          action: undefined as unknown as PlayerAction, // Simulate missing action
          rawResponse: '{"invalid": true}',
          tokensUsed: { input: 100, output: 50 },
          latencyMs: 100,
        };
      });

      // Should throw or handle gracefully when action is undefined
      // Current behavior: throws on action.type access
      await expect(executeNightPhase(state, brokenProvider)).rejects.toThrow();
    });

    it('should handle provider returning null response', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const nullProvider = createMockProvider(() => {
        return null as unknown as AIResponse;
      });

      await expect(executeNightPhase(state, nullProvider)).rejects.toThrow();
    });
  });

  describe('Malformed Response Handling', () => {
    it('should handle response with wrong action type', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);
      let callCount = 0;

      const wrongTypeProvider = createMockProvider((context, prompt) => {
        callCount++;
        // Return discussion action when kill_vote is expected
        if (prompt.type === 'kill_vote') {
          return {
            action: { type: 'discussion', message: 'Wrong type!' } as unknown as PlayerAction,
            rawResponse: '{"type": "discussion", "message": "Wrong!"}',
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      const result = await executeNightPhase(state, wrongTypeProvider);

      // With wrong action type, kill vote should not register
      // Game should continue but no one gets killed
      expect(result.killed).toBeNull();
    });

    it('should handle response with missing required fields', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const incompleteProvider = createMockProvider((context, prompt) => {
        if (prompt.type === 'kill_vote') {
          return {
            action: { type: 'kill_vote' } as PlayerAction, // Missing 'target' field
            rawResponse: '{"type": "kill_vote"}',
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      const result = await executeNightPhase(state, incompleteProvider);

      // Should handle gracefully - no kill happens because target is undefined
      expect(result.killed).toBeNull();
    });

    it('should handle empty string target in kill vote', async () => {
      const config = createTestConfig();
      const state = GameState.create('test-game', config);

      const emptyTargetProvider = createMockProvider((context, prompt) => {
        if (prompt.type === 'kill_vote') {
          return {
            action: { type: 'kill_vote', target: '' },
            rawResponse: '{"type": "kill_vote", "target": ""}',
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      const result = await executeNightPhase(state, emptyTargetProvider);

      // Empty string should not match any valid target
      expect(result.killed).toBeNull();
    });
  });

  describe('Vote Validation', () => {
    it('should ignore votes for dead players', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      // Kill one player manually to create a dead player
      const deadPlayer = state.aliveTown[0]!;
      state = state.withPlayerEliminated(deadPlayer.id);

      const deadVoterProvider = createMockProvider((context, prompt) => {
        if (prompt.type === 'elimination_vote') {
          // Try to vote for the dead player
          return {
            action: { type: 'elimination_vote', target: deadPlayer.id },
            rawResponse: JSON.stringify({ type: 'elimination_vote', target: deadPlayer.id }),
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      // Run vote phase with day_vote phase
      state = state.withPhase('day_vote');
      const result = await executeVotePhase(state, deadVoterProvider);

      // The dead player should not be eliminated again
      // And the vote should be treated as invalid
      expect(result.eliminated?.id).not.toBe(deadPlayer.id);
    });

    it('should ignore self-votes during elimination', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config).withPhase('day_vote');

      const selfVoteProvider = createMockProvider((context, prompt) => {
        if (prompt.type === 'elimination_vote') {
          // Vote for self
          return {
            action: { type: 'elimination_vote', target: context.playerId },
            rawResponse: JSON.stringify({ type: 'elimination_vote', target: context.playerId }),
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      const result = await executeVotePhase(state, selfVoteProvider);

      // Self-votes should be invalid, resulting in no elimination (all votes invalid)
      expect(result.eliminated).toBeNull();
    });

    it('should ignore votes for non-existent players', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config);

      const fakeIdProvider = createMockProvider((context, prompt) => {
        if (prompt.type === 'kill_vote') {
          return {
            action: { type: 'kill_vote', target: 'player_999_does_not_exist' },
            rawResponse: '{"type": "kill_vote", "target": "player_999"}',
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      const result = await executeNightPhase(state, fakeIdProvider);

      // Invalid target should be ignored
      expect(result.killed).toBeNull();
    });

    it('should throw error when all players abstain (indicates AI failures)', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config).withPhase('day_vote');

      const abstainProvider = createMockProvider((context, prompt) => {
        if (prompt.type === 'elimination_vote') {
          return {
            action: { type: 'elimination_vote', target: null },
            rawResponse: '{"type": "elimination_vote", "target": null}',
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      // All players abstaining now throws an error (indicates AI provider failures)
      await expect(executeVotePhase(state, abstainProvider)).rejects.toThrow(
        /All \d+ alive players abstained/
      );
    });

    it('should handle mafia voting for fellow mafia members (invalid in kill vote)', async () => {
      const config: GameConfig = {
        playerCount: 5,
        mafiaCount: 2,
        teams: [
          { modelId: 'mafia-model', team: 'mafia', count: 2 },
          { modelId: 'town-model', team: 'town', count: 3 },
        ],
        maxRounds: 10,
        discussionEnabled: false,
        nightDiscussionRounds: 0,
      };

      const state = GameState.create('test-game', config);
      const mafiaPlayers = state.aliveMafia;

      const mafiaTargetMafiaProvider = createMockProvider((context, prompt) => {
        if (prompt.type === 'kill_vote') {
          // Mafia tries to kill another mafia member
          const otherMafia = mafiaPlayers.find(p => p.id !== context.playerId);
          return {
            action: { type: 'kill_vote', target: otherMafia?.id ?? 'invalid' },
            rawResponse: JSON.stringify({ type: 'kill_vote', target: otherMafia?.id }),
            tokensUsed: { input: 100, output: 50 },
            latencyMs: 100,
          };
        }
        return createValidResponse(prompt.type, prompt.validTargets);
      });

      const result = await executeNightPhase(state, mafiaTargetMafiaProvider);

      // Mafia can only kill town members, so this should be invalid
      expect(result.killed).toBeNull();
    });
  });

  describe('Token Tracking Accuracy', () => {
    it('should correctly sum tokens across all AI calls', async () => {
      const config = createTestConfig();
      let state = GameState.create('test-game', config).withPhase('day_discussion');

      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const tokenTrackingProvider = createMockProvider((context, prompt) => {
        const inputTokens = Math.floor(Math.random() * 100) + 50;
        const outputTokens = Math.floor(Math.random() * 50) + 20;
        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;

        return {
          action: { type: 'discussion', message: 'Test message' } as PlayerAction,
          rawResponse: '{"type": "discussion", "message": "Test"}',
          tokensUsed: { input: inputTokens, output: outputTokens },
          latencyMs: 100,
        };
      });

      const result = await executeDiscussionPhase(state, tokenTrackingProvider);

      // Calculate tokens from events
      const aiCallEvents = result.state.events.filter(e => e.type === 'ai_call');
      let eventInputSum = 0;
      let eventOutputSum = 0;

      for (const event of aiCallEvents) {
        if (event.type === 'ai_call') {
          eventInputSum += event.tokensUsed.input;
          eventOutputSum += event.tokensUsed.output;
        }
      }

      expect(eventInputSum).toBe(totalInputTokens);
      expect(eventOutputSum).toBe(totalOutputTokens);
    });
  });
});


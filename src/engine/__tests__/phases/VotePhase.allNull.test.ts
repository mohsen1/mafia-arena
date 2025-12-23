/**
 * Tests for VotePhase handling of all-null votes.
 * 
 * Bug: game_mjit1n00_rllnbk_live - all players voted "null" due to
 * repeated AI parse failures, game continued in broken state.
 * 
 * Fix: VotePhase now throws an error when ALL players vote null.
 */

import { describe, it, expect } from 'vitest';
import { executeVotePhase } from '../../phases/VotePhase.js';
import { GameState } from '../../GameState.js';
import type { AIProvider, AIContext, ActionPrompt, AIResponse, GameConfig } from '../../types.js';

/**
 * Mock AI provider that always returns null votes (simulating fallback behavior)
 */
class AllNullVoteProvider implements AIProvider {
  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    return {
      action: {
        type: 'elimination_vote',
        target: null,  // Always abstain (simulating fallback)
      },
      rawResponse: '[fallback - no valid response]',
      tokensUsed: { input: 100, output: 50 },
      latencyMs: 100,
    };
  }
}

/**
 * Mock AI provider that returns valid votes
 */
class NormalVoteProvider implements AIProvider {
  private validTargets: string[] = [];
  
  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    // Store valid targets for later use
    if (prompt.validTargets) {
      this.validTargets = [...prompt.validTargets];
    }
    
    // Vote for first valid target
    const target = this.validTargets.find(t => t !== context.playerId) || null;
    
    return {
      action: {
        type: 'elimination_vote',
        target,
      },
      rawResponse: JSON.stringify({ vote: target, reason: 'Test vote' }),
      tokensUsed: { input: 100, output: 50 },
      latencyMs: 100,
    };
  }
}

/**
 * Mock AI provider that returns a mix of votes and nulls
 */
class MixedVoteProvider implements AIProvider {
  private callCount = 0;
  private validTargets: string[] = [];
  
  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    this.callCount++;
    
    // Store valid targets
    if (prompt.validTargets) {
      this.validTargets = [...prompt.validTargets];
    }
    
    // Every other player votes null (abstains)
    const shouldAbstain = this.callCount % 2 === 0;
    
    if (shouldAbstain) {
      return {
        action: { type: 'elimination_vote', target: null },
        rawResponse: '[abstain]',
        tokensUsed: { input: 100, output: 50 },
        latencyMs: 100,
      };
    }
    
    // Vote for first valid target
    const target = this.validTargets.find(t => t !== context.playerId) || this.validTargets[0];
    
    return {
      action: { type: 'elimination_vote', target },
      rawResponse: JSON.stringify({ vote: target }),
      tokensUsed: { input: 100, output: 50 },
      latencyMs: 100,
    };
  }
}

function createTestGameState(): GameState {
  const config: GameConfig = {
    teams: [
      { modelId: 'test/model', team: 'mafia', count: 1 },
      { modelId: 'test/model', team: 'town', count: 5 },
    ],
    discussionRounds: 2,
    seed: 12345,
  };

  return GameState.create('test-game', config);
}

describe('VotePhase all-null detection', () => {
  it('should throw error when ALL players vote null', async () => {
    const state = createTestGameState();
    const aiProvider = new AllNullVoteProvider();

    // The vote phase should throw when all players vote null
    await expect(executeVotePhase(state, aiProvider)).rejects.toThrow(
      /All \d+ alive players abstained/
    );
  });

  it('should include helpful context in error message', async () => {
    const state = createTestGameState();
    const aiProvider = new AllNullVoteProvider();

    try {
      await executeVotePhase(state, aiProvider);
      expect.fail('Expected an error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('alive players abstained');
      expect(message).toContain('AI provider failures');
      expect(message).toContain('context overflow');
    }
  });

  it('should complete normally when at least one player votes', async () => {
    const state = createTestGameState();
    const aiProvider = new MixedVoteProvider();

    // Should complete without throwing
    const result = await executeVotePhase(state, aiProvider);
    
    // Should have a mix of valid and null votes
    const nullVoteCount = Array.from(result.votes.values()).filter(v => v === null).length;
    const validVoteCount = Array.from(result.votes.values()).filter(v => v !== null).length;
    
    expect(nullVoteCount).toBeGreaterThan(0);
    expect(validVoteCount).toBeGreaterThan(0);
  });

  it('should complete normally when all players vote for valid targets', async () => {
    const state = createTestGameState();
    const aiProvider = new NormalVoteProvider();

    const result = await executeVotePhase(state, aiProvider);
    
    // All votes should be valid (not null)
    const nullVoteCount = Array.from(result.votes.values()).filter(v => v === null).length;
    expect(nullVoteCount).toBe(0);
    
    // Someone should be eliminated (unless tie)
    // Note: with 6 players voting for potentially different targets, 
    // there could be a tie resulting in no elimination
  });
});


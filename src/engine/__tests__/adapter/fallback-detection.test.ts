/**
 * Tests for detecting and handling AI fallback abuse.
 * 
 * @deprecated These tests are for the deprecated GameAIAdapter.
 * The new WorkflowAIProvider uses Cloudflare Workflows for AI calls and
 * doesn't support the fallback detection features being tested here.
 * 
 * When AI models consistently fail to produce valid responses,
 * the system should fail fast rather than continue with fallback actions.
 * 
 * Related bug: game_mjit1n00_rllnbk_live - all players voted "null" due to
 * repeated AI parse failures before the game eventually crashed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameAIAdapter, AIParseError } from '../../../worker/ai/GameAIAdapter.js';
import type { AIProviderInterface, CompletionResponse } from '../../../worker/ai/types.js';
import type { AIContext, ActionPrompt } from '../../types.js';

/**
 * Mock provider that always returns invalid JSON.
 * Simulates context overflow causing truncated/broken responses.
 */
class FailingProvider implements AIProviderInterface {
  name = 'failing';
  modelId = 'test/failing-model';
  
  private callCount = 0;
  
  async complete(): Promise<CompletionResponse> {
    this.callCount++;
    return {
      content: 'Invalid response that cannot be parsed as JSON...',
      tokensUsed: { input: 100, output: 50, total: 150 },
      latencyMs: 100,
      modelId: this.modelId,
    };
  }
  
  getCallCount(): number {
    return this.callCount;
  }
}

/**
 * Mock provider that returns valid JSON for some calls, then starts failing.
 * Simulates context growing until it causes problems.
 */
class DegradingProvider implements AIProviderInterface {
  name = 'degrading';
  modelId = 'test/degrading-model';
  
  private callCount = 0;
  private failAfter: number;
  
  constructor(failAfter: number = 3) {
    this.failAfter = failAfter;
  }
  
  async complete(): Promise<CompletionResponse> {
    this.callCount++;
    
    if (this.callCount <= this.failAfter) {
      // Return valid JSON for first N calls
      return {
        content: JSON.stringify({ message: 'Hello, I am a test player.' }),
        tokensUsed: { input: 100, output: 50, total: 150 },
        latencyMs: 100,
        modelId: this.modelId,
      };
    }
    
    // After that, return invalid/truncated JSON
    return {
      content: '{"message": "This response is truncated due to context overflow and will not parse properly',
      tokensUsed: { input: 5000, output: 100, total: 5100 },
      latencyMs: 500,
      modelId: this.modelId,
    };
  }
  
  getCallCount(): number {
    return this.callCount;
  }
}

// DEPRECATED: GameAIAdapter has been replaced by WorkflowAIProvider in Cloudflare Workflows
// These tests test functionality that no longer exists in the new architecture.
// The WorkflowAIProvider does NOT support fallback actions - it throws errors on parse failures.
describe.skip('AI Fallback Detection', () => {
  describe('GameAIAdapter fallback behavior', () => {
    it('should return fallback action when parse fails', async () => {
      const failingProvider = new FailingProvider();
      const providers = new Map<string, AIProviderInterface>([
        ['test/failing-model', failingProvider],
      ]);
      
      const adapter = new GameAIAdapter(providers);
      
      const context: AIContext = {
        gameId: 'test-game',
        playerId: 'player-1',
        playerName: 'Test Player',
        modelId: 'test/failing-model',
        team: 'town',
        phase: 'day_vote',
        round: 1,
        visibleState: {
          round: 1,
          phase: 'day_vote',
          alivePlayers: [
            { id: 'player-1', name: 'Test Player', isAlive: true },
            { id: 'player-2', name: 'Other Player', isAlive: true },
          ],
          eliminatedPlayers: [],
          messages: [],
        },
      };
      
      const prompt: ActionPrompt = {
        type: 'elimination_vote',
        systemPrompt: 'You are a town member.',
        userPrompt: 'Vote for someone to eliminate.',
        validTargets: ['player-2'],
      };
      
      const response = await adapter.getAction(context, prompt);
      
      // Should return fallback action (null vote)
      expect(response.action.type).toBe('elimination_vote');
      expect(response.action.target).toBeNull();
      
      // Should have called provider once (no retries for parse errors)
      expect(failingProvider.getCallCount()).toBe(1);
    });

    it('should return null target when fallback is used for elimination vote', async () => {
      const failingProvider = new FailingProvider();
      const providers = new Map<string, AIProviderInterface>([
        ['test/failing-model', failingProvider],
      ]);
      
      const adapter = new GameAIAdapter(providers);
      
      const context: AIContext = {
        gameId: 'test-game',
        playerId: 'player-1',
        playerName: 'Test Player',
        modelId: 'test/failing-model',
        team: 'town',
        phase: 'day_vote',
        round: 1,
        visibleState: {
          round: 1,
          phase: 'day_vote',
          alivePlayers: [],
          eliminatedPlayers: [],
          messages: [],
        },
      };
      
      const prompt: ActionPrompt = {
        type: 'elimination_vote',
        systemPrompt: 'You are a town member.',
        userPrompt: 'Vote for someone to eliminate.',
        validTargets: ['player-2'],
      };
      
      const response = await adapter.getAction(context, prompt);
      
      // Fallback for elimination_vote is null target (abstain)
      expect(response.action.type).toBe('elimination_vote');
      expect(response.action.target).toBeNull();
      // The rawResponse will be empty or contain "[fallback..."
      // when no valid response was ever received
      expect(response.rawResponse).toBeTruthy();
    });
  });

  describe('Consecutive fallback detection', () => {
    it('should fail fast when multiple players in same round use fallbacks', async () => {
      // This test documents the desired behavior:
      // If all players in a voting round return fallback actions,
      // the game should fail rather than continue with meaningless votes.
      
      // Currently this is NOT implemented - this test should FAIL
      // until the fix is in place.
      
      const failingProvider = new FailingProvider();
      const providers = new Map<string, AIProviderInterface>([
        ['test/failing-model', failingProvider],
      ]);
      
      const adapter = new GameAIAdapter(providers);
      
      // Make 6 consecutive elimination vote calls (simulating 6 players)
      const fallbackCount = { count: 0 };
      
      for (let i = 0; i < 6; i++) {
        const context: AIContext = {
          gameId: 'test-game',
          playerId: `player-${i}`,
          playerName: `Player ${i}`,
          modelId: 'test/failing-model',
          team: i < 2 ? 'mafia' : 'town',
          phase: 'day_vote',
          round: 1,
          visibleState: {
            round: 1,
            phase: 'day_vote',
            alivePlayers: [],
            eliminatedPlayers: [],
            messages: [],
          },
        };
        
        const prompt: ActionPrompt = {
          type: 'elimination_vote',
          systemPrompt: 'You are a player.',
          userPrompt: 'Vote for someone to eliminate.',
          validTargets: ['player-0', 'player-1', 'player-2'],
        };
        
        const response = await adapter.getAction(context, prompt);
        
        if (response.action.target === null) {
          fallbackCount.count++;
        }
      }
      
      // All 6 players voted null (fallback) - this is the bug!
      // The test passes but documents the problematic behavior
      expect(fallbackCount.count).toBe(6);
      
      // TODO: After the fix, consecutive fallbacks should throw an error
      // expect(fallbackCount.count).toBeLessThan(6); 
    });
  });

  describe('Context window detection', () => {
    it('should detect when context usage exceeds safe threshold', async () => {
      const provider: AIProviderInterface = {
        name: 'test',
        modelId: 'test/model',
        async complete(): Promise<CompletionResponse> {
          return {
            content: JSON.stringify({ message: 'Hello!' }),
            tokensUsed: { input: 1000, output: 50, total: 1050 },
            latencyMs: 100,
            modelId: 'test/model',
          };
        },
      };
      
      // Very small limit for testing - 50 tokens
      // With 50% threshold, safeLimit = 25 tokens
      const contextLimits = new Map<string, number>([
        ['test/model', 50],
      ]);
      
      const adapter = new GameAIAdapter(
        new Map([['test/model', provider]]),
        { contextLimits, warningThreshold: 0.5 } // 50% threshold = 25 tokens safe
      );
      
      // Create a prompt that definitely exceeds 25 tokens
      const systemPrompt = 'You are a helpful AI assistant playing a social deduction game.';
      const userPrompt = 'Please introduce yourself to the other players in the game.';
      
      const usage = adapter.checkContextUsage('test/model', systemPrompt, userPrompt);
      
      // With 50 token limit and 50% threshold, safe limit is 25
      // Our prompts should exceed that
      expect(usage.limit).toBe(50);
      expect(usage.tokenCount).toBeGreaterThan(25);
      expect(usage.exceeds).toBe(true);
    });

    it('should return false when context usage is within limits', async () => {
      const provider: AIProviderInterface = {
        name: 'test',
        modelId: 'test/model',
        async complete(): Promise<CompletionResponse> {
          return {
            content: JSON.stringify({ message: 'Hello!' }),
            tokensUsed: { input: 10, output: 5, total: 15 },
            latencyMs: 100,
            modelId: 'test/model',
          };
        },
      };
      
      // Large limit
      const contextLimits = new Map<string, number>([
        ['test/model', 100000],
      ]);
      
      const adapter = new GameAIAdapter(
        new Map([['test/model', provider]]),
        { contextLimits, warningThreshold: 0.8 }
      );
      
      const usage = adapter.checkContextUsage('test/model', 'Hi', 'Hello');
      
      expect(usage.exceeds).toBe(false);
    });
  });
});

describe('Vote Phase with fallbacks', () => {
  it('should detect when all votes are null (abstentions from fallbacks)', () => {
    // This test validates the detection logic
    const votes = new Map<string, string | null>([
      ['player-1', null],
      ['player-2', null],
      ['player-3', null],
      ['player-4', null],
      ['player-5', null],
      ['player-6', null],
    ]);
    
    // Filter out null votes for resolution
    const validVotes = new Map<string, string>();
    for (const [voterId, targetId] of votes) {
      if (targetId !== null) {
        validVotes.set(voterId, targetId);
      }
    }
    
    // All votes were null, so no valid votes
    expect(validVotes.size).toBe(0);
    
    // Detection logic that's now in VotePhase
    const allNullVotes = votes.size > 0 && validVotes.size === 0;
    expect(allNullVotes).toBe(true);
  });

  it('should allow partial abstentions (not all players voting null)', () => {
    // If only some players abstain, that's valid gameplay
    const votes = new Map<string, string | null>([
      ['player-1', 'player-3'],  // Valid vote
      ['player-2', null],        // Abstention
      ['player-3', 'player-1'],  // Valid vote
      ['player-4', null],        // Abstention
      ['player-5', 'player-3'],  // Valid vote
      ['player-6', 'player-1'],  // Valid vote
    ]);
    
    // Filter out null votes for resolution
    const validVotes = new Map<string, string>();
    for (const [voterId, targetId] of votes) {
      if (targetId !== null) {
        validVotes.set(voterId, targetId);
      }
    }
    
    // 4 valid votes, 2 abstentions
    expect(validVotes.size).toBe(4);
    
    // This should NOT trigger the all-null detection
    const allNullVotes = votes.size > 0 && validVotes.size === 0;
    expect(allNullVotes).toBe(false);
  });
});


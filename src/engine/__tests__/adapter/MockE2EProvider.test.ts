/**
 * Tests for MockE2EProvider used in E2E testing.
 * 
 * Verifies that the mock provider returns valid JSON for all action types,
 * enabling zero-cost E2E tests without calling actual LLMs.
 */

import { describe, it, expect } from 'vitest';
import { MockE2EProvider, isTestModel } from '../../../worker/ai/providers/MockE2EProvider.js';
import type { CompletionRequest, StructuredOutputConfig } from '../../../worker/ai/types.js';
import {
  PERSONA_SCHEMA,
  MESSAGE_SCHEMA,
  KILL_VOTE_SCHEMA,
  ELIMINATION_VOTE_SCHEMA,
} from '../../../worker/ai/types.js';

describe('MockE2EProvider', () => {
  describe('isTestModel', () => {
    it('should return true for test/ prefixed models', () => {
      expect(isTestModel('test/mock-fast')).toBe(true);
      expect(isTestModel('test/town-wins')).toBe(true);
      expect(isTestModel('test/mafia-wins')).toBe(true);
    });

    it('should return false for regular models', () => {
      expect(isTestModel('openai/gpt-4o')).toBe(false);
      expect(isTestModel('anthropic/claude-3.5-sonnet')).toBe(false);
      expect(isTestModel('testing-model')).toBe(false);
    });
  });

  describe('persona_generation', () => {
    it('should return valid persona JSON', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const request: CompletionRequest = {
        systemPrompt: 'You are generating a persona.',
        userPrompt: 'Create a character persona for the game.',
        structuredOutput: { name: 'persona', schema: PERSONA_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      expect(parsed.name).toBeTruthy();
      expect(typeof parsed.name).toBe('string');
      expect(parsed.background).toBeTruthy();
      expect(parsed.personality).toBeTruthy();
    });
  });

  describe('introduction', () => {
    it('should return valid introduction message', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const request: CompletionRequest = {
        systemPrompt: 'You are a player.',
        userPrompt: 'Introduce yourself to the other players.',
        structuredOutput: { name: 'message', schema: MESSAGE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      expect(parsed.message).toBeTruthy();
      expect(typeof parsed.message).toBe('string');
    });
  });

  describe('discussion', () => {
    it('should return valid discussion message', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const request: CompletionRequest = {
        systemPrompt: 'You are a player.',
        userPrompt: 'Share your thoughts about the game.',
        structuredOutput: { name: 'message', schema: MESSAGE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      expect(parsed.message).toBeTruthy();
      expect(typeof parsed.message).toBe('string');
    });
  });

  describe('kill_vote', () => {
    it('should return valid kill vote with target from prompt', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const request: CompletionRequest = {
        systemPrompt: 'You are mafia.',
        userPrompt: 'Vote to kill one of: player_1, player_2, player_3',
        structuredOutput: { name: 'kill_vote', schema: KILL_VOTE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      expect(parsed.target).toBeTruthy();
      expect(parsed.target).toMatch(/^player_\d+$/);
      expect(['player_1', 'player_2', 'player_3']).toContain(parsed.target);
    });

    it('should return first available target', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const request: CompletionRequest = {
        systemPrompt: 'You are mafia.',
        userPrompt: 'Available targets: player_5, player_7, player_2',
        structuredOutput: { name: 'kill_vote', schema: KILL_VOTE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      // Should pick the first one found in the prompt
      expect(parsed.target).toBe('player_5');
    });
  });

  describe('elimination_vote', () => {
    it('should return valid elimination vote', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const request: CompletionRequest = {
        systemPrompt: 'You are a player.',
        userPrompt: 'Vote to eliminate: player_1, player_2',
        structuredOutput: { name: 'elimination_vote', schema: ELIMINATION_VOTE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      expect(parsed.vote).toBeTruthy();
      expect(['player_1', 'player_2']).toContain(parsed.vote);
    });

    it('should never return null vote (to avoid all-null error)', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      // Even with no valid targets in prompt, should return something
      const request: CompletionRequest = {
        systemPrompt: 'You are a player.',
        userPrompt: 'Vote to eliminate someone.',
        structuredOutput: { name: 'elimination_vote', schema: ELIMINATION_VOTE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      // Should have a vote (possibly default)
      expect(parsed.vote).toBeTruthy();
    });
  });

  describe('scenarios', () => {
    it('test/mock-fast returns consistent responses', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const request: CompletionRequest = {
        systemPrompt: 'Test',
        userPrompt: 'Generate persona',
        structuredOutput: { name: 'persona', schema: PERSONA_SCHEMA, strict: true },
      };

      const response1 = await provider.complete(request);
      const response2 = await provider.complete(request);

      // Both should be valid JSON
      expect(() => JSON.parse(response1.content)).not.toThrow();
      expect(() => JSON.parse(response2.content)).not.toThrow();
    });

    it('test/town-wins returns valid responses', async () => {
      const provider = new MockE2EProvider('test/town-wins');
      
      const request: CompletionRequest = {
        systemPrompt: 'Vote',
        userPrompt: 'Vote: player_1, player_2',
        structuredOutput: { name: 'elimination_vote', schema: ELIMINATION_VOTE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      expect(parsed.vote).toBeTruthy();
    });

    it('test/mafia-wins returns valid responses', async () => {
      const provider = new MockE2EProvider('test/mafia-wins');
      
      const request: CompletionRequest = {
        systemPrompt: 'Vote',
        userPrompt: 'Vote: player_1, player_2',
        structuredOutput: { name: 'elimination_vote', schema: ELIMINATION_VOTE_SCHEMA, strict: true },
      };

      const response = await provider.complete(request);
      const parsed = JSON.parse(response.content);

      expect(parsed.vote).toBeTruthy();
    });
  });

  describe('response metadata', () => {
    it('should return mock token counts', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const response = await provider.complete({
        systemPrompt: 'Test',
        userPrompt: 'Test',
      });

      expect(response.tokensUsed.input).toBeGreaterThan(0);
      expect(response.tokensUsed.output).toBeGreaterThan(0);
      expect(response.tokensUsed.total).toBe(
        response.tokensUsed.input + response.tokensUsed.output
      );
    });

    it('should return very low latency', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const response = await provider.complete({
        systemPrompt: 'Test',
        userPrompt: 'Test',
      });

      expect(response.latencyMs).toBeLessThan(100); // Should be ~5ms
    });

    it('should include model ID in response', async () => {
      const provider = new MockE2EProvider('test/mock-fast');
      
      const response = await provider.complete({
        systemPrompt: 'Test',
        userPrompt: 'Test',
      });

      expect(response.modelId).toBe('test/mock-fast');
    });
  });
});




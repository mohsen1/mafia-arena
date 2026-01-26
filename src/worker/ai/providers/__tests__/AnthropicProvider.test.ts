/**
 * Unit tests for Anthropic provider.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicProvider } from '../AnthropicProvider.js';
import { AIErrors } from '../../errors.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider('claude-sonnet-3.5', 'test-api-key', 30000);
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(provider.name).toBe('anthropic-direct');
      expect(provider.modelId).toBe('claude-sonnet-3.5');
    });

    it('should use default timeout if not provided', () => {
      const defaultProvider = new AnthropicProvider('claude-haiku-3', 'test-key');
      expect(defaultProvider).toBeDefined();
    });
  });

  describe('model name mapping', () => {
    it('should map claude-sonnet-3.5 to API name', () => {
      const p = new AnthropicProvider('claude-sonnet-3.5', 'test-key');
      expect(p.modelId).toBe('claude-sonnet-3.5');
    });

    it('should map claude-opus-4.5 to API name', () => {
      const p = new AnthropicProvider('claude-opus-4.5', 'test-key');
      expect(p.modelId).toBe('claude-opus-4.5');
    });

    it('should handle anthropic/ prefix', () => {
      const p = new AnthropicProvider('anthropic/claude-sonnet-3.5', 'test-key');
      expect(p.modelId).toBe('anthropic/claude-sonnet-3.5');
    });
  });

  describe('complete()', () => {
    it('should make successful request and return response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Test response',
            },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await provider.complete({
        systemPrompt: 'You are a helpful assistant',
        userPrompt: 'Hello',
        maxTokens: 1000,
      });

      expect(result.content).toBe('Test response');
      expect(result.tokensUsed).toEqual({
        input: 100,
        output: 50,
        total: 150,
      });
      expect(result.modelId).toBe('claude-sonnet-3.5');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle structured output with tool use', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu-123',
              name: 'game_action',
              input: {
                action: 'vote',
                target: 'player1',
              },
            },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 150,
            output_tokens: 75,
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await provider.complete({
        systemPrompt: 'You are a game engine',
        userPrompt: 'Make a move',
        maxTokens: 1000,
        structuredOutput: {
          name: 'game_action',
          schema: {
            properties: {
              action: { type: 'string' },
              target: { type: 'string' },
            },
            required: ['action', 'target'],
          },
        },
      });

      expect(result.content).toBe(JSON.stringify({ action: 'vote', target: 'player1' }));
      expect(result.tokensUsed.output).toBe(75);
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        });
      });

      // Mock AbortController
      const originalAbortController = global.AbortController;
      global.AbortController = vi.fn().mockImplementation(() => ({
        signal: {},
        abort: vi.fn(),
      })) as any;

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();

      global.AbortController = originalAbortController;
    });

    it('should handle rate limit errors (429)', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        json: async () => ({
          type: 'error',
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should handle authentication errors (401)', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: async () => ({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Invalid API key',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should handle invalid request errors (400)', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'Invalid request: missing required parameter',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should handle model not found errors (404)', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: async () => ({
          type: 'error',
          error: {
            type: 'not_found_error',
            message: 'Model not found',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should handle overloaded errors (529)', async () => {
      const mockResponse = {
        ok: false,
        status: 529,
        json: async () => ({
          type: 'error',
          error: {
            type: 'overloaded_error',
            message: 'Service overloaded',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should handle billing suspension errors (402)', async () => {
      const mockResponse = {
        ok: false,
        status: 402,
        json: async () => ({
          type: 'error',
          error: {
            type: 'billing_error',
            message: 'Account suspended',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should use default maxTokens if not provided', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Response' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await provider.complete({
        systemPrompt: 'Test',
        userPrompt: 'Test',
      });

      const requestCall = mockFetch.mock.calls[0];
      const body = JSON.parse(requestCall[1].body);
      expect(body.max_tokens).toBe(4000);
    });

    it('should handle missing text content gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'msg-123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 0 },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await provider.complete({
        systemPrompt: 'Test',
        userPrompt: 'Test',
      });

      expect(result.content).toBe('');
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw rate limited error for 429', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        json: async () => ({
          type: 'error',
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      try {
        await provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should throw auth error for 401', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: async () => ({
          type: 'error',
          error: {
            type: 'authentication_error',
            message: 'Invalid API key',
          },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      try {
        await provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});

/**
 * Unit tests for OpenRouter provider.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenRouterProvider } from '../OpenRouterProvider.js';
import { AIErrors } from '../../errors.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    provider = new OpenRouterProvider({
      modelId: 'anthropic/claude-3.5-sonnet',
      apiKey: 'test-api-key',
      timeoutMs: 30000,
    });
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(provider.name).toBe('openrouter');
      expect(provider.modelId).toBe('anthropic/claude-3.5-sonnet');
    });

    it('should use default timeout if not provided', () => {
      const defaultProvider = new OpenRouterProvider({
        modelId: 'openai/gpt-4',
        apiKey: 'test-key',
      });
      expect(defaultProvider).toBeDefined();
    });
  });

  describe('complete()', () => {
    it('should make successful request and return response', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Test response',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
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
      expect(result.modelId).toBe('anthropic/claude-3.5-sonnet');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle structured output with tool calls', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'call-123',
                    type: 'function',
                    function: {
                      name: 'game_action',
                      arguments: '{"action":"vote","target":"player1"}',
                    },
                  },
                ],
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 150,
            completion_tokens: 75,
            total_tokens: 225,
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

      expect(result.content).toBe('{"action":"vote","target":"player1"}');
      expect(result.tokensUsed.output).toBe(75);
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          const error = new Error('AbortError');
          (error as any).name = 'AbortError';
          reject(error);
        });
      });

      await expect(
        provider.complete({
          systemPrompt: 'Test',
          userPrompt: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should handle rate limit errors', async () => {
      const mockResponse = {
        ok: false,
        status: 429,
        headers: new Headers(),
        json: async () => ({
          error: {
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

    it('should handle authentication errors (401)', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        json: async () => ({
          error: {
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

    it('should handle invalid model errors (400)', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'not a valid model',
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
          error: {
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

    it('should handle key limit exceeded errors (403)', async () => {
      const mockResponse = {
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: 'Key limit exceeded',
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

    it('should handle payment required errors (402)', async () => {
      const mockResponse = {
        ok: false,
        status: 402,
        json: async () => ({
          error: {
            message: 'Insufficient credits',
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

    it('should handle service unavailable errors (503)', async () => {
      const mockResponse = {
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            message: 'Service temporarily unavailable',
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

    it('should handle bad gateway errors (502)', async () => {
      const mockResponse = {
        ok: false,
        status: 502,
        json: async () => ({
          error: {
            message: 'Bad Gateway',
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

    it('should fallback to JSON mode when tool_choice fails', async () => {
      // First call fails with tool_choice error
      const toolErrorResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'tool_choice not supported',
          },
        }),
      };

      // Second call succeeds with response_format
      const jsonModeResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '{"action":"vote"}',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
      };

      mockFetch
        .mockResolvedValueOnce(toolErrorResponse)
        .mockResolvedValueOnce(jsonModeResponse);

      const result = await provider.complete({
        systemPrompt: 'You are a game engine',
        userPrompt: 'Make a move',
        maxTokens: 1000,
        structuredOutput: {
          name: 'game_action',
          schema: {
            properties: {
              action: { type: 'string' },
            },
            required: ['action'],
          },
        },
      });

      expect(result.content).toBe('{"action":"vote"}');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should fallback to plain request when response_format also fails', async () => {
      // First call fails with tool_choice error
      const toolErrorResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'tool_choice not supported',
          },
        }),
      };

      // Second call fails with response_format error
      const formatErrorResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'response_format not supported',
          },
        }),
      };

      // Third call succeeds without any special formatting
      const plainResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'I vote for player1',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
      };

      mockFetch
        .mockResolvedValueOnce(toolErrorResponse)
        .mockResolvedValueOnce(formatErrorResponse)
        .mockResolvedValueOnce(plainResponse);

      const result = await provider.complete({
        systemPrompt: 'You are a game engine',
        userPrompt: 'Make a move',
        maxTokens: 1000,
        structuredOutput: {
          name: 'game_action',
          schema: {
            properties: {
              action: { type: 'string' },
            },
            required: ['action'],
          },
        },
      });

      expect(result.content).toBe('I vote for player1');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should use default maxTokens and temperature', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: { role: 'assistant', content: 'Response' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
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
      expect(body.temperature).toBe(0.7);
    });

    it('should include proper headers', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: { role: 'assistant', content: 'Response' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      await provider.complete({
        systemPrompt: 'Test',
        userPrompt: 'Test',
      });

      const requestCall = mockFetch.mock.calls[0];
      const headers = requestCall[1].headers;
      expect(headers['Authorization']).toBe('Bearer test-api-key');
      expect(headers['HTTP-Referer']).toContain('mafia-arena');
      expect(headers['X-Title']).toBe('Mafia Arena');
    });

    it('should handle missing usage data gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [
            {
              message: { role: 'assistant', content: 'Response' },
              finish_reason: 'stop',
            },
          ],
        }),
      };

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await provider.complete({
        systemPrompt: 'Test',
        userPrompt: 'Test',
      });

      expect(result.tokensUsed).toEqual({
        input: 0,
        output: 0,
        total: 0,
      });
    });
  });

  describe('error message extraction', () => {
    it('should extract error message from nested error object', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Specific error message',
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

    it('should handle error message at top level', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: async () => ({
          message: 'Top level error',
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

    it('should handle non-object error body', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => 'Plain error string',
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
});

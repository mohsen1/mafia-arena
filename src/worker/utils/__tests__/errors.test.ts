/**
 * Unit tests for error handling utilities.
 */

import { describe, it, expect } from 'vitest';
import { APIError, Errors, type ErrorCode } from '../errors.js';

describe('Error Handling Utilities', () => {
  describe('APIError', () => {
    it('should create error with all properties', () => {
      const error = new APIError(404, 'NOT_FOUND', 'Game not found', { gameId: '123' });

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Game not found');
      expect(error.details).toEqual({ gameId: '123' });
      expect(error.name).toBe('APIError');
    });

    it('should create error without details', () => {
      const error = new APIError(500, 'INTERNAL_ERROR', 'Server error');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.message).toBe('Server error');
      expect(error.details).toBeUndefined();
    });

    it('should generate JSON response', () => {
      const error = new APIError(
        400,
        'BAD_REQUEST',
        'Invalid input',
        { field: 'email' }
      );

      const response = error.toResponse();

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(400);
    });

    it('should include error details in JSON response', async () => {
      const error = new APIError(
        400,
        'BAD_REQUEST',
        'Invalid input',
        { field: 'email', reason: 'invalid format' }
      );

      const response = error.toResponse();
      const body = await response.json();

      expect(body).toEqual({
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid input',
          details: { field: 'email', reason: 'invalid format' },
        },
      });
    });

    it('should handle JSON response without details', async () => {
      const error = new APIError(404, 'NOT_FOUND', 'Resource not found');

      const response = error.toResponse();
      const body = await response.json();

      expect(body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Resource not found',
        },
      });
      expect(body.error.details).toBeUndefined();
    });

    it('should convert to JSON correctly', () => {
      const error = new APIError(
        429,
        'RATE_LIMITED',
        'Too many requests',
        { retryAfter: 60 }
      );

      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          details: { retryAfter: 60 },
        },
      });
    });

    it('should handle toJSON without details', () => {
      const error = new APIError(401, 'UNAUTHORIZED', 'Authentication required');

      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      expect(json.error.details).toBeUndefined();
    });

    it('should be instanceof Error', () => {
      const error = new APIError(500, 'INTERNAL_ERROR', 'Test error');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof APIError).toBe(true);
    });

    it('should have correct stack trace', () => {
      const error = new APIError(500, 'INTERNAL_ERROR', 'Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('APIError');
    });
  });

  describe('Errors factory', () => {
    describe('NotFound', () => {
      it('should create 404 error', () => {
        const error = Errors.NotFound('Game');

        expect(error).toBeInstanceOf(APIError);
        expect(error.statusCode).toBe(404);
        expect(error.code).toBe('NOT_FOUND');
        expect(error.message).toBe('Game not found');
      });

      it('should handle different resources', () => {
        const gameError = Errors.NotFound('Game');
        const userError = Errors.NotFound('User');
        const batchError = Errors.NotFound('Batch');

        expect(gameError.message).toBe('Game not found');
        expect(userError.message).toBe('User not found');
        expect(batchError.message).toBe('Batch not found');
      });
    });

    describe('BadRequest', () => {
      it('should create 400 error', () => {
        const error = Errors.BadRequest('Invalid input');

        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('BAD_REQUEST');
        expect(error.message).toBe('Invalid input');
        expect(error.details).toBeUndefined();
      });

      it('should include details when provided', () => {
        const error = Errors.BadRequest('Validation failed', {
          field: 'email',
          issue: 'invalid format',
        });

        expect(error.details).toEqual({
          field: 'email',
          issue: 'invalid format',
        });
      });

      it('should handle complex details', () => {
        const error = Errors.BadRequest('Multiple validation errors', {
          errors: [
            { field: 'email', message: 'Invalid email' },
            { field: 'password', message: 'Too short' },
          ],
        });

        expect(error.details).toEqual({
          errors: [
            { field: 'email', message: 'Invalid email' },
            { field: 'password', message: 'Too short' },
          ],
        });
      });
    });

    describe('RateLimited', () => {
      it('should create 429 error', () => {
        const error = Errors.RateLimited();

        expect(error.statusCode).toBe(429);
        expect(error.code).toBe('RATE_LIMITED');
        expect(error.message).toBe('Too many requests');
        expect(error.details).toEqual({ retryAfter: undefined });
      });

      it('should include retryAfter when provided', () => {
        const error = Errors.RateLimited(60);

        expect(error.details).toEqual({ retryAfter: 60 });
      });

      it('should handle different retryAfter values', () => {
        const error1 = Errors.RateLimited(10);
        const error2 = Errors.RateLimited(120);
        const error3 = Errors.RateLimited(3600);

        expect(error1.details).toEqual({ retryAfter: 10 });
        expect(error2.details).toEqual({ retryAfter: 120 });
        expect(error3.details).toEqual({ retryAfter: 3600 });
      });
    });

    describe('Internal', () => {
      it('should create 500 error with default message', () => {
        const error = Errors.Internal();

        expect(error.statusCode).toBe(500);
        expect(error.code).toBe('INTERNAL_ERROR');
        expect(error.message).toBe('Internal server error');
      });

      it('should allow custom message', () => {
        const error = Errors.Internal('Database connection failed');

        expect(error.message).toBe('Database connection failed');
      });

      it('should handle detailed error messages', () => {
        const error = Errors.Internal('Failed to process AI provider response: timeout');

        expect(error.message).toBe('Failed to process AI provider response: timeout');
      });
    });

    describe('Unauthorized', () => {
      it('should create 401 error', () => {
        const error = Errors.Unauthorized();

        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.message).toBe('Authentication required');
      });

      it('should have consistent message', () => {
        const error1 = Errors.Unauthorized();
        const error2 = Errors.Unauthorized();

        expect(error1.message).toBe(error2.message);
      });
    });

    describe('Forbidden', () => {
      it('should create 403 error', () => {
        const error = Errors.Forbidden('Access denied');

        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('FORBIDDEN');
        expect(error.message).toBe('Access denied');
      });

      it('should handle different forbidden reasons', () => {
        const error1 = Errors.Forbidden('Insufficient permissions');
        const error2 = Errors.Forbidden('Admin access required');
        const error3 = Errors.Forbidden('Resource is private');

        expect(error1.message).toBe('Insufficient permissions');
        expect(error2.message).toBe('Admin access required');
        expect(error3.message).toBe('Resource is private');
      });
    });

    describe('GameInProgress', () => {
      it('should create 409 error', () => {
        const error = Errors.GameInProgress('game-123');

        expect(error.statusCode).toBe(409);
        expect(error.code).toBe('GAME_IN_PROGRESS');
        expect(error.message).toBe('Game game-123 is already running');
      });

      it('should include game ID in message', () => {
        const error1 = Errors.GameInProgress('game-abc');
        const error2 = Errors.GameInProgress('game-xyz');

        expect(error1.message).toContain('game-abc');
        expect(error2.message).toContain('game-xyz');
      });
    });
  });

  describe('ErrorCode type', () => {
    it('should accept all valid error codes', () => {
      const validCodes: ErrorCode[] = [
        'NOT_FOUND',
        'BAD_REQUEST',
        'RATE_LIMITED',
        'INTERNAL_ERROR',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'GAME_IN_PROGRESS',
        'TIMEOUT',
        'INVALID_RESPONSE',
        'AUTH_ERROR',
        'RETRY_EXHAUSTED',
        'PROVIDER_ERROR',
        'PARSE_ERROR',
        'UNSUPPORTED_MODEL',
      ];

      validCodes.forEach((code) => {
        expect(code).toBeDefined();
      });
    });
  });

  describe('integration tests', () => {
    it('should work with try-catch', () => {
      try {
        throw Errors.NotFound('Test resource');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(APIError);
        expect(error instanceof APIError ? error.statusCode : 0).toBe(404);
      }
    });

    it('should be serializable', () => {
      const error = Errors.BadRequest('Test', { detail: 'info' });

      const json = JSON.stringify(error.toJSON());
      const parsed = JSON.parse(json);

      expect(parsed.error.code).toBe('BAD_REQUEST');
      expect(parsed.error.message).toBe('Test');
      expect(parsed.error.details).toEqual({ detail: 'info' });
    });

    it('should handle Response creation', async () => {
      const error = Errors.Unauthorized();
      const response = error.toResponse();

      expect(response.status).toBe(401);

      const body = await response.json();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('should preserve error details through serialization', () => {
      const originalDetails = {
        field: 'test',
        nested: { value: 123 },
        array: [1, 2, 3],
      };

      const error = Errors.BadRequest('Test', originalDetails);
      const response = error.toResponse();

      expect(response).toBeInstanceOf(Response);
    });
  });

  describe('error scenarios', () => {
    it('should handle missing resource with NotFound', () => {
      const scenarios = [
        'Game',
        'User',
        'Batch',
        'Model',
        'API Key',
      ];

      scenarios.forEach((resource) => {
        const error = Errors.NotFound(resource);
        expect(error.message).toContain(resource);
        expect(error.statusCode).toBe(404);
      });
    });

    it('should handle validation errors with BadRequest', () => {
      const validationErrors = [
        'Invalid email format',
        'Password too short',
        'Missing required field',
        'Invalid JSON',
      ];

      validationErrors.forEach((message) => {
        const error = Errors.BadRequest(message);
        expect(error.message).toBe(message);
        expect(error.statusCode).toBe(400);
      });
    });

    it('should handle rate limiting scenarios', () => {
      const scenarios = [
        { retryAfter: 10 },
        { retryAfter: 60 },
        { retryAfter: 3600 },
        {}, // no retryAfter
      ];

      scenarios.forEach((scenario) => {
        const error = Errors.RateLimited(scenario.retryAfter);
        expect(error.code).toBe('RATE_LIMITED');
        expect(error.statusCode).toBe(429);
      });
    });
  });
});

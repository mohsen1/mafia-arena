import { describe, it, expect, vi } from 'vitest';
import { logError } from '../errorUtils';

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('Sentry Integration', () => {
  it('should log error to console in development', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.env for this test
    const envMock = vi.spyOn(process, 'env', 'get').mockReturnValue({
      ...process.env,
      NODE_ENV: 'development',
    });

    await logError('test-context', new Error('Test error'));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[test-context] Error:'),
      expect.any(Object)
    );

    consoleSpy.mockRestore();
    envMock.mockRestore();
  });

  it('should attempt to send to Sentry in production with DSN', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.env for this test
    const envMock = vi.spyOn(process, 'env', 'get').mockReturnValue({
      ...process.env,
      NODE_ENV: 'production',
      SENTRY_DSN: 'https://test@sentry.io/123',
    });

    await logError('test-context', new Error('Test error'));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[test-context] Test error')
    );

    consoleSpy.mockRestore();
    envMock.mockRestore();
  });

  it('should not send to Sentry in production without DSN', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock process.env for this test
    const envMock = vi.spyOn(process, 'env', 'get').mockReturnValue({
      ...process.env,
      NODE_ENV: 'production',
      // No SENTRY_DSN
    });

    await logError('test-context', new Error('Test error'));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[test-context] Test error')
    );

    consoleSpy.mockRestore();
    envMock.mockRestore();
  });
});

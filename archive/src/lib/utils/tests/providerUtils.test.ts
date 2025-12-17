import { describe, expect, it, vi } from 'vitest';
import { getEnvAvailableProviders } from '../providerUtils';

describe('providerUtils', () => {
  describe('getEnvAvailableProviders', () => {
    it('should include Ollama in development environment', () => {
      // Mock NODE_ENV to be development
      vi.stubEnv('NODE_ENV', 'development');

      const providers = getEnvAvailableProviders();
      const ollamaProvider = providers.find((p) => p.value === 'ollama_local');

      expect(ollamaProvider).toBeDefined();
      expect(ollamaProvider?.title).toBe('Local Ollama');
    });

    it('should exclude Ollama in production environment', () => {
      // Mock NODE_ENV to be production
      vi.stubEnv('NODE_ENV', 'production');

      const providers = getEnvAvailableProviders();
      const ollamaProvider = providers.find((p) => p.value === 'ollama_local');

      expect(ollamaProvider).toBeUndefined();
    });

    it('should exclude Ollama in test environment', () => {
      // Mock NODE_ENV to be test
      vi.stubEnv('NODE_ENV', 'test');

      const providers = getEnvAvailableProviders();
      const ollamaProvider = providers.find((p) => p.value === 'ollama_local');

      expect(ollamaProvider).toBeUndefined();
    });
  });
});

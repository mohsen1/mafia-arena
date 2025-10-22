import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, validateApiKeyFormat } from '@/lib/crypto';

describe('API Key Functionality', () => {
  describe('validateApiKeyFormat', () => {
    it('should validate OpenAI API key format', () => {
      expect(
        validateApiKeyFormat('openai', 'sk-1234567890abcdef1234567890abcdef1234567890abcdef')
      ).toBe(true);
      expect(validateApiKeyFormat('openai', 'invalid-key')).toBe(false);
      expect(validateApiKeyFormat('openai', 'sk-short')).toBe(false);
    });

    it('should validate Anthropic API key format', () => {
      expect(
        validateApiKeyFormat(
          'anthropic',
          'sk-ant-api03-1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
        )
      ).toBe(true);
      expect(validateApiKeyFormat('anthropic', 'sk-1234567890abcdef')).toBe(
        false
      );
    });

    it('should validate Groq API key format', () => {
      expect(
        validateApiKeyFormat('groq', 'gsk_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
      ).toBe(true);
      expect(validateApiKeyFormat('groq', 'sk-1234567890abcdef')).toBe(false);
    });

    it('should validate Gemini API key format', () => {
      expect(
        validateApiKeyFormat(
          'gemini',
          'AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz123456789'
        )
      ).toBe(true);
      expect(validateApiKeyFormat('gemini', 'invalid-key')).toBe(false);
    });

    it('should validate unknown provider with basic length check', () => {
      expect(validateApiKeyFormat('unknown', '1234567890abcdef')).toBe(true);
      expect(validateApiKeyFormat('unknown', 'short')).toBe(false);
    });
  });

  describe('encrypt/decrypt functions', () => {
    it('should encrypt and decrypt text correctly', () => {
      const originalText = 'sk-1234567890abcdef1234567890abcdef';
      const encrypted = encrypt(originalText);
      const decrypted = decrypt(encrypted);

      expect(encrypted).not.toBe(originalText);
      expect(encrypted).toContain(':'); // IV should be prepended
      expect(decrypted).toBe(originalText);
    });

    it('should handle empty strings', () => {
      expect(encrypt('')).toBe('');
      expect(decrypt('')).toBe('');
    });

    it('should handle invalid encrypted data gracefully', () => {
      expect(decrypt('invalid-encrypted-data')).toBe('');
      expect(decrypt('no-colon-separator')).toBe('');
    });
  });
});

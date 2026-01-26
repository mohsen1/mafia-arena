/**
 * Unit tests for cryptographic utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  encryptKey,
  decryptKey,
  createFingerprint,
  validateEncryptionSecret,
  type EncryptedKey,
} from '../crypto.js';

describe('Cryptographic Utilities', () => {
  const TEST_SECRET = 'test-encryption-secret-32-characters-long';
  const TEST_API_KEY = 'sk-test-api-key-1234567890abcdef';

  describe('encryptKey', () => {
    it('should encrypt an API key', async () => {
      const result = await encryptKey(TEST_API_KEY, TEST_SECRET);

      expect(result).toBeDefined();
      expect(result.encrypted).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.fingerprint).toBeDefined();
      expect(result.encrypted).not.toBe(TEST_API_KEY);
      expect(result.iv).not.toBe('');
    });

    it('should generate unique IV for each encryption', async () => {
      const result1 = await encryptKey(TEST_API_KEY, TEST_SECRET);
      const result2 = await encryptKey(TEST_API_KEY, TEST_SECRET);

      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });

    it('should create fingerprint with correct format', async () => {
      const result = await encryptKey(TEST_API_KEY, TEST_SECRET);

      expect(result.fingerprint).toBe('sk-t...cdef');
    });

    it('should handle short API keys', async () => {
      const shortKey = 'ABC123';
      const result = await encryptKey(shortKey, TEST_SECRET);

      expect(result.fingerprint).toBe('ABC***123');
    });

    it('should handle keys with special characters', async () => {
      const specialKey = 'sk-test_key-with/special@chars#123';
      const result = await encryptKey(specialKey, TEST_SECRET);

      expect(result.fingerprint).toBe('sk-t...#123');
      expect(result.encrypted).toBeDefined();
    });

    it('should handle very long API keys', async () => {
      const longKey = 'sk-' + 'a'.repeat(100) + 'xyz789';
      const result = await encryptKey(longKey, TEST_SECRET);

      expect(result.fingerprint).toBe('sk-a...z789');
      expect(result.encrypted).toBeDefined();
    });

    it('should handle Google API key format', async () => {
      const googleKey = 'AIzaSyABC123xyz789DEF456';
      const result = await encryptKey(googleKey, TEST_SECRET);

      expect(result.fingerprint).toBe('AIza...F456');
    });
  });

  describe('decryptKey', () => {
    it('should decrypt an encrypted key', async () => {
      const encrypted = await encryptKey(TEST_API_KEY, TEST_SECRET);
      const decrypted = await decryptKey(encrypted.encrypted, encrypted.iv, TEST_SECRET);

      expect(decrypted).toBe(TEST_API_KEY);
    });

    it('should handle multiple encryption/decryption cycles', async () => {
      let key = TEST_API_KEY;

      for (let i = 0; i < 5; i++) {
        const encrypted = await encryptKey(key, TEST_SECRET);
        key = await decryptKey(encrypted.encrypted, encrypted.iv, TEST_SECRET);
      }

      expect(key).toBe(TEST_API_KEY);
    });

    it('should fail with wrong secret', async () => {
      const encrypted = await encryptKey(TEST_API_KEY, TEST_SECRET);

      await expect(
        decryptKey(encrypted.encrypted, encrypted.iv, 'wrong-secret' + TEST_SECRET)
      ).rejects.toThrow();
    });

    it('should fail with wrong IV', async () => {
      const encrypted = await encryptKey(TEST_API_KEY, TEST_SECRET);
      const wrongIv = Buffer.from(encrypted.iv).reverse().toString('base64');

      await expect(decryptKey(encrypted.encrypted, wrongIv, TEST_SECRET)).rejects.toThrow();
    });

    it('should fail with corrupted data', async () => {
      const encrypted = await encryptKey(TEST_API_KEY, TEST_SECRET);
      const corruptedData = encrypted.encrypted.slice(0, -10) + 'corrupted';

      await expect(decryptKey(corruptedData, encrypted.iv, TEST_SECRET)).rejects.toThrow();
    });

    it('should fail with empty encrypted string', async () => {
      await expect(decryptKey('', 'some-iv', TEST_SECRET)).rejects.toThrow();
    });

    it('should fail with empty IV', async () => {
      const encrypted = await encryptKey(TEST_API_KEY, TEST_SECRET);

      await expect(decryptKey(encrypted.encrypted, '', TEST_SECRET)).rejects.toThrow();
    });

    it('should fail with invalid base64', async () => {
      await expect(decryptKey('not-valid-base64!!!', 'also-invalid', TEST_SECRET)).rejects.toThrow();
    });
  });

  describe('createFingerprint', () => {
    it('should create fingerprint for standard API key', () => {
      const result = createFingerprint('sk-proj-abc123xyz789');

      expect(result).toBe('sk-p...z789');
    });

    it('should create fingerprint for Google API key', () => {
      const result = createFingerprint('AIzaSyABC123xyz789');

      expect(result).toBe('AIza...z789');
    });

    it('should handle very short keys', () => {
      const result = createFingerprint('ABC123');

      expect(result).toBe('ABC***123');
    });

    it('should handle medium length keys', () => {
      const result = createFingerprint('my-secret-key-123');

      expect(result).toBe('my-s...-123');
    });

    it('should handle exact 10 character keys', () => {
      const result = createFingerprint('0123456789');

      expect(result).toBe('012***789');
    });

    it('should handle keys shorter than 10 characters', () => {
      const result = createFingerprint('short');

      expect(result).toBe('sho***ort');
    });

    it('should handle keys with special characters', () => {
      const result = createFingerprint('key-with/special@chars#end');

      expect(result).toBe('key-...#end');
    });

    it('should handle keys exactly at boundary', () => {
      const result = createFingerprint('0123456789AB'); // 12 chars

      expect(result).toBe('0123...89AB');
    });

    it('should handle empty string', () => {
      const result = createFingerprint('');

      expect(result).toBe('***');
    });

    it('should handle unicode characters', () => {
      const result = createFingerprint('🔑-key-🔒-end');

      expect(result).toBe('🔑-k...-end');
    });
  });

  describe('validateEncryptionSecret', () => {
    it('should return true for valid secret', () => {
      const result = validateEncryptionSecret(TEST_SECRET);

      expect(result).toBe(true);
    });

    it('should return false for undefined secret', () => {
      const result = validateEncryptionSecret(undefined);

      expect(result).toBe(false);
    });

    it('should return false for empty string', () => {
      const result = validateEncryptionSecret('');

      expect(result).toBe(false);
    });

    it('should return false for short secret', () => {
      const result = validateEncryptionSecret('short');

      expect(result).toBe(false);
    });

    it('should return false for secret exactly 31 characters', () => {
      const result = validateEncryptionSecret('a'.repeat(31));

      expect(result).toBe(false);
    });

    it('should return true for secret exactly 32 characters', () => {
      const result = validateEncryptionSecret('a'.repeat(32));

      expect(result).toBe(true);
    });

    it('should return true for longer secrets', () => {
      const result = validateEncryptionSecret('a'.repeat(64));

      expect(result).toBe(true);
    });

    it('should narrow type correctly', () => {
      const secret: string | undefined = TEST_SECRET;

      if (validateEncryptionSecret(secret)) {
        // TypeScript should know secret is string here
        expect(secret.toUpperCase()).toBeDefined();
      } else {
        fail('Should have validated');
      }
    });

    it('should handle secrets with special characters', () => {
      const result = validateEncryptionSecret('my-secret!@#$%^&*()_+1234567890abcd');

      expect(result).toBe(true);
    });

    it('should handle secrets with unicode', () => {
      const result = validateEncryptionSecret('🔑-secret-🔒-1234567890abcdefghij');

      expect(result).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should work end-to-end with different secrets', async () => {
      const secrets = [
        'secret-1-32-characters-long-abcdef',
        'secret-2-different-32-chars-long-xyz',
        'secret-3-another-32-characters-long',
      ];

      for (const secret of secrets) {
        const encrypted = await encryptKey(TEST_API_KEY, secret);
        const decrypted = await decryptKey(encrypted.encrypted, encrypted.iv, secret);

        expect(decrypted).toBe(TEST_API_KEY);
      }
    });

    it('should produce different ciphertexts for same key with same secret', async () => {
      const encryptions = await Promise.all(
        Array.from({ length: 10 }, () => encryptKey(TEST_API_KEY, TEST_SECRET))
      );

      const ciphertexts = encryptions.map((e) => e.encrypted);
      const uniqueCiphertexts = new Set(ciphertexts);

      // All ciphertexts should be different due to random IV
      expect(uniqueCiphertexts.size).toBe(10);
    });

    it('should maintain fingerprint consistency', async () => {
      const encryptions = await Promise.all(
        Array.from({ length: 5 }, () => encryptKey(TEST_API_KEY, TEST_SECRET))
      );

      // All fingerprints should be the same
      const fingerprints = encryptions.map((e) => e.fingerprint);
      fingerprints.forEach((fp) => {
        expect(fp).toBe('sk-t...cdef');
      });
    });

    it('should handle concurrent encryption/decryption', async () => {
      const keys = Array.from({ length: 10 }, (_, i) => `key-${i}-secret-${i}`);

      const encrypted = await Promise.all(
        keys.map((key) => encryptKey(key, TEST_SECRET))
      );

      const decrypted = await Promise.all(
        encrypted.map((enc) => decryptKey(enc.encrypted, enc.iv, TEST_SECRET))
      );

      expect(decrypted).toEqual(keys);
    });
  });

  describe('edge cases', () => {
    it('should handle key with only whitespace', async () => {
      const whitespaceKey = '   ';
      const result = await encryptKey(whitespaceKey, TEST_SECRET);

      expect(result.encrypted).toBeDefined();
    });

    it('should handle key with newlines', async () => {
      const newlineKey = 'sk-test\nkey\nwith\nnewlines';
      const result = await encryptKey(newlineKey, TEST_SECRET);

      const decrypted = await decryptKey(result.encrypted, result.iv, TEST_SECRET);
      expect(decrypted).toBe(newlineKey);
    });

    it('should handle very long secret', async () => {
      const longSecret = 'a'.repeat(1000);
      const result = await encryptKey(TEST_API_KEY, longSecret);

      const decrypted = await decryptKey(result.encrypted, result.iv, longSecret);
      expect(decrypted).toBe(TEST_API_KEY);
    });

    it('should handle base64-like keys', async () => {
      const base64Key = 'c2stdGVzdC1hcGkta2V5LTEyMzQ1Njc4OWFiY2RlZg==';
      const result = await encryptKey(base64Key, TEST_SECRET);

      const decrypted = await decryptKey(result.encrypted, result.iv, TEST_SECRET);
      expect(decrypted).toBe(base64Key);
    });
  });
});

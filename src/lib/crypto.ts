import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.NEXTAUTH_SECRET || 'fallback-key-for-dev';
const ALGORITHM = 'aes-256-ctr';

/**
 * Encrypts a string using AES-256-CTR algorithm
 * @param text The text to encrypt
 * @returns The encrypted text with IV prepended
 */
export function encrypt(text: string): string {
  if (!text) return '';

  try {
    const iv = randomBytes(16);
    // Use a simple key derivation for synchronous operation
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const cipher = createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Prepend IV to encrypted data
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption failed:', error);
    return '';
  }
}

/**
 * Decrypts a string encrypted with the encrypt function
 * @param encryptedText The encrypted text with IV prepended
 * @returns The decrypted text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  try {
    const [ivHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32));
    const decipher = createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return '';
  }
}

/**
 * Validates an API key format for a given provider
 * @param provider The AI provider name
 * @param apiKey The API key to validate
 * @returns True if the format appears valid
 */
export function validateApiKeyFormat(
  provider: string,
  apiKey: string
): boolean {
  if (!apiKey || apiKey.length < 10) return false;

  switch (provider.toLowerCase()) {
    case 'openai':
      return apiKey.startsWith('sk-') && apiKey.length >= 20;
    case 'anthropic':
      return apiKey.startsWith('sk-ant-') && apiKey.length >= 20;
    case 'gemini':
    case 'google':
      return /^[A-Za-z0-9_-]{35,45}$/.test(apiKey);
    case 'groq':
      return apiKey.startsWith('gsk_') && apiKey.length >= 20;
    case 'fireworks':
      return apiKey.length >= 20; // More flexible for Fireworks
    default:
      return apiKey.length >= 10; // Basic length check for unknown providers
  }
}

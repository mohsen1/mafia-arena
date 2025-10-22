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
  // Basic validation - key must exist and be reasonable length
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10 || apiKey.length > 200) {
    return false;
  }

  // Check for potentially dangerous characters
  if (/[<>'"&]/.test(apiKey)) {
    return false;
  }

  switch (provider.toLowerCase()) {
    case 'openai':
      // OpenAI keys start with 'sk-' and are longer
      return /^sk-[a-zA-Z0-9]{40,}[a-zA-Z0-9_-]*$/.test(apiKey) && apiKey.length >= 51;

    case 'anthropic':
    case 'claude':
      // Anthropic keys start with 'sk-ant-api03-'
      return /^sk-ant-api03-[a-zA-Z0-9_-]{95,}[a-zA-Z0-9_-]*$/.test(apiKey) && apiKey.length >= 108;

    case 'gemini':
    case 'google':
      // Google AI keys are typically 39 characters of mixed case letters and numbers
      return /^[A-Za-z0-9_-]{35,45}$/.test(apiKey) && !apiKey.includes(' ') && /[A-Z]/.test(apiKey) && /[a-z]/.test(apiKey);

    case 'groq':
      // Groq keys start with 'gsk_'
      return /^gsk_[a-zA-Z0-9_-]{50,}[a-zA-Z0-9_-]*$/.test(apiKey) && apiKey.length >= 56;

    case 'fireworks':
      // Fireworks keys - more flexible validation
      return /^[a-zA-Z0-9_-]{20,}$/.test(apiKey) && !apiKey.includes(' ');

    case 'ollama':
      // Ollama typically doesn't require API keys, but if provided, basic validation
      return apiKey.length >= 10 && /^[a-zA-Z0-9_-]+$/.test(apiKey);

    default:
      // For unknown providers, basic validation only
      return /^[a-zA-Z0-9_-]{10,}$/.test(apiKey) && !apiKey.includes(' ');
  }
}

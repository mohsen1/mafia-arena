/**
 * Cryptographic utilities for encrypting/decrypting user API keys.
 * 
 * Uses AES-GCM (256-bit) via Web Crypto API for secure encryption.
 * Each key gets a unique random IV (Initialization Vector) for added security.
 */

const ALGORITHM = 'AES-GCM';

/**
 * Derive a CryptoKey from the encryption secret.
 * Uses SHA-256 hash to ensure the key is exactly 256 bits.
 */
async function getKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  // Hash secret to ensure 256-bit key length
  const hash = await crypto.subtle.digest('SHA-256', keyData);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Result of encrypting an API key.
 */
export interface EncryptedKey {
  /** Base64-encoded encrypted key */
  encrypted: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Fingerprint for UI display (e.g., "sk-...1234") */
  fingerprint: string;
}

/**
 * Encrypt an API key for storage.
 * 
 * @param apiKey - The plaintext API key to encrypt
 * @param secret - The encryption secret (ENCRYPTION_SECRET env var)
 * @returns Encrypted key data with IV and fingerprint
 */
export async function encryptKey(apiKey: string, secret: string): Promise<EncryptedKey> {
  const key = await getKey(secret);
  
  // Generate random 96-bit IV (recommended for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt the API key
  const encoded = new TextEncoder().encode(apiKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  // Create fingerprint for UI display
  // Shows first 4 chars, "...", and last 4 chars
  const fingerprint = createFingerprint(apiKey);

  return {
    encrypted: uint8ArrayToBase64(new Uint8Array(encrypted)),
    iv: uint8ArrayToBase64(iv),
    fingerprint,
  };
}

/**
 * Decrypt an API key from storage.
 * 
 * @param encryptedBase64 - Base64-encoded encrypted key
 * @param ivBase64 - Base64-encoded initialization vector
 * @param secret - The encryption secret (ENCRYPTION_SECRET env var)
 * @returns The decrypted plaintext API key
 * @throws Error if decryption fails (wrong secret, corrupted data, etc.)
 */
export async function decryptKey(
  encryptedBase64: string,
  ivBase64: string,
  secret: string
): Promise<string> {
  const key = await getKey(secret);
  const iv = base64ToUint8Array(ivBase64);
  const encrypted = base64ToUint8Array(encryptedBase64);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Create a fingerprint for an API key for display in the UI.
 * Shows first 4 chars, "...", and last 4 chars.
 * 
 * Examples:
 * - "sk-proj-abc123xyz789" → "sk-p...9789"
 * - "AIzaSyABC123" → "AIza...C123"
 */
export function createFingerprint(apiKey: string): string {
  if (apiKey.length <= 10) {
    // Very short keys get asterisks in the middle
    return apiKey.slice(0, 3) + '***' + apiKey.slice(-3);
  }
  return apiKey.slice(0, 4) + '...' + apiKey.slice(-4);
}

/**
 * Convert Uint8Array to Base64 string.
 * Uses standard Base64 (works in all environments).
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Validate that an encryption secret is properly configured.
 * Should be at least 32 characters for security.
 */
export function validateEncryptionSecret(secret: string | undefined): secret is string {
  if (!secret) return false;
  if (secret.length < 32) return false;
  return true;
}


/**
 * User API Key management routes.
 * 
 * Allows authenticated users to manage their own API keys for AI providers.
 * Keys are encrypted using AES-GCM before storage in D1.
 * 
 * Routes:
 * - GET /api/auth/keys - List user's keys (fingerprints only, never raw keys)
 * - POST /api/auth/keys - Add or update a provider key
 * - DELETE /api/auth/keys/:provider - Remove a key
 */

import { Hono } from 'hono';
import type { Env } from '../types.js';
import { getSession, type SessionData } from './auth.js';
import { encryptKey, decryptKey, validateEncryptionSecret } from '../utils/crypto.js';
import { Errors } from '../utils/errors.js';

/** Extended bindings with session data */
interface KeysBindings {
  Bindings: Env;
  Variables: {
    session: SessionData;
  };
}

const keys = new Hono<KeysBindings>();

/**
 * Supported providers for user API keys.
 * These map to the provider names in the AI factory.
 */
const SUPPORTED_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'xai',
  'deepseek',
  'together',
  'groq',
  'sambanova',
  'hyperbolic',
  'mistral',
  'cohere',
  'ai21',
  'cerebras',
  'fireworks',
  'minimax',
] as const;

type SupportedProvider = typeof SUPPORTED_PROVIDERS[number];

/**
 * User API key response (safe to send to client).
 */
interface UserKeyResponse {
  provider: string;
  fingerprint: string;
  createdAt: number;
  updatedAt: number | null;
}

import type { Context, Next } from 'hono';

/**
 * Middleware to ensure user is authenticated.
 */
async function requireAuth(c: Context<KeysBindings>, next: Next) {
  const session = await getSession(c.req.raw, c.env);
  if (!session) {
    return c.json({ error: 'Authentication required' }, 401);
  }
  c.set('session', session);
  return next();
}

/**
 * Middleware to ensure encryption is configured.
 */
async function requireEncryption(c: Context<KeysBindings>, next: Next) {
  if (!validateEncryptionSecret(c.env.ENCRYPTION_SECRET)) {
    console.error('ENCRYPTION_SECRET not configured or too short');
    return c.json({ error: 'Key management not available' }, 503);
  }
  return next();
}

// Apply authentication middleware to all routes
keys.use('*', requireAuth);
keys.use('*', requireEncryption);

/**
 * GET /api/auth/keys - List user's API keys.
 * Returns provider names and fingerprints only, never the actual keys.
 */
keys.get('/', async (c) => {
  const session = c.get('session');
  const userId = session.userId;

  try {
    const result = await c.env.DB.prepare(
      `SELECT provider, key_fingerprint, created_at, updated_at
       FROM user_api_keys
       WHERE user_id = ?
       ORDER BY provider`
    ).bind(userId).all<{
      provider: string;
      key_fingerprint: string;
      created_at: number;
      updated_at: number | null;
    }>();

    const keys: UserKeyResponse[] = (result.results ?? []).map(row => ({
      provider: row.provider,
      fingerprint: row.key_fingerprint,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json({
      keys,
      supportedProviders: SUPPORTED_PROVIDERS,
      isAdmin: session.isAdmin,
    });
  } catch (error) {
    console.error('Failed to fetch user keys:', error);
    throw Errors.Internal('Failed to fetch API keys');
  }
});

/**
 * POST /api/auth/keys - Add or update an API key for a provider.
 * 
 * Body:
 * - provider: Provider name (e.g., 'openai', 'anthropic')
 * - apiKey: The API key to store
 */
keys.post('/', async (c) => {
  const session = c.get('session');
  const userId = session.userId;

  interface AddKeyRequest {
    provider: string;
    apiKey: string;
  }

  let body: AddKeyRequest;
  try {
    body = await c.req.json<AddKeyRequest>();
  } catch {
    throw Errors.BadRequest('Invalid JSON body');
  }

  const { provider, apiKey } = body;

  // Validate provider
  if (!provider || !SUPPORTED_PROVIDERS.includes(provider as SupportedProvider)) {
    throw Errors.BadRequest(`Invalid provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  // Validate API key format
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    throw Errors.BadRequest('Invalid API key format');
  }

  // Don't allow keys that look like placeholders
  if (apiKey.includes('your_') || apiKey.includes('xxx') || apiKey === 'test') {
    throw Errors.BadRequest('Please provide a real API key');
  }

  try {
    // Encrypt the key
    const encrypted = await encryptKey(apiKey, c.env.ENCRYPTION_SECRET!);

    // Generate unique ID for this key record
    const keyId = `${userId}_${provider}`;
    const now = Date.now();

    // Upsert the key
    await c.env.DB.prepare(
      `INSERT INTO user_api_keys (id, user_id, provider, encrypted_key, iv_vector, key_fingerprint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         encrypted_key = excluded.encrypted_key,
         iv_vector = excluded.iv_vector,
         key_fingerprint = excluded.key_fingerprint,
         updated_at = excluded.updated_at`
    ).bind(
      keyId,
      userId,
      provider,
      encrypted.encrypted,
      encrypted.iv,
      encrypted.fingerprint,
      now,
      now
    ).run();

    console.log(`User ${session.email} added/updated ${provider} API key`);

    return c.json({
      success: true,
      provider,
      fingerprint: encrypted.fingerprint,
      message: `${provider} API key saved successfully`,
    });
  } catch (error) {
    console.error('Failed to save API key:', error);
    throw Errors.Internal('Failed to save API key');
  }
});

/**
 * DELETE /api/auth/keys/:provider - Remove an API key.
 */
keys.delete('/:provider', async (c) => {
  const session = c.get('session');
  const userId = session.userId;
  const provider = c.req.param('provider');

  // Validate provider
  if (!provider || !SUPPORTED_PROVIDERS.includes(provider as SupportedProvider)) {
    throw Errors.BadRequest(`Invalid provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }

  try {
    const result = await c.env.DB.prepare(
      `DELETE FROM user_api_keys WHERE user_id = ? AND provider = ?`
    ).bind(userId, provider).run();

    if (result.meta.changes === 0) {
      throw Errors.NotFound('API key');
    }

    console.log(`User ${session.email} deleted ${provider} API key`);

    return c.json({
      success: true,
      provider,
      message: `${provider} API key removed`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    console.error('Failed to delete API key:', error);
    throw Errors.Internal('Failed to delete API key');
  }
});

/**
 * Helper function to get decrypted keys for a user.
 * Used by the game execution flow.
 * 
 * @param userId - User ID
 * @param providers - Optional list of providers to fetch (fetches all if not specified)
 * @param env - Environment with DB and ENCRYPTION_SECRET
 * @returns Map of provider -> decrypted API key
 */
export async function getUserApiKeys(
  userId: string,
  providers: string[] | undefined,
  env: Env
): Promise<Map<string, string>> {
  if (!validateEncryptionSecret(env.ENCRYPTION_SECRET)) {
    throw new Error('ENCRYPTION_SECRET not configured');
  }

  let query = `SELECT provider, encrypted_key, iv_vector FROM user_api_keys WHERE user_id = ?`;
  const params: (string | number)[] = [userId];

  if (providers && providers.length > 0) {
    const placeholders = providers.map(() => '?').join(', ');
    query += ` AND provider IN (${placeholders})`;
    params.push(...providers);
  }

  const result = await env.DB.prepare(query).bind(...params).all<{
    provider: string;
    encrypted_key: string;
    iv_vector: string;
  }>();

  const keys = new Map<string, string>();

  for (const row of result.results ?? []) {
    try {
      const decrypted = await decryptKey(
        row.encrypted_key,
        row.iv_vector,
        env.ENCRYPTION_SECRET!
      );
      keys.set(row.provider, decrypted);
    } catch (error) {
      console.error(`Failed to decrypt ${row.provider} key for user ${userId}:`, error);
      // Skip this key, don't fail entirely
    }
  }

  return keys;
}

/**
 * Map provider names to environment variable names.
 * Used when injecting user keys into the AI factory.
 */
export const PROVIDER_TO_ENV_KEY: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  xai: 'XAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  together: 'TOGETHER_API_KEY',
  groq: 'GROQ_API_KEY',
  sambanova: 'SAMBANOVA_API_KEY',
  hyperbolic: 'HYPERBOLIC_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  cohere: 'COHERE_API_KEY',
  ai21: 'AI21_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
  minimax: 'MINIMAX_API_KEY',
};

export default keys;


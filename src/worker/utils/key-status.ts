/**
 * API Key status checking utilities.
 * Checks connectivity and balance for all configured AI providers.
 */

import type { Env, ApiProvider } from '../types.js';

export interface KeyStatus {
  provider: ApiProvider | string;
  displayName: string;
  maskedKey: string;
  status: 'active' | 'invalid' | 'unconfigured' | 'error';
  balance?: {
    amount: number;
    currency: string;
    label: string;
  } | undefined;
  usage?: {
    amount: number;
    limit: number | null;
  } | undefined;
  latencyMs: number;
  error?: string | undefined;
}

/**
 * Mask an API key to show only first 4 and last 4 characters.
 */
function maskKey(key: string | undefined): string {
  if (!key || key.length < 12) return '••••••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

/**
 * Check OpenRouter API key status - returns actual balance.
 * OpenRouter provides a balance endpoint at /api/v1/auth/key
 */
async function checkOpenRouter(key: string): Promise<Partial<KeyStatus>> {
  const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    data: {
      label?: string;
      usage: number;
      limit: number | null;
      is_free_tier: boolean;
      rate_limit: { requests: number; interval: string };
    };
  };

  const { limit, usage } = data.data;

  // Calculate remaining balance if there's a limit
  const balance =
    limit !== null
      ? {
          amount: Math.max(0, limit - usage),
          currency: 'USD',
          label: 'Credits Remaining',
        }
      : undefined;

  return {
    status: 'active',
    balance,
    usage: {
      amount: usage,
      limit,
    },
  };
}

/**
 * Check OpenAI API key by listing models (lightweight endpoint).
 */
async function checkOpenAI(key: string): Promise<Partial<KeyStatus>> {
  const res = await fetch('https://api.openai.com/v1/models?limit=1', {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`HTTP ${res.status}`);
  }

  return { status: 'active' };
}

/**
 * Check Anthropic API key by listing models.
 */
async function checkAnthropic(key: string): Promise<Partial<KeyStatus>> {
  const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`HTTP ${res.status}`);
  }

  return { status: 'active' };
}

/**
 * Check Google Gemini API key by listing models.
 */
async function checkGoogle(key: string): Promise<Partial<KeyStatus>> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${key}`
  );

  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error('Invalid API key');
    throw new Error(`HTTP ${res.status}`);
  }

  return { status: 'active' };
}

/**
 * Check generic OpenAI-compatible API (Cerebras, Fireworks, etc).
 */
async function checkGenericOpenAICompatible(
  key: string,
  baseUrl: string
): Promise<Partial<KeyStatus>> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('Invalid API key');
    throw new Error(`HTTP ${res.status}`);
  }

  return { status: 'active' };
}

/**
 * Check MiniMax API key.
 * MiniMax uses a different API structure.
 */
async function checkMiniMax(key: string): Promise<Partial<KeyStatus>> {
  // MiniMax doesn't have a simple /models endpoint, so we'll just verify the key format
  // and mark it as active if it looks valid
  if (key.length < 20) {
    throw new Error('Invalid key format');
  }
  
  // Try their chat endpoint with minimal payload to verify
  const res = await fetch('https://api.minimax.chat/v1/text/chatcompletion_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-Text-01',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
    }),
  });

  // Even 400/422 errors indicate the key is valid but request is malformed
  if (res.status === 401 || res.status === 403) {
    throw new Error('Invalid API key');
  }

  return { status: 'active' };
}

/**
 * Provider display name mapping.
 */
const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google AI',
  cerebras: 'Cerebras',
  fireworks: 'Fireworks AI',
  minimax: 'MiniMax',
};

/**
 * Check a single provider's API key status.
 */
async function checkProviderKey(
  provider: string,
  key: string | undefined,
  displayName?: string
): Promise<KeyStatus> {
  const base: KeyStatus = {
    provider,
    displayName: displayName || PROVIDER_DISPLAY_NAMES[provider] || provider,
    maskedKey: maskKey(key),
    status: 'unconfigured',
    latencyMs: 0,
  };

  if (!key) {
    return base;
  }

  const start = Date.now();

  try {
    let result: Partial<KeyStatus>;

    switch (provider) {
      case 'openrouter':
        result = await checkOpenRouter(key);
        break;
      case 'openai':
        result = await checkOpenAI(key);
        break;
      case 'anthropic':
        result = await checkAnthropic(key);
        break;
      case 'google':
        result = await checkGoogle(key);
        break;
      case 'cerebras':
        result = await checkGenericOpenAICompatible(key, 'https://api.cerebras.ai/v1');
        break;
      case 'fireworks':
        result = await checkGenericOpenAICompatible(key, 'https://api.fireworks.ai/inference/v1');
        break;
      case 'minimax':
        result = await checkMiniMax(key);
        break;
      default:
        result = { status: 'error', error: 'Unknown provider' };
    }

    return {
      ...base,
      ...result,
      latencyMs: Date.now() - start,
    } as KeyStatus;
  } catch (e) {
    return {
      ...base,
      status: 'error',
      error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * Check all configured API keys and return their status.
 */
export async function checkAllKeys(env: Env): Promise<KeyStatus[]> {
  const checks = [
    checkProviderKey('openrouter', env.OPENROUTER_API_KEY),
    checkProviderKey('openai', env.OPENAI_API_KEY),
    checkProviderKey('anthropic', env.ANTHROPIC_API_KEY),
    checkProviderKey('google', env.GOOGLE_API_KEY),
    checkProviderKey('cerebras', env.CEREBRAS_API_KEY),
    checkProviderKey('fireworks', env.FIREWORKS_API_KEY),
    checkProviderKey('minimax', env.MINIMAX_API_KEY),
  ];

  // Run all checks in parallel
  const results = await Promise.all(checks);

  // Sort: configured keys first, then by provider name
  return results.sort((a, b) => {
    if (a.status === 'unconfigured' && b.status !== 'unconfigured') return 1;
    if (a.status !== 'unconfigured' && b.status === 'unconfigured') return -1;
    return a.displayName.localeCompare(b.displayName);
  });
}


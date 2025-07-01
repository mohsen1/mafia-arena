import { availableProviders } from '@/lib/models';
import type { UserApiKeyInfo } from '@/app/actions/api-keys.actions';

export interface AvailableProvider {
  value: string;
  title: string;
  source: 'env' | 'user' | 'both' | 'custom' | 'none';
  userKeyName?: string;
}

export interface CustomProviderConfig {
  ollamaEndpoint?: string;
}

/**
 * Get providers that have API keys available in environment variables
 */
export function getEnvAvailableProviders(): AvailableProvider[] {
  const envProviders: AvailableProvider[] = [];

  for (const provider of availableProviders) {
    if (provider.apiKeyEnvVar && process.env[provider.apiKeyEnvVar]) {
      envProviders.push({
        value: provider.value,
        title: provider.title,
        source: 'env',
      });
    }
  }

  return envProviders;
}

/**
 * Get providers that have user-provided API keys
 */
export function getUserAvailableProviders(
  userApiKeys: UserApiKeyInfo[]
): AvailableProvider[] {
  const userProviders: AvailableProvider[] = [];

  // Group user keys by provider (in case user has multiple keys for same provider)
  const keysByProvider = userApiKeys.reduce(
    (acc, key) => {
      if (key.isActive) {
        if (!acc[key.provider]) {
          acc[key.provider] = [];
        }
        acc[key.provider].push(key);
      }
      return acc;
    },
    {} as Record<string, UserApiKeyInfo[]>
  );

  for (const [providerValue, keys] of Object.entries(keysByProvider)) {
    const provider = availableProviders.find((p) => p.value === providerValue);
    if (provider && keys.length > 0) {
      // Use the first active key for this provider
      const firstKey = keys[0];
      userProviders.push({
        value: provider.value,
        title: provider.title,
        source: 'user',
        userKeyName: firstKey.keyName,
      });
    }
  }

  return userProviders;
}

/**
 * Get all available providers combining environment and user-provided keys
 */
export function getAllAvailableProviders(
  userApiKeys: UserApiKeyInfo[] = []
): AvailableProvider[] {
  const envProviders = getEnvAvailableProviders();
  const userProviders = getUserAvailableProviders(userApiKeys);

  // Merge providers, handling cases where both env and user keys exist
  const providerMap = new Map<string, AvailableProvider>();

  // Add environment providers first
  for (const provider of envProviders) {
    providerMap.set(provider.value, provider);
  }

  // Add or update with user providers
  for (const provider of userProviders) {
    const existing = providerMap.get(provider.value);
    if (existing) {
      // Provider has both env and user keys
      providerMap.set(provider.value, {
        ...existing,
        source: 'both',
        userKeyName: provider.userKeyName,
      });
    } else {
      // Provider only has user keys
      providerMap.set(provider.value, provider);
    }
  }

  return Array.from(providerMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title)
  );
}

/**
 * Check if a specific provider is available
 */
export function isProviderAvailable(
  providerValue: string,
  userApiKeys: UserApiKeyInfo[] = []
): boolean {
  const availableProviders = getAllAvailableProviders(userApiKeys);
  return availableProviders.some((p) => p.value === providerValue);
}

/**
 * Get the source of API key for a provider (env, user, both, or custom)
 */
export function getProviderKeySource(
  providerValue: string,
  userApiKeys: UserApiKeyInfo[] = []
): 'env' | 'user' | 'both' | 'custom' | 'none' {
  const provider = getAllAvailableProviders(userApiKeys).find(
    (p) => p.value === providerValue
  );
  return provider?.source || 'none';
}

/**
 * Get display title for a provider including key source information
 */
export function getProviderDisplayTitle(provider: AvailableProvider): string {
  let title = provider.title;

  switch (provider.source) {
    case 'env':
      title += ' (System)';
      break;
    case 'user':
      title += ` (${provider.userKeyName})`;
      break;
    case 'both':
      title += ` (System + ${provider.userKeyName})`;
      break;
    case 'custom':
      title += ' (Custom)';
      break;
  }

  return title;
}

// Function to get dynamic Ollama endpoint
export function getOllamaEndpoint(customConfig?: CustomProviderConfig): string {
  if (customConfig?.ollamaEndpoint) {
    return customConfig.ollamaEndpoint;
  }
  // Check for environment variable override
  if (process.env.OLLAMA_ENDPOINT) {
    return process.env.OLLAMA_ENDPOINT;
  }
  // Default endpoint
  return 'http://localhost:11434/v1';
}

// Function to get provider with custom endpoint
export function getProviderWithCustomEndpoint(
  providerValue: string,
  customConfig?: CustomProviderConfig
): AvailableProvider | undefined {
  const baseProvider = getAllAvailableProviders([]).find(p => p.value === providerValue);
  if (!baseProvider) return undefined;

  if (providerValue === 'ollama_local' && customConfig?.ollamaEndpoint) {
    return {
      ...baseProvider,
      source: 'custom',
      title: `${baseProvider.title} (Custom)`,
    };
  }

  return baseProvider;
}

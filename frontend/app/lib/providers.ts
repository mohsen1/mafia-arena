/**
 * Provider color utilities for consistent styling across the app.
 */

export interface ProviderColors {
  bg: string;
  text: string;
  hex: string;
}

const PROVIDER_COLORS: Record<string, ProviderColors> = {
  anthropic: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    hex: '#f59e0b',
  },
  openai: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600 dark:text-emerald-400',
    hex: '#10b981',
  },
  google: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600 dark:text-blue-400',
    hex: '#3b82f6',
  },
};

const DEFAULT_COLORS: ProviderColors = {
  bg: 'bg-zinc-500/10',
  text: 'text-zinc-600 dark:text-zinc-400',
  hex: '#71717a',
};

/**
 * Get the hex color for a provider.
 */
export function getProviderColor(provider: string | undefined | null): string {
  if (!provider) return DEFAULT_COLORS.hex;
  return PROVIDER_COLORS[provider.toLowerCase()]?.hex ?? DEFAULT_COLORS.hex;
}

/**
 * Get all color classes for a provider.
 */
export function getProviderColors(provider: string | undefined | null): ProviderColors {
  if (!provider) return DEFAULT_COLORS;
  return PROVIDER_COLORS[provider.toLowerCase()] ?? DEFAULT_COLORS;
}

/**
 * Detect provider from model ID.
 */
export function getProviderFromModel(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes('claude')) return 'anthropic';
  if (id.includes('gpt') || id.includes('o1') || id.includes('o3')) return 'openai';
  if (id.includes('gemini')) return 'google';
  return 'unknown';
}

/**
 * Get provider color from model ID.
 */
export function getProviderColorFromModel(modelId: string): string {
  return getProviderColor(getProviderFromModel(modelId));
}


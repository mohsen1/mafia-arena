/**
 * Theme loader utility for managing game themes
 * This module provides functions to load and manage themes from both
 * hardcoded sources and potentially external files in the future.
 */

import { GameTheme } from '@/lib/engine/interfaces/Theme';

// Re-export the hardcoded themes for now, but this can be replaced with dynamic loading
import { Themes as HardcodedThemes } from '@/lib/engine/interfaces/Theme';

/**
 * Theme registry to store all available themes
 */
let themeRegistry: Record<string, GameTheme> = {};

/**
 * Initialize the theme registry with default themes
 */
function initializeThemes(): void {
  // Start with hardcoded themes
  themeRegistry = { ...HardcodedThemes };
}

/**
 * Get all available themes
 * @returns Record of theme key to GameTheme
 */
export function getThemes(): Record<string, GameTheme> {
  if (Object.keys(themeRegistry).length === 0) {
    initializeThemes();
  }
  return { ...themeRegistry };
}

/**
 * Get a specific theme by key
 * @param themeKey - The key of the theme to retrieve
 * @returns The GameTheme if found, undefined otherwise
 */
export function getTheme(themeKey: string): GameTheme | undefined {
  const themes = getThemes();
  return themes[themeKey];
}

/**
 * Get theme with fallback to default
 * @param themeKey - The key of the theme to retrieve
 * @param defaultKey - The default theme key if not found (defaults to UK_VILLAGE_1900S)
 * @returns The GameTheme
 */
export function getThemeWithFallback(
  themeKey: string,
  defaultKey: string = 'UK_VILLAGE_1900S'
): GameTheme {
  const theme = getTheme(themeKey);
  if (theme) return theme;

  const defaultTheme = getTheme(defaultKey);
  if (defaultTheme) return defaultTheme;

  // If even the default doesn't exist, return a minimal theme
  console.error(
    `Theme ${themeKey} not found, and default ${defaultKey} also not found`
  );
  return {
    name: 'Default Theme',
    description: 'A default game theme',
  };
}

/**
 * Get all theme keys
 * @returns Array of theme keys
 */
export function getThemeKeys(): string[] {
  return Object.keys(getThemes());
}

/**
 * Check if a theme exists
 * @param themeKey - The key to check
 * @returns true if the theme exists
 */
export function hasTheme(themeKey: string): boolean {
  return themeKey in getThemes();
}

/**
 * Add a new theme to the registry
 * @param key - The theme key
 * @param theme - The theme data
 */
export function addTheme(key: string, theme: GameTheme): void {
  if (Object.keys(themeRegistry).length === 0) {
    initializeThemes();
  }
  themeRegistry[key] = theme;
}

/**
 * Load themes from a JSON object
 * This can be extended to load from files or APIs in the future
 * @param themesData - Object containing theme definitions
 */
export function loadThemesFromJson(
  themesData: Record<string, GameTheme>
): void {
  Object.entries(themesData).forEach(([key, theme]) => {
    addTheme(key, theme);
  });
}

/**
 * Get theme for a specific language/locale
 * This is a placeholder for future i18n support
 * @param themeKey - The theme key
 * @returns The localized theme
 */
export function getLocalizedTheme(themeKey: string): GameTheme | undefined {
  // For now, just return the theme as-is
  // In the future, this could load localized theme data
  return getTheme(themeKey);
}

/**
 * Validate theme data
 * @param theme - The theme to validate
 * @returns true if valid
 */
export function isValidTheme(theme: unknown): theme is GameTheme {
  return (
    theme !== null &&
    typeof theme === 'object' &&
    'name' in theme &&
    'description' in theme &&
    typeof (theme as GameTheme).name === 'string' &&
    typeof (theme as GameTheme).description === 'string' &&
    (theme as GameTheme).name.length > 0 &&
    (theme as GameTheme).description.length > 0
  );
}

/**
 * Load themes from an external source (file path or URL)
 * @param source - URL or file path to load themes from
 * @param timeout - Request timeout in milliseconds (default: 5000)
 * @returns Promise resolving to loaded themes
 */
export async function loadThemesFromExternal(
  source: string,
  timeout: number = 5000
): Promise<Record<string, GameTheme>> {
  try {
    console.log(`Loading themes from external source: ${source}`);

    let response: Response;

    // Check if source is a URL or file path
    const isUrl = source.startsWith('http://') || source.startsWith('https://');

    if (isUrl) {
      // Load from URL with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        response = await fetch(source, {
          signal: controller.signal,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        });
        clearTimeout(timeoutId);
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        throw error;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } else {
      // For file paths, we need to use dynamic import or fetch from public directory
      // In Next.js, we should place theme files in the public directory
      const publicPath = source.startsWith('/') ? source : `/${source}`;
      response = await fetch(publicPath);

      if (!response.ok) {
        throw new Error(
          `Failed to load theme file ${publicPath}: ${response.status} ${response.statusText}`
        );
      }
    }

    // Parse JSON response
    const data = await response.json();

    // Validate the loaded data structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid theme data: Expected an object');
    }

    // Validate and filter valid themes
    const validatedThemes: Record<string, GameTheme> = {};
    let validCount = 0;
    let invalidCount = 0;

    for (const [key, theme] of Object.entries(data)) {
      if (typeof key !== 'string' || key.trim() === '') {
        console.warn(`Skipping theme with invalid key: ${key}`);
        invalidCount++;
        continue;
      }

      if (isValidTheme(theme)) {
        validatedThemes[key] = theme;
        validCount++;
      } else {
        console.warn(`Skipping invalid theme "${key}":`, theme);
        invalidCount++;
      }
    }

    console.log(
      `Successfully loaded ${validCount} themes from ${source}${invalidCount > 0 ? ` (${invalidCount} invalid themes skipped)` : ''}`
    );

    // Add loaded themes to registry
    loadThemesFromJson(validatedThemes);

    return validatedThemes;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to load themes from ${source}:`, errorMessage);

    // Re-throw with more context
    throw new Error(`External theme loading failed: ${errorMessage}`);
  }
}

/**
 * Load multiple external theme sources
 * @param sources - Array of URLs or file paths to load themes from
 * @param continueOnError - Whether to continue loading other sources if one fails
 * @returns Promise resolving to combined loaded themes
 */
export async function loadMultipleExternalThemes(
  sources: string[],
  continueOnError: boolean = true
): Promise<Record<string, GameTheme>> {
  const allLoadedThemes: Record<string, GameTheme> = {};
  const errors: string[] = [];

  for (const source of sources) {
    try {
      const loadedThemes = await loadThemesFromExternal(source);
      Object.assign(allLoadedThemes, loadedThemes);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`${source}: ${errorMessage}`);

      if (!continueOnError) {
        throw new Error(`Failed to load themes: ${errors.join(', ')}`);
      }
    }
  }

  if (errors.length > 0) {
    console.warn(`Some theme sources failed to load: ${errors.join(', ')}`);
  }

  return allLoadedThemes;
}

/**
 * Create a sample theme file for reference
 * @returns Sample theme data structure
 */
export function createSampleThemeFile(): Record<string, GameTheme> {
  return {
    CUSTOM_SPACE_THEME: {
      name: 'Custom Space Adventure',
      description: 'A custom space-themed game setting for advanced players.',
    },
    CUSTOM_PIRATE_THEME: {
      name: 'Pirate Cove Mystery',
      description:
        'A mysterious pirate cove where treasure hunters seek fortune and betrayal.',
    },
  };
}

/**
 * Export current themes to JSON format
 * @param includeHardcoded - Whether to include hardcoded themes (default: true)
 * @returns JSON string of themes
 */
export function exportThemesToJson(includeHardcoded: boolean = true): string {
  const themes = includeHardcoded ? getThemes() : {};
  return JSON.stringify(themes, null, 2);
}

/**
 * Reset theme registry to hardcoded themes only
 */
export function resetToHardcodedThemes(): void {
  themeRegistry = {};
  initializeThemes();
  console.log('Theme registry reset to hardcoded themes only');
}

// Initialize themes on module load
initializeThemes();

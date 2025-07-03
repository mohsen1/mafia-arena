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
 * Load themes from an external source (placeholder for future implementation)
 * @param source - URL or file path to load themes from
 * @returns Promise resolving to loaded themes
 */
export async function loadThemesFromExternal(
  source: string
): Promise<Record<string, GameTheme>> {
  // TODO: Implement loading from external files/URLs
  // For now, just return empty object
  console.warn(
    `Loading themes from external source ${source} not yet implemented`
  );
  return {};
}

// Initialize themes on module load
initializeThemes();

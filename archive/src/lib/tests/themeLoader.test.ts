import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getThemes,
  getTheme,
  getThemeWithFallback,
  getThemeKeys,
  hasTheme,
  addTheme,
  loadThemesFromJson,
  loadThemesFromExternal,
  loadMultipleExternalThemes,
  createSampleThemeFile,
  exportThemesToJson,
  resetToHardcodedThemes,
  isValidTheme,
} from '@/lib/utils/themeLoader';
import type { GameTheme } from '@/lib/engine/interfaces/Theme';

// Mock fetch for testing external loading
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('themeLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetToHardcodedThemes(); // Reset to clean state
  });

  afterEach(() => {
    resetToHardcodedThemes(); // Clean up after each test
  });

  describe('Basic theme operations', () => {
    it('should get all themes', () => {
      const themes = getThemes();
      expect(themes).toBeTypeOf('object');
      expect(Object.keys(themes).length).toBeGreaterThan(0);
      expect(themes.UK_VILLAGE_1900S).toBeDefined();
    });

    it('should get a specific theme', () => {
      const theme = getTheme('UK_VILLAGE_1900S');
      expect(theme).toBeDefined();
      expect(theme?.name).toBe('UK Village 1900s');
      expect(theme?.description).toContain('quaint');
    });

    it('should return undefined for non-existent theme', () => {
      const theme = getTheme('NON_EXISTENT_THEME');
      expect(theme).toBeUndefined();
    });

    it('should get theme with fallback', () => {
      const theme = getThemeWithFallback('NON_EXISTENT_THEME');
      expect(theme).toBeDefined();
      expect(theme.name).toBe('UK Village 1900s');
    });

    it('should get theme keys', () => {
      const keys = getThemeKeys();
      expect(keys).toBeInstanceOf(Array);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain('UK_VILLAGE_1900S');
    });

    it('should check if theme exists', () => {
      expect(hasTheme('UK_VILLAGE_1900S')).toBe(true);
      expect(hasTheme('NON_EXISTENT_THEME')).toBe(false);
    });
  });

  describe('Theme validation', () => {
    it('should validate valid theme', () => {
      const validTheme: GameTheme = {
        name: 'Test Theme',
        description: 'A test theme',
      };
      expect(isValidTheme(validTheme)).toBe(true);
    });

    it('should reject invalid themes', () => {
      expect(isValidTheme(null)).toBe(false);
      expect(isValidTheme({})).toBe(false);
      expect(isValidTheme({ name: 'Test' })).toBe(false);
      expect(isValidTheme({ description: 'Test' })).toBe(false);
      expect(isValidTheme({ name: '', description: 'Test' })).toBe(false);
      expect(isValidTheme({ name: 'Test', description: '' })).toBe(false);
    });
  });

  describe('Theme management', () => {
    it('should add a new theme', () => {
      const newTheme: GameTheme = {
        name: 'Test Theme',
        description: 'A theme for testing',
      };

      addTheme('TEST_THEME', newTheme);

      expect(hasTheme('TEST_THEME')).toBe(true);
      expect(getTheme('TEST_THEME')).toEqual(newTheme);
    });

    it('should load themes from JSON', () => {
      const themesData = {
        CUSTOM_THEME_1: {
          name: 'Custom Theme 1',
          description: 'First custom theme',
        },
        CUSTOM_THEME_2: {
          name: 'Custom Theme 2',
          description: 'Second custom theme',
        },
      };

      loadThemesFromJson(themesData);

      expect(hasTheme('CUSTOM_THEME_1')).toBe(true);
      expect(hasTheme('CUSTOM_THEME_2')).toBe(true);
      expect(getTheme('CUSTOM_THEME_1')?.name).toBe('Custom Theme 1');
    });
  });

  describe('External theme loading', () => {
    it('should load themes from URL successfully', async () => {
      const mockThemes = {
        EXTERNAL_THEME: {
          name: 'External Theme',
          description: 'A theme loaded from external source',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockThemes),
      });

      const result = await loadThemesFromExternal(
        'https://example.com/themes.json'
      );

      expect(result).toEqual(mockThemes);
      expect(hasTheme('EXTERNAL_THEME')).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/themes.json',
        expect.any(Object)
      );
    });

    it('should load themes from file path successfully', async () => {
      const mockThemes = {
        FILE_THEME: {
          name: 'File Theme',
          description: 'A theme loaded from file',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockThemes),
      });

      const result = await loadThemesFromExternal('themes/custom.json');

      expect(result).toEqual(mockThemes);
      expect(hasTheme('FILE_THEME')).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/themes/custom.json');
    });

    it('should handle HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        loadThemesFromExternal('https://example.com/notfound.json')
      ).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle timeout', async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('AbortError')), 100)
          )
      );

      await expect(
        loadThemesFromExternal('https://example.com/slow.json', 50)
      ).rejects.toThrow('Request timeout');
    });

    it('should validate loaded theme data', async () => {
      const invalidThemes = {
        VALID_THEME: {
          name: 'Valid Theme',
          description: 'This is valid',
        },
        INVALID_THEME: {
          name: '',
          description: 'Invalid because empty name',
        },
        ANOTHER_INVALID: {
          name: 'No description',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(invalidThemes),
      });

      const result = await loadThemesFromExternal(
        'https://example.com/mixed.json'
      );

      expect(result).toHaveProperty('VALID_THEME');
      expect(result).not.toHaveProperty('INVALID_THEME');
      expect(result).not.toHaveProperty('ANOTHER_INVALID');
      expect(hasTheme('VALID_THEME')).toBe(true);
      expect(hasTheme('INVALID_THEME')).toBe(false);
    });

    it('should handle JSON parsing errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(
        loadThemesFromExternal('https://example.com/invalid.json')
      ).rejects.toThrow('External theme loading failed');
    });
  });

  describe('Multiple external theme loading', () => {
    it('should load from multiple sources successfully', async () => {
      const themes1 = {
        THEME_1: { name: 'Theme 1', description: 'First theme' },
      };
      const themes2 = {
        THEME_2: { name: 'Theme 2', description: 'Second theme' },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(themes1),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(themes2),
        });

      const result = await loadMultipleExternalThemes([
        'https://example.com/themes1.json',
        'https://example.com/themes2.json',
      ]);

      expect(result).toHaveProperty('THEME_1');
      expect(result).toHaveProperty('THEME_2');
      expect(hasTheme('THEME_1')).toBe(true);
      expect(hasTheme('THEME_2')).toBe(true);
    });

    it('should continue on error when configured', async () => {
      const themes2 = {
        THEME_2: { name: 'Theme 2', description: 'Second theme' },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(themes2),
        });

      const result = await loadMultipleExternalThemes(
        [
          'https://example.com/notfound.json',
          'https://example.com/themes2.json',
        ],
        true
      );

      expect(result).toHaveProperty('THEME_2');
      expect(hasTheme('THEME_2')).toBe(true);
    });

    it('should fail fast when continueOnError is false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        loadMultipleExternalThemes(
          [
            'https://example.com/notfound.json',
            'https://example.com/themes2.json',
          ],
          false
        )
      ).rejects.toThrow('Failed to load themes');
    });
  });

  describe('Utility functions', () => {
    it('should create sample theme file', () => {
      const sample = createSampleThemeFile();
      expect(sample).toBeTypeOf('object');
      expect(Object.keys(sample).length).toBeGreaterThan(0);
      expect(isValidTheme(Object.values(sample)[0])).toBe(true);
    });

    it('should export themes to JSON', () => {
      const json = exportThemesToJson();
      expect(json).toBeTypeOf('string');

      const parsed = JSON.parse(json);
      expect(parsed).toHaveProperty('UK_VILLAGE_1900S');
    });

    it('should reset to hardcoded themes', () => {
      // Add a custom theme
      addTheme('CUSTOM', { name: 'Custom', description: 'Custom theme' });
      expect(hasTheme('CUSTOM')).toBe(true);

      // Reset
      resetToHardcodedThemes();
      expect(hasTheme('CUSTOM')).toBe(false);
      expect(hasTheme('UK_VILLAGE_1900S')).toBe(true); // Hardcoded theme should still exist
    });
  });
});

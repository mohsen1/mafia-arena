/**
 * Tests for game-presets utility - persona archetypes and themes
 */

import { describe, it, expect } from 'vitest';
import { 
  getUniqueAssignments, 
  getThemeNames, 
  getThemeDescription, 
  isValidTheme,
  THEMES 
} from '../../utils/game-presets.js';
import { createRandomGenerator } from '../../utils/random.js';

describe('Game Presets', () => {
  describe('getUniqueAssignments', () => {
    it('should generate unique names for each player', () => {
      const rng = createRandomGenerator(12345);
      const assignments = getUniqueAssignments(7, 'noir', rng);
      
      expect(assignments).toHaveLength(7);
      
      // Check uniqueness
      const names = assignments.map(a => a.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(7);
    });

    it('should assign an archetype to each player', () => {
      const rng = createRandomGenerator(12345);
      const assignments = getUniqueAssignments(7, 'noir', rng);
      
      for (const assignment of assignments) {
        expect(assignment.archetype).toBeDefined();
        expect(assignment.archetype.role).toBeDefined();
        expect(assignment.archetype.trait).toBeDefined();
        expect(typeof assignment.archetype.role).toBe('string');
        expect(typeof assignment.archetype.trait).toBe('string');
      }
    });

    it('should use deterministic assignment with same seed', () => {
      const rng1 = createRandomGenerator(12345);
      const assignments1 = getUniqueAssignments(5, 'victorian', rng1);
      
      const rng2 = createRandomGenerator(12345);
      const assignments2 = getUniqueAssignments(5, 'victorian', rng2);
      
      // Same seed should produce same assignments
      expect(assignments1).toEqual(assignments2);
    });

    it('should produce different assignments with different seeds', () => {
      const rng1 = createRandomGenerator(12345);
      const assignments1 = getUniqueAssignments(5, 'modern', rng1);
      
      const rng2 = createRandomGenerator(67890);
      const assignments2 = getUniqueAssignments(5, 'modern', rng2);
      
      // Different seeds should (very likely) produce different assignments
      const names1 = assignments1.map(a => a.name).join(',');
      const names2 = assignments2.map(a => a.name).join(',');
      expect(names1).not.toBe(names2);
    });

    it('should work with different themes', () => {
      const rng = createRandomGenerator(12345);
      
      const noirAssignments = getUniqueAssignments(5, 'noir', rng);
      const victorianAssignments = getUniqueAssignments(5, 'victorian', createRandomGenerator(12345));
      const modernAssignments = getUniqueAssignments(5, 'modern', createRandomGenerator(12345));
      const fantasyAssignments = getUniqueAssignments(5, 'fantasy', createRandomGenerator(12345));
      
      // All themes should produce valid assignments
      expect(noirAssignments).toHaveLength(5);
      expect(victorianAssignments).toHaveLength(5);
      expect(modernAssignments).toHaveLength(5);
      expect(fantasyAssignments).toHaveLength(5);
      
      // Names should be different across themes
      const noirNames = new Set(noirAssignments.map(a => a.name));
      const victorianNames = new Set(victorianAssignments.map(a => a.name));
      const modernNames = new Set(modernAssignments.map(a => a.name));
      const fantasyNames = new Set(fantasyAssignments.map(a => a.name));
      
      // At least some names should be different (themes have different name pools)
      const allNames = new Set([...noirNames, ...victorianNames, ...modernNames, ...fantasyNames]);
      expect(allNames.size).toBeGreaterThan(5);
    });

    it('should throw error if requesting more players than available names', () => {
      const rng = createRandomGenerator(12345);
      const maxNames = THEMES.noir.names.length;
      
      expect(() => {
        getUniqueAssignments(maxNames + 1, 'noir', rng);
      }).toThrow(/only has \d+ names/);
    });

    it('should handle maximum player count for a theme', () => {
      const rng = createRandomGenerator(12345);
      const maxNames = THEMES.fantasy.names.length;
      
      // Should work at exactly the maximum
      const assignments = getUniqueAssignments(maxNames, 'fantasy', rng);
      expect(assignments).toHaveLength(maxNames);
      
      // All names should be unique
      const names = assignments.map(a => a.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(maxNames);
    });

    it('should assign diverse archetypes', () => {
      const rng = createRandomGenerator(12345);
      const assignments = getUniqueAssignments(10, 'noir', rng);
      
      // Check that we have different archetypes (roles)
      const roles = assignments.map(a => a.archetype.role);
      const uniqueRoles = new Set(roles);
      
      // With 10 players and 10 archetypes, we should have good diversity
      expect(uniqueRoles.size).toBeGreaterThan(5);
    });
  });

  describe('getThemeNames', () => {
    it('should return all theme names', () => {
      const themes = getThemeNames();
      expect(themes).toContain('noir');
      expect(themes).toContain('victorian');
      expect(themes).toContain('modern');
      expect(themes).toContain('fantasy');
      expect(themes.length).toBe(4);
    });
  });

  describe('getThemeDescription', () => {
    it('should return description for each theme', () => {
      expect(getThemeDescription('noir')).toContain('1940s Noir');
      expect(getThemeDescription('victorian')).toContain('Victorian London');
      expect(getThemeDescription('modern')).toContain('Modern Tech Hub');
      expect(getThemeDescription('fantasy')).toContain('High Fantasy');
    });
  });

  describe('isValidTheme', () => {
    it('should validate theme names correctly', () => {
      expect(isValidTheme('noir')).toBe(true);
      expect(isValidTheme('victorian')).toBe(true);
      expect(isValidTheme('modern')).toBe(true);
      expect(isValidTheme('fantasy')).toBe(true);
      expect(isValidTheme('invalid')).toBe(false);
      expect(isValidTheme('')).toBe(false);
    });
  });

  describe('Theme Data Quality', () => {
    it('should have unique names within each theme', () => {
      for (const [themeName, theme] of Object.entries(THEMES)) {
        const uniqueNames = new Set(theme.names);
        expect(uniqueNames.size).toBe(theme.names.length);
      }
    });

    it('should have non-empty archetypes for each theme', () => {
      for (const [themeName, theme] of Object.entries(THEMES)) {
        expect(theme.archetypes.length).toBeGreaterThan(0);
        
        for (const archetype of theme.archetypes) {
          expect(archetype.role).toBeTruthy();
          expect(archetype.trait).toBeTruthy();
          expect(archetype.role.length).toBeGreaterThan(0);
          expect(archetype.trait.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have at least 10 names per theme for typical game sizes', () => {
      for (const [themeName, theme] of Object.entries(THEMES)) {
        expect(theme.names.length).toBeGreaterThanOrEqual(10);
      }
    });

    it('should have diverse archetypes (unique roles) within each theme', () => {
      for (const [themeName, theme] of Object.entries(THEMES)) {
        const roles = theme.archetypes.map(a => a.role);
        const uniqueRoles = new Set(roles);
        
        // All roles should be unique within a theme
        expect(uniqueRoles.size).toBe(roles.length);
      }
    });
  });
});


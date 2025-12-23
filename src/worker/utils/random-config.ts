/**
 * Utilities for random game configuration generation.
 * Used when starting games to ensure variety in themes.
 */

import type { ThemeName } from '../../engine/utils/game-presets.js';

/** All available theme names */
const THEME_NAMES: ThemeName[] = ['noir', 'victorian', 'modern', 'fantasy'];

/** Default fallback model if none provided */
const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp:free';

/**
 * Get a random theme from available themes.
 */
export function getRandomTheme(): ThemeName {
  const index = Math.floor(Math.random() * THEME_NAMES.length);
  return THEME_NAMES[index]!;
}

/**
 * Get random model IDs from a provided list.
 * Returns the default model if no list provided.
 */
export function getRandomModelFromList(modelIds: string[]): string {
  if (modelIds.length === 0) {
    return DEFAULT_MODEL;
  }
  const index = Math.floor(Math.random() * modelIds.length);
  return modelIds[index]!;
}

/**
 * Pick two different models from a provided list.
 * Returns an object with mafia and town model IDs.
 */
export function getRandomModelPairFromList(modelIds: string[]): { mafiaModelId: string; townModelId: string } {
  if (modelIds.length < 2) {
    const singleModel = modelIds[0] ?? DEFAULT_MODEL;
    return { mafiaModelId: singleModel, townModelId: singleModel };
  }
  
  const mafiaIndex = Math.floor(Math.random() * modelIds.length);
  let townIndex = Math.floor(Math.random() * modelIds.length);
  
  // Ensure different models for mafia and town
  while (townIndex === mafiaIndex) {
    townIndex = Math.floor(Math.random() * modelIds.length);
  }
  
  return {
    mafiaModelId: modelIds[mafiaIndex]!,
    townModelId: modelIds[townIndex]!,
  };
}

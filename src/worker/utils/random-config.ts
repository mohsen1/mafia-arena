/**
 * Utilities for random game configuration generation.
 * Used when starting games to ensure variety in themes and model matchups.
 */

import { SUPPORTED_MODELS } from '../ai/models.js';
import type { ThemeName } from '../../engine/utils/game-presets.js';

/** All available theme names */
const THEME_NAMES: ThemeName[] = ['noir', 'victorian', 'modern', 'fantasy'];

/**
 * Get a random theme from available themes.
 */
export function getRandomTheme(): ThemeName {
  const index = Math.floor(Math.random() * THEME_NAMES.length);
  return THEME_NAMES[index]!;
}

/**
 * Get list of all available model IDs from SUPPORTED_MODELS.
 */
export function getAvailableModelIds(): string[] {
  return Object.keys(SUPPORTED_MODELS);
}

/**
 * Pick a random model from available models.
 */
export function getRandomModelId(): string {
  const modelIds = getAvailableModelIds();
  const index = Math.floor(Math.random() * modelIds.length);
  return modelIds[index]!;
}

/**
 * Pick two different random models for a game.
 * Returns an object with mafia and town model IDs.
 */
export function getRandomModelPair(): { mafiaModelId: string; townModelId: string } {
  const modelIds = getAvailableModelIds();
  
  if (modelIds.length < 2) {
    const singleModel = modelIds[0] ?? 'google/gemini-2.5-flash-preview-09-2025';
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

/**
 * Generate a complete random game configuration.
 * Used for quick game starts with randomized settings.
 */
export function generateRandomGameConfig(): {
  personaTheme: ThemeName;
  mafiaModelId: string;
  townModelId: string;
  playerCount: number;
  mafiaCount: number;
} {
  const { mafiaModelId, townModelId } = getRandomModelPair();
  
  return {
    personaTheme: getRandomTheme(),
    mafiaModelId,
    townModelId,
    playerCount: 6,
    mafiaCount: 2,
  };
}


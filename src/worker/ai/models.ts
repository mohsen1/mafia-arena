/**
 * Model utilities for AI providers.
 * 
 * Models are now stored in the database and synced from OpenRouter.
 * This file contains only default pricing and utility functions.
 * 
 * Updated: December 2025
 */

import { ModelConfig } from './types.js';

/**
 * Default pricing for models not in the database (per 1K tokens, USD).
 * Used as a fallback when model pricing is unknown.
 */
export const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

/**
 * Parse pricing from model config JSON stored in database.
 */
export function parsePricingFromConfig(config: string | null): { input: number; output: number } {
  if (!config) {
    return DEFAULT_PRICING;
  }
  
  try {
    const parsed = JSON.parse(config) as { pricing?: { inputPer1K?: number; outputPer1K?: number } };
    if (parsed.pricing) {
      return {
        input: parsed.pricing.inputPer1K ?? DEFAULT_PRICING.input,
        output: parsed.pricing.outputPer1K ?? DEFAULT_PRICING.output,
      };
    }
  } catch {
    // Invalid JSON, use default
  }
  
  return DEFAULT_PRICING;
}

/**
 * Get default model configuration for any model ID.
 * Used when model is not in the database.
 */
export function getDefaultModelConfig(modelId: string): ModelConfig {
  return {
    provider: 'openrouter',
    displayName: modelId.split('/').pop() || modelId,
    structuredOutput: 'json_mode',
  };
}

/**
 * Extract provider from OpenRouter model ID.
 * e.g., "google/gemini-2.0-flash" -> "google"
 */
export function extractProvider(modelId: string): string {
  return modelId.split('/')[0] || 'unknown';
}

/**
 * Extract display name from OpenRouter model ID.
 * e.g., "google/gemini-2.0-flash-exp:free" -> "gemini-2.0-flash-exp:free"
 */
export function extractDisplayName(modelId: string): string {
  return modelId.split('/').slice(1).join('/') || modelId;
}

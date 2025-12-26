/**
 * Model utilities for AI providers.
 * 
 * Models are now stored in the database with multi-provider support.
 * This file contains default pricing and utility functions.
 * 
 * Updated: December 2025 - Multi-provider architecture
 */

import type { ModelConfig, ModelRoutingConfig } from './types.js';
import type { ApiProvider } from '../types.js';

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
 * Get default routing configuration for any model ID.
 * Infers the API provider from the model ID prefix when possible.
 */
export function getDefaultRoutingConfig(modelId: string): ModelRoutingConfig {
  const family = extractFamily(modelId);
  const displayName = extractDisplayName(modelId);
  
  return {
    id: modelId,
    family,
    displayName,
    apiProvider: 'openrouter', // Default to OpenRouter
    apiModelId: modelId,
    structuredOutput: 'json_mode',
  };
}

/**
 * Extract family/creator from model ID.
 * e.g., "google/gemini-2.0-flash" -> "google"
 */
export function extractFamily(modelId: string): string {
  return modelId.split('/')[0] || 'unknown';
}

/**
 * @deprecated Use extractFamily instead
 */
export const extractProvider = extractFamily;

/**
 * Extract display name from model ID.
 * e.g., "google/gemini-2.0-flash-exp:free" -> "gemini-2.0-flash-exp:free"
 */
export function extractDisplayName(modelId: string): string {
  return modelId.split('/').slice(1).join('/') || modelId;
}

/**
 * Format a model for display with provider context.
 * @param modelId The model ID
 * @param apiProvider The API provider used (for "via OpenRouter" suffix)
 * @returns Formatted display string
 */
export function formatModelDisplay(
  modelId: string, 
  apiProvider: ApiProvider = 'openrouter'
): string {
  const family = extractFamily(modelId);
  const name = extractDisplayName(modelId);
  
  if (apiProvider === 'openrouter') {
    return `${family}: ${name} (via OpenRouter)`;
  }
  
  return `${family}: ${name}`;
}

/**
 * Supported AI models and their pricing.
 * 
 * All models are accessed through OpenRouter's unified API.
 * OpenRouter routes to the appropriate provider (Google, Anthropic, OpenAI, etc.)
 * based on the model ID prefix (e.g., "google/gemini-*" routes to Google).
 * 
 * Updated: December 2025
 */

import { ModelConfig } from './types.js';

/**
 * Model configuration with structured output capability.
 */
export const SUPPORTED_MODELS: Record<string, ModelConfig> = {
  // Amazon Nova family
  'amazon/nova-2-lite-v1': { provider: 'openrouter', displayName: 'Nova 2 Lite', structuredOutput: 'tool' },
  'amazon/nova-lite-v1': { provider: 'openrouter', displayName: 'Nova Lite', structuredOutput: 'tool' },
  'amazon/nova-premier-v1': { provider: 'openrouter', displayName: 'Nova Premier', structuredOutput: 'tool' },
  'amazon/nova-pro-v1': { provider: 'openrouter', displayName: 'Nova Pro', structuredOutput: 'tool' },

  // Anthropic Claude (4.5 series) - OpenRouter IDs use periods not hyphens
  'anthropic/claude-haiku-4.5': { provider: 'openrouter', displayName: 'Claude Haiku 4.5', structuredOutput: 'tool' },
  'anthropic/claude-opus-4.5': { provider: 'openrouter', displayName: 'Claude Opus 4.5', structuredOutput: 'tool' },
  'anthropic/claude-sonnet-4.5': { provider: 'openrouter', displayName: 'Claude Sonnet 4.5', structuredOutput: 'tool' },

  // Google Gemini family (via OpenRouter)
  'google/gemini-2.5-flash-lite-preview-09-2025': { provider: 'openrouter', displayName: 'Gemini 2.5 Flash Lite', structuredOutput: 'tool' },
  'google/gemini-2.5-flash-preview-09-2025': { provider: 'openrouter', displayName: 'Gemini 2.5 Flash', structuredOutput: 'tool' },
  'google/gemini-2.5-pro': { provider: 'openrouter', displayName: 'Gemini 2.5 Pro', structuredOutput: 'tool' },
  'google/gemini-2.5-pro-preview-05-06': { provider: 'openrouter', displayName: 'Gemini 2.5 Pro Preview', structuredOutput: 'tool' },
  'google/gemini-3-flash-preview': { provider: 'openrouter', displayName: 'Gemini 3 Flash', structuredOutput: 'tool' },
  'google/gemini-3-pro-preview': { provider: 'openrouter', displayName: 'Gemini 3 Pro', structuredOutput: 'tool' },

  // Meta Llama 4 family
  'meta-llama/llama-4-maverick': { provider: 'openrouter', displayName: 'Llama 4 Maverick', structuredOutput: 'json_mode' },
  'meta-llama/llama-4-scout': { provider: 'openrouter', displayName: 'Llama 4 Scout', structuredOutput: 'json_mode' },

  // MiniMax family
  'minimax/minimax-01': { provider: 'openrouter', displayName: 'MiniMax 01', structuredOutput: 'json_mode' },
  'minimax/minimax-m1': { provider: 'openrouter', displayName: 'MiniMax M1', structuredOutput: 'json_mode' },

  // Mistral family
  'mistralai/devstral-2512': { provider: 'openrouter', displayName: 'Devstral', structuredOutput: 'json_mode' },
  'mistralai/devstral-2512:free': { provider: 'openrouter', displayName: 'Devstral (Free)', structuredOutput: 'json_mode' },
  'mistralai/ministral-14b-2512': { provider: 'openrouter', displayName: 'Ministral 14B', structuredOutput: 'json_mode' },
  'mistralai/ministral-8b-2512': { provider: 'openrouter', displayName: 'Ministral 8B', structuredOutput: 'json_mode' },
  'mistralai/mistral-large-2512': { provider: 'openrouter', displayName: 'Mistral Large', structuredOutput: 'json_mode' },

  // Moonshot Kimi family
  'moonshotai/kimi-k2-0905': { provider: 'openrouter', displayName: 'Kimi K2', structuredOutput: 'json_mode' },
  'moonshotai/kimi-k2-0905:exacto': { provider: 'openrouter', displayName: 'Kimi K2 Exacto', structuredOutput: 'json_mode' },
  'moonshotai/kimi-k2-thinking': { provider: 'openrouter', displayName: 'Kimi K2 Thinking', structuredOutput: 'json_mode' },

  // NVIDIA Nemotron
  'nvidia/nemotron-3-nano-30b-a3b': { provider: 'openrouter', displayName: 'Nemotron 3 Nano', structuredOutput: 'json_mode' },

  // OpenAI GPT-5.2 family
  'openai/gpt-5.2': { provider: 'openrouter', displayName: 'GPT-5.2', structuredOutput: 'schema' },
  'openai/gpt-5.2-pro': { provider: 'openrouter', displayName: 'GPT-5.2 Pro', structuredOutput: 'schema' },

  // Qwen family
  'qwen/qwen-plus-2025-07-28': { provider: 'openrouter', displayName: 'Qwen Plus', structuredOutput: 'json_mode' },
  'qwen/qwen-plus-2025-07-28:thinking': { provider: 'openrouter', displayName: 'Qwen Plus Thinking', structuredOutput: 'json_mode' },
  'qwen/qwen-turbo': { provider: 'openrouter', displayName: 'Qwen Turbo', structuredOutput: 'json_mode' },
  'qwen/qwen3-30b-a3b-instruct-2507': { provider: 'openrouter', displayName: 'Qwen3 30B', structuredOutput: 'json_mode' },
  'qwen/qwen3-next-80b-a3b-instruct': { provider: 'openrouter', displayName: 'Qwen3 Next 80B', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-235b-a22b-instruct': { provider: 'openrouter', displayName: 'Qwen3 VL 235B', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-235b-a22b-thinking': { provider: 'openrouter', displayName: 'Qwen3 VL 235B Thinking', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-30b-a3b-instruct': { provider: 'openrouter', displayName: 'Qwen3 VL 30B', structuredOutput: 'json_mode' },
  'qwen/qwen3-vl-32b-instruct': { provider: 'openrouter', displayName: 'Qwen3 VL 32B', structuredOutput: 'json_mode' },

  // xAI Grok family
  'x-ai/grok-4-fast': { provider: 'openrouter', displayName: 'Grok 4 Fast', structuredOutput: 'json_mode' },
  'x-ai/grok-4.1-fast': { provider: 'openrouter', displayName: 'Grok 4.1 Fast', structuredOutput: 'json_mode' },

  // Xiaomi MiMo
  'xiaomi/mimo-v2-flash:free': { provider: 'openrouter', displayName: 'MiMo V2 Flash (Free)', structuredOutput: 'json_mode' },
};

/**
 * Model pricing per 1K tokens (USD).
 * Pricing from OpenRouter API.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Amazon Nova
  'amazon/nova-2-lite-v1': { input: 0.00006, output: 0.00024 },
  'amazon/nova-lite-v1': { input: 0.00006, output: 0.00024 },
  'amazon/nova-premier-v1': { input: 0.003, output: 0.012 },
  'amazon/nova-pro-v1': { input: 0.0008, output: 0.0032 },

  // Anthropic Claude (4.5 series) - Corrected pricing per OpenRouter
  'anthropic/claude-haiku-4.5': { input: 0.001, output: 0.005 },
  'anthropic/claude-opus-4.5': { input: 0.005, output: 0.025 },
  'anthropic/claude-sonnet-4.5': { input: 0.003, output: 0.015 },

  // Google Gemini
  'google/gemini-2.5-flash-lite-preview-09-2025': { input: 0.000075, output: 0.0003 },
  'google/gemini-2.5-flash-preview-09-2025': { input: 0.00015, output: 0.0006 },
  'google/gemini-2.5-pro': { input: 0.00125, output: 0.005 },
  'google/gemini-2.5-pro-preview-05-06': { input: 0.00125, output: 0.005 },
  'google/gemini-3-flash-preview': { input: 0.000075, output: 0.0003 },
  'google/gemini-3-pro-preview': { input: 0.00125, output: 0.005 },

  // Meta Llama 4
  'meta-llama/llama-4-maverick': { input: 0.002, output: 0.006 },
  'meta-llama/llama-4-scout': { input: 0.0005, output: 0.0015 },

  // MiniMax
  'minimax/minimax-01': { input: 0.001, output: 0.001 },
  'minimax/minimax-m1': { input: 0.0005, output: 0.0005 },

  // Mistral
  'mistralai/devstral-2512': { input: 0.002, output: 0.006 },
  'mistralai/devstral-2512:free': { input: 0, output: 0 },
  'mistralai/ministral-14b-2512': { input: 0.0001, output: 0.0001 },
  'mistralai/ministral-8b-2512': { input: 0.00005, output: 0.00005 },
  'mistralai/mistral-large-2512': { input: 0.002, output: 0.006 },

  // Moonshot Kimi
  'moonshotai/kimi-k2-0905': { input: 0.001, output: 0.001 },
  'moonshotai/kimi-k2-0905:exacto': { input: 0.001, output: 0.001 },
  'moonshotai/kimi-k2-thinking': { input: 0.002, output: 0.002 },

  // NVIDIA Nemotron
  'nvidia/nemotron-3-nano-30b-a3b': { input: 0.0001, output: 0.0001 },

  // OpenAI GPT-5.2
  'openai/gpt-5.2': { input: 0.01, output: 0.03 },
  'openai/gpt-5.2-pro': { input: 0.03, output: 0.09 },

  // Qwen
  'qwen/qwen-plus-2025-07-28': { input: 0.0004, output: 0.0004 },
  'qwen/qwen-plus-2025-07-28:thinking': { input: 0.0008, output: 0.0008 },
  'qwen/qwen-turbo': { input: 0.0002, output: 0.0002 },
  'qwen/qwen3-30b-a3b-instruct-2507': { input: 0.0001, output: 0.0001 },
  'qwen/qwen3-next-80b-a3b-instruct': { input: 0.0003, output: 0.0003 },
  'qwen/qwen3-vl-235b-a22b-instruct': { input: 0.0005, output: 0.0005 },
  'qwen/qwen3-vl-235b-a22b-thinking': { input: 0.001, output: 0.001 },
  'qwen/qwen3-vl-30b-a3b-instruct': { input: 0.0001, output: 0.0001 },
  'qwen/qwen3-vl-32b-instruct': { input: 0.0001, output: 0.0001 },

  // xAI Grok
  'x-ai/grok-4-fast': { input: 0.002, output: 0.006 },
  'x-ai/grok-4.1-fast': { input: 0.002, output: 0.006 },

  // Xiaomi MiMo
  'xiaomi/mimo-v2-flash:free': { input: 0, output: 0 },
};

/**
 * Default pricing for unknown models.
 */
export const DEFAULT_PRICING = { input: 0.001, output: 0.003 };

/**
 * Get pricing for a model.
 */
export function getPricing(modelId: string): { input: number; output: number } {
  return MODEL_PRICING[modelId] || DEFAULT_PRICING;
}


/**
 * AI Provider exports.
 * 
 * PROVIDER ROUTING:
 * Each model has an `api_provider` field that determines which provider to use.
 * 
 * SUPPORTED PROVIDERS:
 * - openrouter: OpenRouter aggregator (default, access to many models)
 * - openai: Direct OpenAI API
 * - anthropic: Direct Anthropic API
 * - google: Direct Google Gemini API
 * - cerebras: Cerebras API (OpenAI-compatible)
 * - fireworks: Fireworks AI API (OpenAI-compatible)
 * - minimax: MiniMax API
 */

export { OpenRouterProvider } from './OpenRouterProvider.js';
export { GoogleAIProvider } from './GoogleAIProvider.js';
export { 
  OpenAICompatibleProvider,
  OpenAIProvider, 
  CerebrasProvider, 
  FireworksProvider 
} from './OpenAICompatibleProvider.js';
export { AnthropicProvider } from './AnthropicProvider.js';
export { MinimaxProvider } from './MinimaxProvider.js';

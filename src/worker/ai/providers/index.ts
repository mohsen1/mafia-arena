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
 * - xai: XAI/Grok API (OpenAI-compatible)
 * - deepseek: DeepSeek API (OpenAI-compatible)
 * - together: Together AI API (OpenAI-compatible)
 * - groq: Groq API (OpenAI-compatible)
 * - sambanova: SambaNova API (OpenAI-compatible)
 * - hyperbolic: Hyperbolic API (OpenAI-compatible)
 * - mistral: Mistral AI API (OpenAI-compatible)
 * - cohere: Cohere API (custom format)
 * - ai21: AI21 Labs API (custom format)
 */

export { OpenRouterProvider } from './OpenRouterProvider.js';
export { GoogleAIProvider } from './GoogleAIProvider.js';
export { 
  OpenAICompatibleProvider,
  OpenAIProvider, 
  CerebrasProvider, 
  FireworksProvider,
  XAIProvider,
  DeepSeekProvider,
  TogetherProvider,
  GroqProvider,
  SambaNovaProvider,
  HyperbolicProvider,
  MistralProvider,
} from './OpenAICompatibleProvider.js';
export { AnthropicProvider } from './AnthropicProvider.js';
export { MinimaxProvider } from './MinimaxProvider.js';
export { CohereProvider } from './CohereProvider.js';
export { AI21Provider } from './AI21Provider.js';
export { ExternalWorkerProvider } from './ExternalWorkerProvider.js';
export type { ExternalWorkerConfig, ExternalWorkerRequest, ExternalWorkerResponse } from './ExternalWorkerProvider.js';

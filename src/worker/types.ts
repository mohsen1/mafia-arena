/**
 * Cloudflare Worker environment type definitions.
 */

export interface Env {
  // Workflows - using inline type since Workflow isn't exposed at compile time
  MAFIA_WORKFLOW: {
    create(options: { id: string; params: unknown }): Promise<void>;
    get(id: string): Promise<{ status(): Promise<unknown> }>;
  };

  // Durable Objects
  GAME_RUNNER: DurableObjectNamespace;

  // D1 Database
  DB: D1Database;

  // R2 Bucket
  TRANSCRIPTS: R2Bucket;

  // KV Namespace for rate limiting and circuit breaker
  RATE_LIMIT: KVNamespace;

  // Queues
  BATCH_QUEUE: Queue<BatchQueueMessage>;
  GAME_QUEUE: Queue<GameQueueMessage>;

  // Analytics Engine for real-time metrics
  ANALYTICS: AnalyticsEngineDataset;

  // Environment variables
  ENVIRONMENT: string;

  // API Keys (secrets)
  /** OpenRouter API key - used as the default aggregator for all models */
  OPENROUTER_API_KEY: string;
  /** OpenAI API key - for direct OpenAI API access */
  OPENAI_API_KEY?: string;
  /** Anthropic API key - for direct Anthropic API access */
  ANTHROPIC_API_KEY?: string;
  /** Google AI API key - for direct Google Gemini API access */
  GOOGLE_API_KEY?: string;
  /** Cerebras API key - for Cerebras API access */
  CEREBRAS_API_KEY?: string;
  /** MiniMax API key - for MiniMax API access */
  MINIMAX_API_KEY?: string;
  /** Fireworks API key - for Fireworks AI API access */
  FIREWORKS_API_KEY?: string;
  /** XAI API key - for Grok models (direct API access) */
  XAI_API_KEY?: string;
  /** DeepSeek API key - for DeepSeek V3/R1 (direct API access) */
  DEEPSEEK_API_KEY?: string;
  /** Together AI API key - for open-source models */
  TOGETHER_API_KEY?: string;
  /** Groq API key - for fast inference */
  GROQ_API_KEY?: string;
  /** SambaNova API key - for free Llama access */
  SAMBANOVA_API_KEY?: string;
  /** Hyperbolic API key - for free tier access */
  HYPERBOLIC_API_KEY?: string;
  /** Mistral AI API key - for Mistral models (direct API access) */
  MISTRAL_API_KEY?: string;
  /** Cohere API key - for Command models */
  COHERE_API_KEY?: string;
  /** AI21 Labs API key - for Jamba models */
  AI21_API_KEY?: string;

  // Admin authentication (secrets)
  /** @deprecated Use ADMIN_EMAIL with Google OAuth instead */
  ADMIN_USERNAME: string;
  /** @deprecated Use ADMIN_EMAIL with Google OAuth instead */
  ADMIN_PASSWORD: string;
  
  // Google OAuth (new authentication)
  /** Google OAuth Client ID */
  GOOGLE_CLIENT_ID?: string;
  /** Google OAuth Client Secret */
  GOOGLE_CLIENT_SECRET?: string;
  /** Admin email address for Google OAuth (e.g., admin@example.com) */
  ADMIN_EMAIL?: string;
  /** JWT secret for signing session tokens (auto-generated if not set) */
  SESSION_SECRET?: string;
  
  // Frontend URL for OAuth redirects
  /** Frontend URL for OAuth redirects (e.g., http://localhost:4321 in dev, https://mafia-arena.com in prod) */
  FRONTEND_URL?: string;
  /** OAuth callback URL override (needed when wrangler rewrites the host in dev) */
  OAUTH_CALLBACK_URL?: string;
  
  // User API key encryption
  /** Secret for encrypting user API keys (32-byte random string, required for key management) */
  ENCRYPTION_SECRET?: string;
}

// =============================================================================
// PROVIDER TYPES
// =============================================================================

/**
 * Supported API providers for AI model access.
 */
export type ApiProvider = 
  | 'openrouter'   // OpenRouter aggregator (default)
  | 'openai'       // Direct OpenAI API
  | 'anthropic'    // Direct Anthropic API
  | 'google'       // Direct Google Gemini API
  | 'cerebras'     // Cerebras API (OpenAI-compatible)
  | 'minimax'      // MiniMax API
  | 'fireworks'    // Fireworks AI API (OpenAI-compatible)
  | 'xai'          // XAI/Grok API (OpenAI-compatible)
  | 'deepseek'     // DeepSeek API (OpenAI-compatible)
  | 'together'     // Together AI API (OpenAI-compatible)
  | 'groq'         // Groq API (OpenAI-compatible)
  | 'sambanova'    // SambaNova API (OpenAI-compatible) - hidden from UI
  | 'hyperbolic'   // Hyperbolic API (OpenAI-compatible) - hidden from UI
  | 'mistral'      // Mistral AI API (OpenAI-compatible)
  | 'cohere'       // Cohere API (custom format)
  | 'ai21';        // AI21 Labs API (custom format)

/**
 * Provider configuration from database.
 */
export interface ProviderConfig {
  id: ApiProvider;
  displayName: string;
  apiType: 'openai_compatible' | 'anthropic' | 'google' | 'custom';
  baseUrl?: string;
  isAggregator: boolean;
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  enabled: boolean;
}

/**
 * Model configuration with provider routing info.
 */
export interface ModelDbRecord {
  id: string;
  family: string;
  display_name: string;
  api_provider: ApiProvider;
  api_model_id: string;
  config: string | null;
  created_at: number;
  /** Whether this model's provider supports batch API pricing (0 or 1) */
  supports_batch_pricing: number;
}

/**
 * Analytics Engine dataset interface.
 */
export interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

/**
 * Message structure for the batch queue (large job requests).
 */
export interface BatchQueueMessage {
  batchId: string;
  config: BatchConfig;
  createdAt: number;
  /** Trace ID for distributed tracing */
  traceId?: string;
}

/**
 * Batch configuration for creating multiple games.
 */
export interface BatchConfig {
  name?: string;
  totalGames: number;
  gameConfig: GameQueueConfig;
  createdBy?: string;
  /** Use batch API for 50% cost savings (24h delay) */
  useBatchAPI?: boolean;
}

/**
 * Batch status in the database.
 */
export type BatchStatus = 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused';

/**
 * Batch record from the database.
 */
export interface BatchRecord {
  id: string;
  name: string | null;
  status: BatchStatus;
  total_games: number;
  /** Number of games successfully queued to GAME_QUEUE (checkpoint for resume) */
  games_queued: number;
  completed_games: number;
  failed_games: number;
  config_json: string;
  estimated_cost_usd: number | null;
  actual_cost_usd: number;
  created_by: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  error_message: string | null;
}

/**
 * Message structure for the game queue.
 */
export interface GameQueueMessage {
  gameId: string;
  batchId: string;
  config: GameQueueConfig;
  createdAt: number;
  /** Trace ID for distributed tracing */
  traceId?: string;
}

/**
 * Game configuration as passed through the queue.
 */
export interface GameQueueConfig {
  playerCount: number;
  mafiaCount: number;
  teams: Array<{
    modelId: string;
    team: 'mafia' | 'town';
    count: number;
  }>;
  maxRounds: number;
  discussionEnabled: boolean;
  personaConstraints: 'strict' | 'moderate' | 'free';
  /** Optional seed for reproducible games (generated if not provided) */
  seed?: number;
  /** 
   * Context level for AI players:
   * - 'full': Complete history from Round 1 (leverages large context windows)
   * - 'windowed': Last N rounds verbatim + summary of earlier rounds
   * - 'summary': Current round only (default)
   */
  contextLevel?: 'full' | 'windowed' | 'summary';
  /** Number of rounds to include in windowed context (default: 3) */
  contextWindowSize?: number;
  /** 
   * Persona theme for pre-assigned names and archetypes (default: 'noir')
   * Ensures unique names and diverse personalities across players.
   */
  personaTheme?: 'noir' | 'victorian' | 'modern' | 'fantasy';
  /**
   * Use discount pricing mode (50% cheaper, up to 24h response time).
   * Games using this mode have a 48-hour stale threshold instead of 10 minutes.
   * The game state is persisted to allow resumption after long AI response delays.
   */
  discountPricing?: boolean;
}

// =============================================================================
// ADMIN TYPES
// =============================================================================

/**
 * System state for circuit breaker and controls.
 */
export interface SystemState {
  processingPaused: boolean;
  maxConcurrentGames: number;
}

/**
 * Live admin statistics.
 */
export interface AdminStats {
  gamesRunning: number;
  gamesQueued: number;
  batchesActive: number;
  costToday: number;
  systemPaused: boolean;
}

/**
 * Daily statistics record.
 */
export interface DailyStats {
  date: string;
  games_completed: number;
  games_failed: number;
  tokens_used: number;
  cost_usd: number;
  mafia_wins: number;
  town_wins: number;
}

/**
 * Cost estimation result.
 */
export interface CostEstimate {
  estimatedCostUsd: number;
  tokensPerGame: number;
  totalTokens: number;
  timeEstimateMinutes: number;
  useBatchAPI: boolean;
  savings: number;
}


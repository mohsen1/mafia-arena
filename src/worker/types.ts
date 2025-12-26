/**
 * Cloudflare Worker environment type definitions.
 */

export interface Env {
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
  /** AI Request Queue for offloaded AI calls (suspense pattern) */
  AI_REQUEST_QUEUE: Queue<import('./ai/types.js').AIRequestMessage>;

  // Analytics Engine for real-time metrics
  ANALYTICS: AnalyticsEngineDataset;

  // Environment variables
  ENVIRONMENT: string;

  // API Keys (secrets)
  /** OpenRouter API key - used for all AI model requests */
  OPENROUTER_API_KEY: string;
  /** Google AI API key - used for direct Google API access (optional, faster than OpenRouter for Google models) */
  GOOGLE_API_KEY?: string;

  // Admin authentication (secrets)
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
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


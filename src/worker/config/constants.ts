/**
 * Centralized configuration constants for Mafia Arena worker.
 * All magic numbers and hardcoded values should be defined here.
 */

// =============================================================================
// AI Provider Timeouts
// =============================================================================

export const AI_TIMEOUT = {
  /** Standard timeout for individual AI requests (60 seconds) */
  STANDARD: 60 * 1000,
  /** Timeout for batch polling operations (5 minutes) */
  BATCH_POLL: 5 * 60 * 1000,
  /** Maximum timeout for long-running operations with discount pricing (48 hours) */
  LONG_RUNNING: 48 * 60 * 60 * 1000,
} as const;

// =============================================================================
// Retry Configuration
// =============================================================================

export const RETRY = {
  /** Maximum number of retry attempts for failed requests */
  MAX_ATTEMPTS: 3,
  /** Base delay between retries in milliseconds (3 seconds) */
  BASE_DELAY_MS: 3000,
  /** Maximum delay between retries in milliseconds (60 seconds) */
  MAX_DELAY_MS: 60 * 1000,
  /** Whether to use exponential backoff for retries */
  EXPONENTIAL_BACKOFF: true,
} as const;

// =============================================================================
// Storage Limits
// =============================================================================

export const STORAGE_LIMITS = {
  /** Maximum KV value size in bytes (Cloudflare KV limit is 25MB, Workflows has 128KB limit) */
  KV_MAX_SIZE: 128 * 1024,
  /** Safe KV value size threshold to leave room for JSON overhead (100KB) */
  KV_SAFE_SIZE: 100 * 1024,
  /** Maximum R2 stream size in bytes (50MB) */
  R2_MAX_STREAM_SIZE: 50 * 1024 * 1024,
  /** Maximum number of events to store in KV (for real-time frontend display) */
  MAX_EVENTS_IN_KV: 20,
  /** Maximum number of events in R2 event stream */
  MAX_EVENT_STREAM_EVENTS: 10000,
} as const;

// =============================================================================
// Rate Limits
// =============================================================================

export const RATE_LIMITS = {
  /** Default rate limit for most endpoints (60 requests per minute) */
  DEFAULT_REQUESTS_PER_MINUTE: 60,
  /** Rate limit for admin users (100 requests per minute) */
  ADMIN_REQUESTS_PER_MINUTE: 100,
  /** Rate limit for batch creation (10 per hour) */
  BATCH_CREATION_PER_HOUR: 10,
  /** Batch creation specific limit: 1 per 5 minutes */
  BATCH_CREATION_WINDOW_MS: 5 * 60 * 1000,
} as const;

// =============================================================================
// Pagination
// =============================================================================

export const PAGINATION = {
  /** Default page size for list endpoints */
  DEFAULT_PAGE_SIZE: 20,
  /** Maximum page size allowed */
  MAX_PAGE_SIZE: 100,
  /** Maximum number of games to show per page */
  MAX_GAMES_PER_PAGE: 50,
} as const;

// =============================================================================
// Game Configuration
// =============================================================================

export const GAME = {
  /** Default maximum number of rounds in a game */
  DEFAULT_MAX_ROUNDS: 10,
  /** Default number of players in a game */
  DEFAULT_PLAYER_COUNT: 11,
  /** Default number of mafia players */
  DEFAULT_MAFIA_COUNT: 2,
  /** Default context window size for conversation history */
  CONTEXT_WINDOW_SIZE: 3,
} as const;

// =============================================================================
// KV Storage TTL
// =============================================================================

export const KV_TTL = {
  /** TTL for game state in KV (24 hours) */
  GAME_STATE: 24 * 60 * 60,
  /** TTL for rate limit windows (60 seconds) */
  RATE_LIMIT: 60,
} as const;

// =============================================================================
// Batch API Configuration
// =============================================================================

export const BATCH = {
  /** Maximum number of requests to bundle in a single batch */
  MAX_BUNDLE_SIZE: 100,
  /** Timeout for batch aggregation in seconds */
  AGGREGATION_TIMEOUT_SEC: 300, // 5 minutes
  /** Estimated batch processing time in hours */
  ESTIMATED_PROCESSING_HOURS: 4,
} as const;

// =============================================================================
// WebSocket Configuration
// =============================================================================

export const WEBSOCKET = {
  /** Heartbeat interval in milliseconds */
  HEARTBEAT_INTERVAL_MS: 30_000,
  /** Maximum time without heartbeat before considering connection dead */
  HEARTBEAT_TIMEOUT_MS: 60_000,
} as const;

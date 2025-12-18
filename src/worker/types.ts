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

  // KV Namespace for rate limiting
  RATE_LIMIT: KVNamespace;

  // Queues
  GAME_QUEUE: Queue<GameQueueMessage>;

  // Environment variables
  ENVIRONMENT: string;

  // API Keys (secrets)
  OPENAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  GOOGLE_API_KEY: string;
}

/**
 * Message structure for the game queue.
 */
export interface GameQueueMessage {
  gameId: string;
  batchId: string;
  config: GameQueueConfig;
  createdAt: number;
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
}


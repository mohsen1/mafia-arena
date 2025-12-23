/**
 * Test setup utilities for Worker E2E tests.
 *
 * Provides helpers for:
 * - Initializing D1 database schema
 * - Setting up mock providers
 * - Common test utilities
 */

/**
 * Initialize the D1 database with the test schema.
 * Call this in beforeAll or beforeEach.
 */
export async function initializeTestDatabase(db: D1Database): Promise<void> {
  // Execute tables first, then indexes, then inserts
  const tableStatements = [
    `CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      config TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      config_hash TEXT NOT NULL,
      player_count INTEGER NOT NULL,
      mafia_count INTEGER NOT NULL,
      winner TEXT CHECK (winner IN ('mafia', 'town')),
      rounds INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
      error_message TEXT,
      seed INTEGER,
      persona_theme TEXT DEFAULT 'noir',
      trace_id TEXT,
      discount_pricing INTEGER DEFAULT 0,
      last_activity INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS game_participants (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
      player_count INTEGER NOT NULL,
      won INTEGER NOT NULL DEFAULT 0 CHECK (won IN (0, 1))
    )`,
    `CREATE TABLE IF NOT EXISTS leaderboard (
      model_id TEXT NOT NULL,
      team TEXT NOT NULL CHECK (team IN ('mafia', 'town')),
      games_played INTEGER NOT NULL DEFAULT 0,
      games_won INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (model_id, team)
    )`,
    `CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'cancelled', 'paused')),
      total_games INTEGER NOT NULL,
      completed_games INTEGER DEFAULT 0,
      failed_games INTEGER DEFAULT 0,
      config_json TEXT NOT NULL,
      estimated_cost_usd REAL,
      actual_cost_usd REAL DEFAULT 0,
      created_by TEXT DEFAULT 'api',
      created_at INTEGER DEFAULT (unixepoch()),
      started_at INTEGER,
      completed_at INTEGER,
      error_message TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      games_completed INTEGER DEFAULT 0,
      games_failed INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      mafia_wins INTEGER DEFAULT 0,
      town_wins INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS error_log (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL CHECK (level IN ('error', 'warn', 'info')),
      message TEXT NOT NULL,
      stack TEXT,
      context TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
    `CREATE TABLE IF NOT EXISTS dlq_entries (
      id TEXT PRIMARY KEY,
      queue_name TEXT NOT NULL,
      message_body TEXT NOT NULL,
      error_message TEXT NOT NULL,
      error_stack TEXT,
      attempts INTEGER NOT NULL,
      created_at INTEGER DEFAULT (unixepoch())
    )`,
  ];

  const indexStatements = [
    `CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_games_batch ON games(batch_id)`,
    `CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_game ON game_participants(game_id)`,
    `CREATE INDEX IF NOT EXISTS idx_participants_model ON game_participants(model_id)`,
    `CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status)`,
  ];

  const insertStatements = [
    `INSERT OR IGNORE INTO system_state (key, value) VALUES ('processing_paused', 'false')`,
    `INSERT OR IGNORE INTO system_state (key, value) VALUES ('max_concurrent_games', '50')`,
    `INSERT OR IGNORE INTO models (id, provider, display_name) VALUES ('test-model', 'test', 'Test Model')`,
  ];

  // Execute all statements in order
  const allStatements = [...tableStatements, ...indexStatements, ...insertStatements];

  for (const statement of allStatements) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      // Ignore "already exists" errors
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        console.error(`Failed to execute: ${statement.slice(0, 60)}...`);
        throw error;
      }
    }
  }
}

/**
 * Clean up test data between tests.
 * Keeps the schema but removes all data.
 */
export async function cleanupTestData(db: D1Database): Promise<void> {
  const tables = [
    'game_participants',
    'games',
    'leaderboard',
    'batches',
    'daily_stats',
    'error_log',
    'dlq_entries',
  ];

  for (const table of tables) {
    try {
      await db.prepare(`DELETE FROM ${table}`).run();
    } catch {
      // Ignore errors - table might not exist
    }
  }
}

/**
 * Helper to wait for a game to complete (for polling tests).
 */
export async function waitForGameCompletion(
  db: D1Database,
  gameId: string,
  timeoutMs: number = 30000,
  pollIntervalMs: number = 500
): Promise<{ status: string; winner?: string }> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const game = await db
      .prepare('SELECT status, winner FROM games WHERE id = ?')
      .bind(gameId)
      .first<{ status: string; winner: string | null }>();

    if (game && (game.status === 'completed' || game.status === 'failed')) {
      return { status: game.status, winner: game.winner ?? undefined };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Game ${gameId} did not complete within ${timeoutMs}ms`);
}

/**
 * Helper to verify game results in D1.
 */
export async function getGameFromDb(
  db: D1Database,
  gameId: string
): Promise<{
  id: string;
  status: string;
  winner: string | null;
  rounds: number;
  total_tokens: number;
  duration_ms: number;
  seed: number | null;
} | null> {
  return db
    .prepare(
      'SELECT id, status, winner, rounds, total_tokens, duration_ms, seed FROM games WHERE id = ?'
    )
    .bind(gameId)
    .first();
}

/**
 * Helper to verify leaderboard entries.
 */
export async function getLeaderboardEntry(
  db: D1Database,
  modelId: string,
  team: 'mafia' | 'town'
): Promise<{
  games_played: number;
  games_won: number;
  total_tokens: number;
} | null> {
  return db
    .prepare(
      'SELECT games_played, games_won, total_tokens FROM leaderboard WHERE model_id = ? AND team = ?'
    )
    .bind(modelId, team)
    .first();
}

/**
 * Helper to verify participants.
 */
export async function getGameParticipants(
  db: D1Database,
  gameId: string
): Promise<Array<{ model_id: string; team: string; player_count: number; won: number }>> {
  const result = await db
    .prepare(
      'SELECT model_id, team, player_count, won FROM game_participants WHERE game_id = ?'
    )
    .bind(gameId)
    .all();

  return result.results as Array<{
    model_id: string;
    team: string;
    player_count: number;
    won: number;
  }>;
}


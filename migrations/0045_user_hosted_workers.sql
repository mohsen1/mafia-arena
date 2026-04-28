-- Migration: User-hosted Workers for API Key Isolation
-- Issue: #148
-- Description: Allows users to deploy their own Cloudflare Workers to manage API keys,
--              achieving cryptographic isolation from the main system.

-- User external workers: Store configuration for user-deployed Workers
CREATE TABLE IF NOT EXISTS user_external_workers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Worker',
  worker_url TEXT NOT NULL,
  auth_token_hash TEXT NOT NULL,        -- SHA-256 hash (never store plaintext)
  auth_token_fingerprint TEXT NOT NULL, -- Last 4 chars for UI display
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  supported_providers TEXT,             -- JSON array ["openai", "anthropic"]
  last_health_check INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER,
  UNIQUE(user_id, worker_url)
);

CREATE INDEX IF NOT EXISTS idx_user_external_workers_user ON user_external_workers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_external_workers_status ON user_external_workers(status);

-- User reputation/trust tracking for integrity verification
CREATE TABLE IF NOT EXISTS user_reputation (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  trust_score REAL NOT NULL DEFAULT 0.5 CHECK (trust_score >= 0 AND trust_score <= 1),
  total_games_played INTEGER NOT NULL DEFAULT 0,
  flagged_games INTEGER NOT NULL DEFAULT 0,
  verification_passes INTEGER NOT NULL DEFAULT 0,
  verification_failures INTEGER NOT NULL DEFAULT 0,
  last_verification_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER
);

-- Verification audit log for tracking all verification attempts
CREATE TABLE IF NOT EXISTS verification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('token', 'challenge', 'timing', 'behavioral')),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  details TEXT,                           -- JSON with verification specifics
  latency_ms INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS idx_verification_log_game ON verification_log(game_id);
CREATE INDEX IF NOT EXISTS idx_verification_log_user ON verification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_log_created ON verification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_verification_log_type_passed ON verification_log(verification_type, passed);

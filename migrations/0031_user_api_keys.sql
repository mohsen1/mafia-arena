-- User API Keys Migration
-- Adds users table (synced from Google OAuth) and user_api_keys table for encrypted API keys

-- Users table: Store authenticated users from Google OAuth
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  picture TEXT,
  is_admin INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- User API Keys table: Store encrypted API keys per user per provider
CREATE TABLE IF NOT EXISTS user_api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'openrouter', etc.
  encrypted_key TEXT NOT NULL,
  iv_vector TEXT NOT NULL, -- Initialization vector for AES-GCM
  key_fingerprint TEXT NOT NULL, -- First 4 / Last 4 chars for UI display (e.g., "sk-...1234")
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER,
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_api_keys_user ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(provider);


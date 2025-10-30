-- Melody Auth Database Schema for Cloudflare D1
-- Compatible with existing PostgreSQL Drizzle setup
-- Migration from NextAuth to Melody Auth

-- Users table (compatible with existing schema)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  email_verified DATETIME,
  password TEXT, -- For credentials provider
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OAuth accounts (for Google/GitHub providers)
CREATE TABLE oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_account_id)
);

-- Sessions (for JWT strategy with KV storage, but keeping for compatibility)
CREATE TABLE sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Verification tokens (for email verification if enabled later)
CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires DATETIME NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- User metadata (for additional user data)
CREATE TABLE user_metadata (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, key)
);

-- Indexes for performance optimization
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires);
CREATE INDEX idx_verification_tokens_identifier ON verification_tokens(identifier);
CREATE INDEX idx_verification_tokens_token ON verification_tokens(token);

-- Create views for easier querying (optional)
CREATE VIEW user_sessions AS
SELECT 
  u.id,
  u.email,
  u.name,
  u.image,
  u.email_verified,
  u.created_at,
  u.updated_at,
  COUNT(s.session_token) as active_sessions
FROM users u
LEFT JOIN sessions s ON u.id = s.user_id AND s.expires > datetime('now')
GROUP BY u.id;

-- Migration helper functions
-- Function to migrate NextAuth users to Melody format
-- This can be run after deploying the new schema
/*
INSERT INTO users (id, email, name, image, email_verified, password)
SELECT 
  id,
  email,
  name,
  image,
  email_verified,
  password
FROM existing_users_table;
*/
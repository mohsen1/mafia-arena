-- Batch API tables for multi-provider discount pricing (40-50% savings)
-- Supports: Anthropic, OpenAI, Google, Cerebras, Fireworks batch APIs

-- Track batch jobs submitted to provider APIs
CREATE TABLE IF NOT EXISTS batch_api_jobs (
  id TEXT PRIMARY KEY,  -- Our internal job ID (UUID)
  provider TEXT NOT NULL,  -- 'anthropic', 'openai', 'google', 'cerebras', 'fireworks'
  provider_job_id TEXT,  -- Provider's job/batch identifier (assigned after submission)
  model_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploading', 'submitted', 'processing', 'completed', 'failed', 'cancelled', 'expired')),
  request_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  input_resource_id TEXT,  -- Provider file ID or URI (OpenAI file-xxx, Google gs://..., etc)
  output_resource_id TEXT,  -- Provider output file ID or URI
  metadata TEXT,  -- JSON for provider-specific configs (completion_window, headers, etc)
  error_message TEXT,
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  submitted_at INTEGER,  -- When actually submitted to provider
  completed_at INTEGER,
  expires_at INTEGER  -- 24h from submission typically
);

-- Track individual AI requests waiting for batching or currently in a batch
CREATE TABLE IF NOT EXISTS batch_api_requests (
  id TEXT PRIMARY KEY,  -- Internal request ID (UUID)
  request_id TEXT NOT NULL,  -- Original request ID from AIRequestMessage
  custom_id TEXT NOT NULL,  -- Correlation ID sent to provider (gameId_round_phase_playerId)
  batch_job_id TEXT,  -- References batch_api_jobs.id when bundled
  game_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,  -- 'anthropic', 'openai', 'google', 'cerebras', 'fireworks'
  request_body TEXT NOT NULL,  -- JSON serialized CompletionRequest
  context_json TEXT NOT NULL,  -- JSON serialized context (round, phase, playerId, actionType)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'bundled', 'completed', 'failed')),
  response_body TEXT,  -- JSON serialized CompletionResponse when completed
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  updated_at INTEGER,
  FOREIGN KEY (batch_job_id) REFERENCES batch_api_jobs(id)
);

-- Indexes for batch_api_jobs
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_api_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_provider_status ON batch_api_jobs(provider, status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_provider_job_id ON batch_api_jobs(provider_job_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_expires ON batch_api_jobs(expires_at);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created ON batch_api_jobs(created_at);

-- Indexes for batch_api_requests
CREATE INDEX IF NOT EXISTS idx_batch_req_status_provider ON batch_api_requests(status, provider);
CREATE INDEX IF NOT EXISTS idx_batch_req_game ON batch_api_requests(game_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_job ON batch_api_requests(batch_job_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_custom_id ON batch_api_requests(custom_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_request_id ON batch_api_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_created ON batch_api_requests(created_at);

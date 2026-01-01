-- Add 'claiming' status for batch aggregation atomic claim mechanism
-- This prevents race conditions when multiple cron workers run simultaneously

-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table
-- Step 1: Create new table with updated constraint
CREATE TABLE batch_api_requests_new (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  custom_id TEXT NOT NULL,
  batch_job_id TEXT,
  game_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  request_body TEXT NOT NULL,
  context_json TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'claiming', 'bundled', 'completed', 'failed')),
  response_body TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch() * 1000),
  updated_at INTEGER,
  claim_id TEXT,
  claim_expires_at INTEGER,
  trace_id TEXT,
  FOREIGN KEY (batch_job_id) REFERENCES batch_api_jobs(id)
);

-- Step 2: Copy data from old table
INSERT INTO batch_api_requests_new 
SELECT id, request_id, custom_id, batch_job_id, game_id, model_id, provider,
       request_body, context_json, status, response_body, input_tokens, output_tokens,
       cost_usd, error_message, retry_count, created_at, updated_at, claim_id, 
       claim_expires_at, trace_id
FROM batch_api_requests;

-- Step 3: Drop old table
DROP TABLE batch_api_requests;

-- Step 4: Rename new table
ALTER TABLE batch_api_requests_new RENAME TO batch_api_requests;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_batch_req_status_provider ON batch_api_requests(status, provider);
CREATE INDEX IF NOT EXISTS idx_batch_req_game ON batch_api_requests(game_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_job ON batch_api_requests(batch_job_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_custom_id ON batch_api_requests(custom_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_request_id ON batch_api_requests(request_id);
CREATE INDEX IF NOT EXISTS idx_batch_req_created ON batch_api_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_batch_requests_claim ON batch_api_requests(status, claim_id, claim_expires_at);

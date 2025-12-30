-- Add claim columns for atomic batch aggregation
-- Prevents race conditions when multiple cron workers run simultaneously

-- claim_id: Unique ID for the aggregation run that claimed this request
-- claim_expires_at: When the claim expires (allows recovery from crashed workers)
ALTER TABLE batch_api_requests ADD COLUMN claim_id TEXT;
ALTER TABLE batch_api_requests ADD COLUMN claim_expires_at INTEGER;

-- Index for efficient claim queries
CREATE INDEX IF NOT EXISTS idx_batch_requests_claim 
  ON batch_api_requests(status, claim_id, claim_expires_at);



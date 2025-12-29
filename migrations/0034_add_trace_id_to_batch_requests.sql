-- Add trace_id column to batch_api_requests for distributed tracing
-- Allows tracking batch requests across the full system flow
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0034_add_trace_id_to_batch_requests.sql

-- Add trace_id column to batch_api_requests table
ALTER TABLE batch_api_requests ADD COLUMN trace_id TEXT;

-- Create index for looking up batch requests by trace ID
CREATE INDEX IF NOT EXISTS idx_batch_req_trace_id ON batch_api_requests(trace_id);


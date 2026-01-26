-- Add cost tracking columns to batch_api_requests table
-- This enables calculation of actual savings from batch API pricing

-- Add individual_cost_usd column (estimated cost at standard API pricing)
ALTER TABLE batch_api_requests ADD COLUMN individual_cost_usd REAL;

-- Add batch_cost_usd column (actual cost at batch discount pricing)
ALTER TABLE batch_api_requests ADD COLUMN batch_cost_usd REAL;

-- Create index for efficient cost aggregation queries
CREATE INDEX IF NOT EXISTS idx_batch_req_costs ON batch_api_requests(individual_cost_usd, batch_cost_usd);

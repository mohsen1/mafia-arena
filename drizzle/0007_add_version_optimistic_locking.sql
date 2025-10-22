-- Add version column for optimistic locking
ALTER TABLE games ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

-- Update existing records to have version 1
UPDATE games SET version = 1 WHERE version IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN games.version IS 'Optimistic locking version to prevent concurrent modifications';

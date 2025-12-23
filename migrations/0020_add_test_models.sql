-- Add test models for E2E testing (MockE2EProvider)
-- These models are used for zero-cost testing without calling real LLMs
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0020_add_test_models.sql

INSERT OR IGNORE INTO models (id, provider, display_name) VALUES
  -- Test models (MockE2EProvider)
  ('test/mock-fast', 'test', 'Mock Fast (E2E Testing)'),
  ('test/town-wins', 'test', 'Mock Town Wins (E2E Testing)'),
  ('test/mafia-wins', 'test', 'Mock Mafia Wins (E2E Testing)');


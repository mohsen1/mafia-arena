-- Remove future/hypothetical models that were added but don't exist yet
-- Run with: wrangler d1 execute mafia-arena --file=./migrations/0008_remove_future_models.sql

-- Remove hypothetical OpenAI GPT-5.x models (don't exist yet)
DELETE FROM models WHERE id IN ('gpt-5.2', 'gpt-5.2-pro', 'gpt-5.1');

-- Remove hypothetical Anthropic Claude 4.5 models (don't exist yet)
DELETE FROM models WHERE id IN ('claude-opus-4.5', 'claude-sonnet-4.5', 'claude-haiku-4.5');

-- Remove hypothetical Google Gemini 3.x models (don't exist yet)
DELETE FROM models WHERE id IN ('gemini-3-pro-preview', 'gemini-3-flash-preview');

-- STRUCTURED OUTPUT SUPPORT (verified Dec 2024):
-- 
-- All models below are supported with varying reliability levels:
-- 
-- OpenAI:
--   gpt-4o, gpt-4o-mini: 'schema' - Full json_schema (100% reliable)
--   gpt-4-turbo: 'json_mode' - json_object + prompt instructions (high reliability)
-- 
-- Anthropic:
--   claude-3-*, claude-3-5-*: 'tool' - tool_use (100% reliable)
-- 
-- Google Gemini:
--   gemini-2.0-*, gemini-2.5-*: 'schema' - Full responseSchema (100% reliable)
--   gemini-1.5-*: 'json_mode' - responseMimeType + prompt instructions (high reliability)


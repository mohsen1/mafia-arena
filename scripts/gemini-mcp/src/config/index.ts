import { join } from 'path';
import * as dotenv from 'dotenv';
import { existsSync, mkdirSync } from 'fs';

/**
 * Centralized configuration module for the Gemini MCP refactor.
 *
 * This module is responsible for loading environment variables and exporting
 * all paths and constants used throughout the Gemini MCP code-base.
 *
 * NOTE: All other modules should import configuration values exclusively from
 * this file to ensure a single source of truth.
 */

// -------------------------------------------------------------------------------------
// Environment variables
// -------------------------------------------------------------------------------------

dotenv.config({ path: join(process.cwd(), '.env') });

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
export const GH_ACCESS_TOKEN = process.env.GH_ACCESS_TOKEN ?? '';

if (!GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY environment variable is required but not set');
}

// -------------------------------------------------------------------------------------
// Paths
// -------------------------------------------------------------------------------------

/** Absolute path to the workspace root (process.cwd()) */
export const ROOT_DIR = process.cwd();

/** Directory where all Gemini MCP related artefacts should live */
export const GEMINI_MCP_DIR = join(ROOT_DIR, 'scripts', 'gemini-mcp');

/** Ensure the artefacts directory exists */
if (!existsSync(GEMINI_MCP_DIR)) {
  mkdirSync(GEMINI_MCP_DIR, { recursive: true });
}

export const LOG_FILE = join(ROOT_DIR, 'gemini-mcp-server.log');
export const BACKLOG_FILE = join(ROOT_DIR, 'gemini-mcp-backlog.json');
export const PROMPT_HISTORY_FILE = join(ROOT_DIR, '.gemini-prompt-history.json');

// -------------------------------------------------------------------------------------
// GitHub configuration
// -------------------------------------------------------------------------------------

/** Format: <owner>/<repo> */
export const GITHUB_REPO = 'mohsen1/werewolf-ai';
export const GITHUB_API_BASE = 'https://api.github.com';

// -------------------------------------------------------------------------------------
// Time-outs and intervals
// -------------------------------------------------------------------------------------

/** 10 minutes in ms – used to detect stuck commands */
export const STUCK_COMMAND_TIMEOUT = 10 * 60 * 1000;

/** Maximum prompt history entries retained */
export const MAX_HISTORY_LENGTH = 50;

/** Watchdog tick interval (5 minutes) */
export const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;

// -------------------------------------------------------------------------------------
// Miscellaneous constants
// -------------------------------------------------------------------------------------

/** How many screenshots the watchdog should keep to compare for stuck detection */
export const SCREENSHOT_HISTORY_SIZE = 3; 
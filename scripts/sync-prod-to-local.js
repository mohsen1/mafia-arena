#!/usr/bin/env node
/**
 * Sync production D1 database to local SQLite for development
 * 
 * Usage:
 *   node scripts/sync-prod-to-local.js           # Full sync
 *   node scripts/sync-prod-to-local.js --schema  # Schema only (no data)
 * 
 * This script:
 * 1. Exports production D1 using `wrangler d1 export`
 * 2. Injects PRAGMA foreign_keys=OFF for clean import
 * 3. Imports directly into local SQLite file (bypasses wrangler HTTP bridge)
 * 
 * Prerequisites:
 *   - sqlite3 CLI installed (brew install sqlite3)
 *   - wrangler configured with D1 database
 */

import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const BACKUP_FILE = path.join(ROOT_DIR, '.prod-dump.sql');
const TEMP_FILE = path.join(ROOT_DIR, '.temp-import.sql');
const DB_NAME = 'mafia-arena'; // Database name from wrangler.toml

// Parse CLI args
const args = process.argv.slice(2);
const schemaOnly = args.includes('--schema');

console.log('🔄 Syncing production D1 to local database...\n');

/**
 * Find the local SQLite database file
 */
function findLocalDb() {
  const stateDir = path.join(ROOT_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  
  if (!fs.existsSync(stateDir)) {
    return null;
  }
  
  const entries = fs.readdirSync(stateDir);
  const sqliteFiles = entries
    .filter(f => f.endsWith('.sqlite'))
    .map(f => ({
      path: path.join(stateDir, f),
      mtime: fs.statSync(path.join(stateDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);
  
  return sqliteFiles[0]?.path || null;
}

/**
 * Check if sqlite3 CLI is available
 */
function checkSqlite3() {
  try {
    execSync('which sqlite3', { encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize local D1 by running wrangler dev briefly
 */
function initLocalD1() {
  console.log('📦 Initializing local D1 database...');
  
  // Run a simple wrangler d1 command to create local state
  try {
    execSync(
      `cd "${ROOT_DIR}" && npx wrangler d1 execute ${DB_NAME} --local --command "SELECT 1" 2>/dev/null`,
      { encoding: 'utf-8' }
    );
  } catch {
    // Ignore errors, we just want to initialize
  }
}

async function main() {
  // Check prerequisites
  if (!checkSqlite3()) {
    console.error('❌ sqlite3 CLI not found. Install with: brew install sqlite3');
    process.exit(1);
  }
  
  // Step 1: Export production database
  console.log('⬇️  Exporting production database...');
  const exportArgs = schemaOnly ? '--no-data' : '';
  
  try {
    execSync(
      `cd "${ROOT_DIR}" && npx wrangler d1 export ${DB_NAME} --remote ${exportArgs} --output="${BACKUP_FILE}"`,
      { stdio: 'inherit' }
    );
  } catch (err) {
    console.error('❌ Export failed. Make sure you have access to the remote database.');
    process.exit(1);
  }
  
  // Step 2: Find or create local database
  let localDbPath = findLocalDb();
  
  if (!localDbPath) {
    initLocalD1();
    localDbPath = findLocalDb();
  }
  
  if (!localDbPath) {
    console.error('❌ Could not find or create local D1 database.');
    console.error('   Try running: npm run dev (then ctrl+c) to initialize local state.');
    process.exit(1);
  }
  
  console.log(`📂 Local database: ${path.relative(ROOT_DIR, localDbPath)}`);
  
  // Step 3: Clear existing local database
  console.log('🗑️  Clearing local database...');
  
  // Delete the old file and let SQLite create a fresh one
  fs.unlinkSync(localDbPath);
  
  // Step 4: Prepare SQL (wrap with FK disable + transaction)
  console.log('🔧 Preparing SQL for import...');
  
  let sqlContent = fs.readFileSync(BACKUP_FILE, 'utf8');
  
  // Remove any existing PRAGMA or BEGIN/COMMIT statements to avoid conflicts
  sqlContent = sqlContent
    .replace(/PRAGMA\s+foreign_keys\s*=\s*\w+\s*;/gi, '')
    .replace(/BEGIN\s+TRANSACTION\s*;/gi, '')
    .replace(/BEGIN\s*;/gi, '')
    .replace(/COMMIT\s*;/gi, '');
  
  const preparedSql = `
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
${sqlContent}
COMMIT;
PRAGMA foreign_keys=ON;
`.trim();
  
  fs.writeFileSync(TEMP_FILE, preparedSql);
  
  // Get some stats
  const lineCount = preparedSql.split('\n').length;
  const tableMatches = preparedSql.match(/CREATE TABLE/gi) || [];
  const insertMatches = preparedSql.match(/INSERT INTO/gi) || [];
  
  console.log(`   📊 ${tableMatches.length} tables, ${insertMatches.length} INSERT statements, ${lineCount} lines`);
  
  // Step 5: Import using sqlite3 CLI
  console.log('🚀 Importing into local SQLite...');
  
  try {
    execSync(`sqlite3 "${localDbPath}" < "${TEMP_FILE}"`, { 
      cwd: ROOT_DIR,
      stdio: 'inherit'
    });
  } catch (err) {
    console.error('❌ Import failed:', err.message);
    // Keep temp files for debugging
    console.error(`   Debug files preserved: ${BACKUP_FILE}, ${TEMP_FILE}`);
    process.exit(1);
  }
  
  // Cleanup
  fs.unlinkSync(BACKUP_FILE);
  fs.unlinkSync(TEMP_FILE);
  
  console.log('');
  console.log('─'.repeat(50));
  console.log('✨ Sync complete!');
  console.log('');
  console.log('📁 Local database:', path.relative(ROOT_DIR, localDbPath));
  console.log('');
  console.log('To use: wrangler dev (without --remote flag)');
}

main().catch(err => {
  console.error('Fatal error:', err);
  // Cleanup temp files on error
  if (fs.existsSync(BACKUP_FILE)) fs.unlinkSync(BACKUP_FILE);
  if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);
  process.exit(1);
});

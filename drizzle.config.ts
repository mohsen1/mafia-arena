/**
 * Drizzle Kit Configuration for Mafia Arena
 * 
 * Use for future schema migrations:
 * - pnpm drizzle-kit generate  # Generate SQL migrations from schema changes
 * - pnpm drizzle-kit push      # Push schema changes directly (dev only)
 * 
 * Note: For D1 in production, use wrangler d1 migrations create/apply
 */

import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/worker/db/schema.ts',
  out: './drizzle',
});

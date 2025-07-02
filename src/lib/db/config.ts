import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const isVercel = Boolean(process.env.VERCEL);
const isDev = process.env.NODE_ENV === 'development' && !isVercel;

const connectionString =
  process.env.DATABASE_URL ||
  (isDev
    ? 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev'
    : undefined);

if (!connectionString) {
  console.error('[db/config] DATABASE_URL environment variable is not set');
  throw new Error(
    'DATABASE_URL environment variable is not set. Please check your .env.local file and ensure it contains a valid DATABASE_URL.'
  );
}

console.log('[db/config] Initializing database connection');

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });

console.log('[db/config] Database connection initialized');

export type Database = typeof db;

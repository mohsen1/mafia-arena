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
  const errorMessage = [
    'DATABASE_URL environment variable is required',
    '',
    'Please set the DATABASE_URL environment variable.',
    '',
    'For local development:',
    '  1. Create a .env file in the project root',
    '  2. Add: DATABASE_URL=postgresql://user:password@localhost:5432/werewolf_db',
    '',
    'For production/CI:',
    '  Set DATABASE_URL in your environment configuration',
  ].join('\n');

  throw new Error(errorMessage);
}

// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });

export type Database = typeof db;

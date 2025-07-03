import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const isVercel = Boolean(process.env.VERCEL);
const isDev = process.env.NODE_ENV === 'development' && !isVercel;
const isBuildTime =
  process.env.VERCEL_ENV === 'production' || process.env.CI === 'true';

const connectionString =
  process.env.DATABASE_URL ||
  (isDev
    ? 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev'
    : undefined);

// During build time in CI/Vercel, we might not have DATABASE_URL yet
if (!connectionString && !isBuildTime) {
  console.error('[db/config] DATABASE_URL environment variable is not set');
  throw new Error(
    'DATABASE_URL environment variable is not set. Please check your .env.local file and ensure it contains a valid DATABASE_URL.'
  );
}

// Create a lazy-initialized database connection
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Please set it in your environment variables.'
      );
    }
    console.log('[db/config] Initializing database connection');
    const client = postgres(connectionString, { prepare: false });
    _db = drizzle(client, { schema });
    console.log('[db/config] Database connection initialized');
  }
  return _db;
}

// Export a proxy that lazy-initializes the database
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop, receiver) {
    const database = getDb();
    return Reflect.get(database, prop, receiver);
  },
});

export type Database = typeof db;

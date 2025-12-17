import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// Get the D1 database binding from the environment
declare global {
  interface Env {
    DB: any; // D1Database type from @cloudflare/workers-types
  }
}

// Create a lazy-initialized database connection
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb(env?: Env) {
  if (!_db) {
    // In Cloudflare Workers, we get the database from the environment
    const dbBinding = env?.DB || (globalThis as any).DB;

    if (!dbBinding) {
      throw new Error(
        'D1 database binding not found. Make sure DB is properly configured in your Cloudflare Workers environment.'
      );
    }

    console.log('[db/config] Initializing D1 database connection');
    _db = drizzle(dbBinding, { schema });
    console.log('[db/config] D1 database connection initialized');
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

/**
 * Drizzle ORM Database Factory
 * 
 * Creates a type-safe Drizzle instance for D1 database access.
 * Use this instead of raw env.DB queries for type safety.
 */

import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema.js';

/**
 * Create a Drizzle database instance from a D1 binding.
 * 
 * @param d1 - The D1Database binding from Cloudflare Workers env
 * @returns A type-safe Drizzle database instance
 * 
 * @example
 * ```typescript
 * // In a route handler
 * const db = createDb(env.DB);
 * const models = await db.query.models.findMany();
 * ```
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

/**
 * Type for the Drizzle database instance.
 * Use this when you need to pass the db as a parameter.
 * 
 * @example
 * ```typescript
 * async function getModel(db: Database, id: string) {
 *   return db.query.models.findFirst({
 *     where: eq(schema.models.id, id),
 *   });
 * }
 * ```
 */
export type Database = ReturnType<typeof createDb>;

// Re-export schema for convenience
export * from './schema.js';


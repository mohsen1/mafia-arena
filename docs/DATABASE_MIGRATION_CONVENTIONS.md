# Database Migration Conventions

## Overview

This document outlines the conventions for creating and naming database migrations in the Werewolf AI project.

## Migration Naming

### Standard Format

Drizzle Kit generates migrations with the following format:
```
XXXX_[adjective]_[noun].sql
```

Where:
- `XXXX` is a sequential number (0001, 0002, etc.)
- The adjective and noun are randomly generated to avoid conflicts

Example: `0007_purple_elephant.sql`

### Best Practices

1. **Use Generated Names**: Let Drizzle Kit generate the migration filename. This prevents merge conflicts when multiple developers create migrations.

2. **Add Descriptive Comments**: Instead of renaming files, add clear comments at the top of the SQL file:

```sql
-- Add user preferences table and indexes
-- This migration creates a new table for storing user game preferences
-- including theme selection, AI model preferences, and UI settings

CREATE TABLE user_preferences (
  ...
);
```

3. **One Change Per Migration**: Keep migrations focused on a single logical change. This makes rollbacks easier.

## Creating Migrations

### Step 1: Modify Schema

Edit `src/lib/db/schema.ts` to add or modify tables:

```typescript
export const userPreferences = pgTable('user_preferences', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id),
  theme: text('theme').default('classic'),
  // ... more fields
});
```

### Step 2: Generate Migration

Run the generation command:

```bash
pnpm run db:generate
```

This creates a new migration file in the `drizzle/` directory.

### Step 3: Add Comments

Open the generated migration and add descriptive comments:

```sql
-- Migration: Add user preferences
-- Purpose: Store user-specific game preferences
-- Author: [Your Name]
-- Date: 2024-XX-XX

CREATE TABLE IF NOT EXISTS "user_preferences" (
  -- ... generated SQL
);
```

### Step 4: Apply Migration

In development:
```bash
pnpm run db:migrate
```

In production, migrations are automatically applied during deployment.

## Migration History

Track significant migrations in comments:

```sql
-- Related migrations:
-- 0003_add_achievements.sql - Added achievement system
-- 0004_add_game_statistics.sql - Added game stats tracking
-- 0005_add_performance_indexes.sql - Added initial indexes
-- 0006_optimize_indexes.sql - Removed redundant indexes
```

## Rollback Strategy

While Drizzle doesn't support automatic rollbacks, you can:

1. Create a compensating migration that undoes changes
2. Keep manual rollback scripts in `scripts/db/rollbacks/`
3. Test migrations thoroughly in development before deploying

## Common Patterns

### Adding a Column with Default

```sql
-- Add theme column to existing games table
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS theme_override TEXT DEFAULT NULL;
```

### Creating Indexes

```sql
-- Add index for common query pattern
CREATE INDEX IF NOT EXISTS idx_games_owner_updated 
ON games(owner_id, updated_at DESC);
```

### Adding Foreign Keys

```sql
-- Add foreign key constraint
ALTER TABLE user_preferences
ADD CONSTRAINT fk_user_preferences_user
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
```

## Testing Migrations

1. Always test migrations on a fresh database
2. Test both up and down scenarios
3. Verify data integrity after migration
4. Check query performance with new schema

## CI/CD Considerations

- Migrations run automatically in CI via `scripts/ci/ci-build.sh`
- Production migrations happen during Vercel deployment
- Never use `db:push` in production - only `db:migrate` 
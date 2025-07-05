# Database Index Strategy

## Overview

This document explains the database indexing strategy for the Werewolf AI application. Proper indexing is crucial for query performance, but over-indexing can slow down writes and consume unnecessary disk space.

## Index Optimization Principles

### 1. Composite Indexes Cover Single-Column Queries

When you have a composite index like `(owner_id, status)`, it can efficiently serve queries that filter by:
- Both `owner_id` AND `status`
- Just `owner_id` (leftmost prefix)

Therefore, a separate index on just `owner_id` is redundant.

### 2. Common Query Patterns

Based on analysis of our codebase, the most common query patterns are:

**Games Table:**
- List games by owner: `WHERE owner_id = ?`
- List games by owner and status: `WHERE owner_id = ? AND status = ?`
- Recent games: `ORDER BY updated_at DESC`

**Game Participants:**
- Get participants for a game: `WHERE game_id = ?`
- Check if user is in game: `WHERE game_id = ? AND user_id = ?`

**Statistics:**
- User stats: `WHERE user_id = ?`
- Recent games: `ORDER BY created_at DESC`

### 3. Current Index Strategy

After optimization (migration 0006), we maintain these indexes:

**Games:**
- `idx_games_owner_status` - Composite index for owner queries
- `idx_games_status` - For filtering by status across all games
- `idx_games_updated_at` - For sorting by recency

**Game Participants:**
- `idx_game_participants_game_user` - Composite for all participant lookups

**User API Keys:**
- `idx_user_api_keys_user_provider` - Composite for API key lookups
- `idx_user_api_keys_active` - For filtering active keys

**Statistics:**
- Separate indexes on `user_id` and `game_id` (both are queried independently)
- `idx_game_statistics_created_at` - For recent game queries

### 4. Monitoring Index Usage

To verify indexes are being used effectively:

```sql
-- Check index usage statistics (PostgreSQL)
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Analyze query performance
EXPLAIN ANALYZE 
SELECT * FROM games 
WHERE owner_id = 'user-id' 
AND status = 'active';
```

### 5. Future Considerations

- Monitor slow query logs to identify missing indexes
- Consider partial indexes for specific query patterns (e.g., `WHERE status = 'active'`)
- Review indexes quarterly as query patterns evolve
- Use `pg_stat_statements` extension for detailed query analysis

## Migration History

- **0005**: Initial performance indexes (included redundancies)
- **0006**: Optimized indexes by removing redundancies 
# Database Migrations on Vercel

This document explains how database migrations are handled during Vercel deployments for the Werewolf AI project.

## Overview

Database migrations are automatically executed during the Vercel build process when a `DATABASE_URL` environment variable is configured. This ensures that your database schema is always up-to-date with your deployed code.

## How It Works

### Build Process

1. **Environment Detection**: The build script detects it's running on Vercel by checking the `VERCEL` environment variable
2. **Database Check**: If `DATABASE_URL` is set, the build process attempts to connect to the database
3. **Migration Execution**: Runs pending migrations using `drizzle-kit migrate`
4. **Schema Application**: Applies the schema using `drizzle-kit push`
5. **Error Handling**: Continues the build even if migrations report no changes (common scenario)

### Migration Flow

```bash
# During Vercel build (automatically executed)
if [ "$VERCEL" = "1" ] && [ -n "$DATABASE_URL" ]; then
  pnpm run check-db       # Verify connection
  pnpm run db:migrate     # Run migrations
  pnpm run db:push        # Apply schema
fi
```

## Setup Requirements

### 1. Database Configuration

Ensure your database is accessible from Vercel:

- **PostgreSQL**: Most common choice
- **Connection String**: Must include SSL mode for production databases
- **Format**: `postgresql://user:password@host:5432/database?sslmode=require`

### 2. Environment Variables

Set these in your Vercel project settings:

```bash
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

**Important**: Enable the variable for all environments (Production, Preview, Development)

### 3. Database Permissions

Your database user needs these permissions:
- `CREATE TABLE`
- `ALTER TABLE`
- `DROP TABLE` (for rollbacks)
- `CREATE INDEX`
- `DROP INDEX`

## Troubleshooting

### Common Issues

#### 1. "DATABASE_URL is not configured"

**Solution**: Add DATABASE_URL to Vercel environment variables

#### 2. "Failed to connect to the database"

**Possible causes**:
- Incorrect connection string format
- Missing `?sslmode=require` parameter
- Database doesn't allow Vercel IP addresses
- Wrong credentials

**Solutions**:
- Verify connection string format
- Add `?sslmode=require` to the connection string
- Configure database to allow connections from anywhere (0.0.0.0/0) or use Vercel's static IPs
- Double-check username and password

#### 3. "Migration failed"

**This is often normal** if there are no new migrations to apply. The build will continue.

**If it's a real error**:
- Check migration files in `drizzle/` directory
- Ensure migrations are committed to git
- Verify database permissions

#### 4. "Schema push failed"

**This is often normal** if the schema is already up-to-date. The build will continue.

## Manual Migration Execution

If you need to run migrations manually:

```bash
# Using the dedicated Vercel migration script
pnpm run db:migrate:vercel

# Or using drizzle-kit directly
pnpm run db:migrate
pnpm run db:push
```

## Best Practices

### 1. Test Migrations Locally

Before deploying:
```bash
# Test migrations on a local database
pnpm run db:migrate
pnpm run db:push
```

### 2. Preview Deployments

Vercel preview deployments will also run migrations. Consider:
- Using a separate staging database for previews
- Or accepting that previews will modify your production database

### 3. Rollback Strategy

Keep migration rollback scripts:
```bash
# Generate a rollback migration if needed
pnpm run db:generate
```

### 4. Monitor Deployments

Check Vercel deployment logs for migration output:
1. Go to Vercel dashboard
2. Click on the deployment
3. View "Build Logs"
4. Look for migration-related messages

## Migration Safety

The build process is designed to be safe:

1. **Non-blocking**: Migration errors don't fail the build if they're expected (e.g., "no new migrations")
2. **Idempotent**: Running migrations multiple times is safe
3. **Logged**: All operations are logged for debugging

## Advanced Configuration

### Custom Migration Script

For complex scenarios, use the dedicated migration script:

```typescript
// scripts/run-migrations.ts
- Handles connection testing
- Provides detailed logging
- Offers better error messages
- Includes Vercel-specific tips
```

### Environment-Specific Behavior

```bash
# Production
DATABASE_URL=postgresql://prod_user:pass@prod.db:5432/prod_db?sslmode=require

# Preview (optional separate database)
PREVIEW_DATABASE_URL=postgresql://preview_user:pass@preview.db:5432/preview_db?sslmode=require
```

## Security Considerations

1. **Never commit DATABASE_URL** to version control
2. **Use strong passwords** for database users
3. **Limit permissions** to only what's needed
4. **Enable SSL** for all production connections
5. **Rotate credentials** periodically

## Monitoring

After deployment:

1. **Verify migrations ran**: Check Vercel build logs
2. **Test functionality**: Ensure app works with new schema
3. **Monitor errors**: Watch for database-related errors in runtime logs

## Support

If you encounter issues:

1. Check this documentation
2. Review Vercel build logs
3. Run `pnpm run deploy:check` locally
4. Open an issue with deployment logs 
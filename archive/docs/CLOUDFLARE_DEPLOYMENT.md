# Cloudflare Workers Deployment Guide

This guide explains how to deploy the Werewolf AI application to Cloudflare Workers.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install the Cloudflare Workers CLI
   ```bash
   npm install -g wrangler
   ```
3. **Cloudflare API Token**: Generate an API token with Workers permissions
4. **D1 Database**: Create a D1 database for SQLite storage (recommended for Cloudflare Workers)

## Quick Start

### 1. Authenticate with Cloudflare

```bash
wrangler auth login
```

### 2. Create D1 Database

Create a D1 database for your application:

```bash
# Create D1 database
wrangler d1 create werewolf-ai-db

# Copy the database_id from the output and update wrangler.toml
# Replace "your-database-id" in wrangler.toml with the actual database ID
```

### 3. Configure Environment Variables

Set up your environment variables using Wrangler secrets:

```bash
# Required secrets
wrangler secret put NEXTAUTH_SECRET
wrangler secret put NEXTAUTH_URL

# AI Provider keys (at least one required)
wrangler secret put GOOGLE_API_KEY
wrangler secret put GROQ_API_KEY

# Optional
wrangler secret put RESEND_API_KEY
wrangler secret put EMAIL_FROM
```

**Note**: DATABASE_URL is not needed when using D1 - the database is accessed via the D1 binding.

### 3. Deploy

```bash
wrangler deploy
```

## Environment Variables

### Required
- `DATABASE_URL`: PostgreSQL connection string
- `NEXTAUTH_URL`: Your deployment URL (e.g., `https://your-app.workers.dev`)
- `NEXTAUTH_SECRET`: Random secret for NextAuth encryption

### AI Providers (at least one required)
- `GOOGLE_API_KEY`: Google AI API key
- `GROQ_API_KEY`: Groq API key

### Optional
- `RESEND_API_KEY`: Email service API key
- `EMAIL_FROM`: From email address for notifications

## Database Setup

The application is configured to use Cloudflare D1 (SQLite) which is the recommended database solution for Cloudflare Workers. D1 provides:

- **Native Cloudflare Workers compatibility** - No Node.js module issues
- **Global replication** - Fast access from any location
- **SQLite syntax** - Familiar SQL queries
- **Automatic scaling** - No connection limits

### Database Migration

After creating your D1 database, run migrations:

```bash
# Push schema to D1
wrangler d1 execute werewolf-ai-db --file=drizzle/0000_superb_wither.sql
wrangler d1 execute werewolf-ai-db --file=drizzle/0001_magical_ted_forrester.sql
# ... continue for all migration files
```

## Custom Domain (Optional)

To use a custom domain:

1. Add your domain to Cloudflare
2. Update `wrangler.toml`:
   ```toml
   [build]
   command = "npm run build"

   [[build.upload.rules]]
   type = "ESModule"
   globs = ["**/*.js"]

   [vars]
   NODE_ENV = "production"
   ```

3. Deploy and configure routing

## Troubleshooting

### Build Issues
- The build currently fails due to PostgreSQL dependencies not being compatible with Cloudflare Workers
- **Solution**: Use Cloudflare D1 (SQLite) instead of PostgreSQL as configured in this guide

### Runtime Issues
- Verify environment variables are set correctly using `wrangler secret list`
- Check D1 database connectivity with `wrangler d1 execute werewolf-ai-db --command="SELECT 1"`
- Review Cloudflare Workers logs with `wrangler tail`

### Database Issues
- D1 uses SQLite syntax, ensure your queries are compatible
- Use `wrangler d1 execute` to run database commands
- Check migration files are properly applied to D1

## Performance Considerations

- Cloudflare Workers have CPU and memory limits
- Consider using Cloudflare D1 for SQLite database
- Use Cloudflare KV for caching if needed

## Monitoring

Monitor your deployment through:
- Cloudflare Dashboard
- `wrangler tail` for real-time logs
- Cloudflare Analytics

## Need Help?

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
- [Next.js on Cloudflare Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
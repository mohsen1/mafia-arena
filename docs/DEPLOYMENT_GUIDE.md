# Cloudflare Pages Deployment Guide

## Overview

The primary issue preventing deployment has been **FIXED**: The database schema has been successfully converted from PostgreSQL to SQLite/D1 for Cloudflare compatibility.

✅ **Build Status**: `pnpm build` now passes successfully
✅ **Type Check**: `pnpm tsc --noEmit` passes
✅ **Linting**: `pnpm check:lint` passes

## Deployment Options

### Option 1: Cloudflare Pages (Recommended - Easiest)

Cloudflare Pages has built-in Next.js support and is the simplest way to deploy.

#### Steps:

1. **Push your code to GitHub** (if not already done):
   ```bash
   git push origin main
   ```

2. **Go to Cloudflare Dashboard**:
   - Visit https://dash.cloudflare.com/
   - Navigate to **Workers & Pages** > **Create application** > **Pages**
   - Connect to your GitHub repository

3. **Configure Build Settings**:
   - **Framework preset**: Next.js
   - **Build command**: `pnpm build` or `npm run build`
   - **Build output directory**: `.next`
   - **Root directory**: (leave empty)
   - **Node version**: 18 or higher

4. **Set Environment Variables**:
   Add these in the Cloudflare Pages settings:
   ```
   NEXTAUTH_SECRET=<your-secret>
   NEXTAUTH_URL=<your-pages-url>
   GOOGLE_API_KEY=<your-key>
   GROQ_API_KEY=<your-key>
   ```

5. **Set up D1 Database Binding**:
   - In your Pages project settings, go to **Settings** > **Functions** > **D1 database bindings**
   - Bind your D1 database with the name `DB`
   - This connects to the database ID in your wrangler.toml: `9bb1334e-c75f-49b2-9e8c-a79771de46d4`

6. **Deploy**: Click **Save and Deploy**

### Option 2: Wrangler CLI with OpenNext (Advanced)

This approach requires additional setup and is currently in progress.

**Status**: The OpenNext configuration has been partially set up but needs resolution of bundling issues with Node.js dependencies like `supports-color`.

If you want to pursue this route, you'll need to:
1. Resolve external dependencies in `open-next.config.ts`
2. Complete the `pnpm run build:worker` successfully
3. Deploy with `wrangler deploy`

### Option 3: Vercel (Alternative)

Since this is a Next.js app, Vercel provides native support and might be easier if Cloudflare proves challenging:

1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Follow prompts to deploy

**Note**: You'll need to use a PostgreSQL database for Vercel (not D1/SQLite). The schema can be converted back if needed.

## Database Migration

After deploying, you need to run migrations on your D1 database:

```bash
# Execute the migration SQL
wrangler d1 execute werewolf-ai-db --file=drizzle/0000_safe_ultragirl.sql
```

## Verification

After deployment, test:
1. Homepage loads
2. Authentication works
3. Database connections work
4. AI API calls function properly

## Troubleshooting

### Build Fails
- Check environment variables are set correctly
- Ensure Node.js version is 18+
- Verify all dependencies are installed

### Database Connection Issues
- Confirm D1 database binding name is `DB`
- Verify database ID matches wrangler.toml
- Check migrations have been run

### Runtime Errors
- Check Cloudflare Pages Functions logs
- Verify all secrets/environment variables are set
- Test API routes individually

## Summary

**The core TypeScript/schema issue is RESOLVED**. You now have two simple paths forward:

1. **Cloudflare Pages** (recommended): Push to GitHub → Connect in Cloudflare Dashboard → Deploy
2. **Vercel**: Run `vercel` command for instant deployment

Both are much simpler than the Workers + OpenNext approach and will get your app deployed quickly.

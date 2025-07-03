# Vercel Deployment Guide

## Prerequisites

Before deploying to Vercel, ensure you have:

1. A PostgreSQL database accessible from the internet
2. All required environment variables
3. A Vercel account

## Required Environment Variables

Set these in your Vercel project settings under "Environment Variables":

### Database
- `DATABASE_URL` - PostgreSQL connection string
  - Format: `postgresql://user:password@host:5432/database?sslmode=require`
  - **Important**: Include `?sslmode=require` for most cloud databases

### Authentication
- `NEXTAUTH_URL` - Your deployment URL (e.g., `https://your-app.vercel.app`)
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`

### OAuth Providers (Optional)
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

### AI Providers (At least one required)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `GROQ_API_KEY`

## Deployment Steps

1. **Fork/Clone the Repository**
   ```bash
   git clone https://github.com/your-username/werewolf-ai.git
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your repository
   - Select the framework preset: Next.js

3. **Configure Environment Variables**
   - Add all required environment variables
   - Ensure they're available for all environments (Production, Preview, Development)

4. **Database Setup**
   - Ensure your database allows connections from Vercel's IP addresses
   - For Supabase/Neon/etc., this is usually automatic
   - For self-hosted, you may need to whitelist Vercel IPs

5. **Deploy**
   - Click "Deploy"
   - The build process will:
     - Check database connection
     - Run migrations
     - Build the Next.js app

## Troubleshooting

### Database Connection Errors

1. **"DATABASE_URL environment variable is missing"**
   - Ensure DATABASE_URL is set in Vercel environment variables
   - Check it's available for the deployment environment

2. **"Failed to connect to the database"**
   - Verify the connection string format
   - Ensure `?sslmode=require` is included
   - Check database allows external connections
   - Verify credentials are correct

3. **Migration Errors**
   - These are often non-fatal if the schema is already up to date
   - Check the build logs for details
   - Migrations run automatically during build when DATABASE_URL is set
   - The build continues even if migrations report no changes

### Build Errors

1. **"Module not found"**
   - Ensure all dependencies are in `package.json`
   - Try clearing Vercel's build cache

2. **Memory Issues**
   - The build process might need more memory
   - Contact Vercel support for limit increases

### Post-Deployment

1. **Test OAuth Login**
   - Update OAuth redirect URLs to include your Vercel domain
   - Format: `https://your-app.vercel.app/api/auth/callback/google`

2. **Monitor Logs**
   - Use Vercel's Functions logs to debug runtime issues
   - Check for database connection issues in production

## CI/CD Integration

The repository includes GitHub Actions for monitoring deployment health:
- Checks deployment status
- Creates issues for failures
- Runs daily health checks

Ensure these secrets are set in your GitHub repository:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID` 
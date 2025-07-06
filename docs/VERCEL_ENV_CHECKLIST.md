# Vercel Environment Variables Checklist

## Critical Environment Variables for Vercel Deployment

This checklist ensures all required environment variables are properly configured in Vercel for all deployment environments (Production, Preview, Development).

## Important: Build-time vs Runtime Variables

In Vercel, environment variables marked as "Secret" are only available at runtime, not during the build process. This is a security feature to prevent secrets from being exposed in build logs or cached build artifacts.

### Build-time Validation
- During build, we check that you've configured the variables (warnings only)
- The build won't fail if secrets are missing (they're not accessible during build)

### Runtime Validation  
- When your app starts, it validates all required variables are present
- If critical variables are missing, the app will fail to start
- This ensures your deployment won't serve requests without proper configuration

### 🔴 Required Variables (Application won't work without these)

#### Database
- [ ] `DATABASE_URL`
  - Format: `postgresql://user:password@host:5432/database?sslmode=require`
  - ⚠️ Must include `?sslmode=require` for cloud databases
  - ✅ Should be set for: Production, Preview, Development

#### Authentication
- [ ] `NEXTAUTH_URL`
  - Production: `https://your-app.vercel.app`
  - Preview: Use Vercel's automatic preview URLs
  - ✅ Should be set for: Production, Preview
  
- [ ] `NEXTAUTH_SECRET`
  - Generate with: `openssl rand -base64 32`
  - ⚠️ Must be different for each environment
  - ✅ Should be set for: Production, Preview, Development

### 🔴 Required AI Provider Keys (At least ONE is MANDATORY)

**⚠️ IMPORTANT: The build will fail if none of these are set!**

You must provide at least one of the following API keys:

- [ ] `GOOGLE_API_KEY` or `GEMINI_API_KEY`
  - Required if using Google's Gemini models
  - Format: Should match `/^[a-zA-Z0-9_-]+$/`
  - ✅ Should be set for: Production, Preview

- [ ] `GROQ_API_KEY`
  - Required if using Groq's fast inference
  - Format: Must start with `gsk_`
  - ✅ Should be set for: Production, Preview

**Note:** While other AI providers (OpenAI, Anthropic) are supported, at least one of Google/Gemini/Groq is required for the application to build and deploy successfully.

### 🟡 Additional AI Provider Keys (Optional)

- [ ] `OPENAI_API_KEY`
  - Required if using OpenAI models
  - ✅ Should be set for: Production, Preview

- [ ] `ANTHROPIC_API_KEY`
  - Required if using Claude models
  - ✅ Should be set for: Production, Preview

### 🟢 Optional but Recommended

#### OAuth Providers
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
  - Required for Google OAuth login
  - Remember to update redirect URLs in Google Console

- [ ] `GITHUB_CLIENT_ID`
- [ ] `GITHUB_CLIENT_SECRET`
  - Required for GitHub OAuth login
  - Remember to update redirect URLs in GitHub settings

#### Text-to-Speech
- [ ] `ELEVENLABS_API_KEY`
  - Required for ElevenLabs TTS functionality
  - ✅ Should be set for: Production, Preview

#### Email Service
- [ ] `RESEND_API_KEY`
  - Required for password reset emails
  - ✅ Should be set for: Production

- [ ] `EMAIL_FROM`
  - Default: `Werewolf AI <noreply@werewolf-ai.com>`
  - ✅ Should be set for: Production

#### Rate Limiting (Optional)
- [ ] `KV_REST_API_URL`
- [ ] `KV_REST_API_TOKEN`
  - Required for Upstash rate limiting
  - ✅ Should be set for: Production

#### Error Tracking (Optional)
- [ ] `SENTRY_DSN`
  - Required for server-side error tracking with Sentry
  - ✅ Should be set for: Production, Preview

- [ ] `SENTRY_TOKEN`
  - Required for Sentry releases and sourcemaps
  - ✅ Should be set for: Production, Preview

- [ ] `NEXT_PUBLIC_SENTRY_DSN`
  - Required for client-side error tracking with Sentry
  - ✅ Should be set for: Production, Preview

## How to Set Environment Variables in Vercel

1. Go to your project in Vercel Dashboard
2. Navigate to Settings → Environment Variables
3. For each variable:
   - Enter the key name (e.g., `DATABASE_URL`)
   - Enter the value
   - Select which environments it applies to:
     - ✅ Production
     - ✅ Preview
     - ✅ Development (if needed)
   - Click "Save"

## Verification Steps

1. **Check Build Logs**
   - Look for "Environment variables loaded" messages
   - Check for any missing variable warnings

2. **Test Each Environment**
   - Production: Visit your main URL
   - Preview: Create a PR and check the preview deployment
   - Development: Use Vercel CLI locally

3. **Test Features**
   - [ ] Database connection works
   - [ ] OAuth login works (if configured)
   - [ ] AI chat functionality works
   - [ ] TTS works (if ElevenLabs configured)
   - [ ] Password reset emails work (if Resend configured)

## Common Issues

1. **Variable Not Available**
   - Ensure it's enabled for the correct environment
   - Redeploy after adding variables

2. **OAuth Redirect Errors**
   - Update redirect URLs in provider settings
   - Include both production and preview URLs

3. **Database Connection Fails**
   - Check `?sslmode=require` is included
   - Verify database allows Vercel IPs

## Security Notes

- Never commit real API keys to the repository
- Use different values for different environments
- Rotate keys regularly
- Use Vercel's secret management features 
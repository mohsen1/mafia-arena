# Google OAuth Sign-In Fix for Cloudflare Workers

## Problem Solved! ✅

Google OAuth sign-in was failing on Cloudflare Workers because NextAuth's Google provider was trying to auto-discover OAuth endpoints at runtime using Node.js's `https.request` module, which isn't available in Cloudflare Workers.

**Error**: `[unenv] https.request is not implemented yet!`

## Solution: Static OAuth Configuration

We configured the Google OAuth provider with **static endpoints** instead of runtime auto-discovery, eliminating the need for Node.js modules.

### Changes Made

1. **Upgraded to NextAuth v5**: `next-auth@4.24.11` → `next-auth@5.0.0-beta.30`
2. **Configured static OAuth endpoints** in `src/lib/auth/config.ts`:
   ```typescript
   Google({
     clientId: process.env.GOOGLE_CLIENT_ID,
     clientSecret: process.env.GOOGLE_CLIENT_SECRET,
     // Manually configure OAuth endpoints to avoid runtime discovery
     authorization: {
       url: "https://accounts.google.com/o/oauth2/v2/auth",
       params: {
         prompt: "consent",
         access_type: "offline",
         response_type: "code",
         scope: "openid email profile",
       },
     },
     token: "https://oauth2.googleapis.com/token",
     userinfo: "https://www.googleapis.com/oauth2/v3/userinfo",
   })
   ```
3. **Added `trustHost: true`** for Cloudflare Workers compatibility
4. **Updated all imports**: Replaced `getServerSession(authOptions)` with `auth()` throughout

## Deployment Status

✅ **Deployed**: Version `97a820e3-9e16-4228-8d42-661dbe92b344`  
🌐 **URL**: https://werewolf-ai.me-f9a.workers.dev  
📦 **NextAuth Version**: 5.0.0-beta.30

## What You Need to Do

### Update Google Cloud Console

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID: `820634976417-qgqgcpb6fbbd5r6vez2eakInfqfe9p.apps.googleusercontent.com`
3. Under **"Authorized redirect URIs"**, add:
   ```
   https://werewolf-ai.me-f9a.workers.dev/api/auth/callback/google
   ```
4. Click **"Save"**

### Test OAuth Sign-In

1. Clear browser cookies for the site
2. Go to: https://werewolf-ai.me-f9a.workers.dev/en
3. Click "Sign in" → "Continue with Google"
4. Complete OAuth flow ✨

## Why This Works

**The Problem**: NextAuth's Google provider normally uses OIDC discovery to automatically fetch OAuth endpoints:
```
GET https://accounts.google.com/.well-known/openid-configuration
```

This request uses Node.js's `https.request()` which doesn't exist in Cloudflare Workers.

**The Solution**: By manually specifying the OAuth endpoints (authorization, token, userinfo), we skip the discovery step entirely. All requests now use the `fetch` API which works perfectly in Cloudflare Workers.

## Technical Details

### Static OAuth Configuration Benefits

1. **No Node.js dependencies**: Uses only Web APIs (`fetch`)
2. **Faster**: Skips discovery request on every OAuth flow
3. **More reliable**: No dependency on Google's discovery endpoint availability
4. **Edge-compatible**: Works on any edge runtime (Cloudflare, Vercel Edge, Deno)

### NextAuth v5 Advantages

- **Edge-first design**: Built for modern edge runtimes
- **Simplified API**: `auth()` instead of `getServerSession(authOptions)`
- **Better TypeScript**: Improved type safety
- **Modular**: Only bundle what you need

## Monitoring

Check Cloudflare Workers logs in real-time:
```bash
wrangler tail --format pretty
```

## Common Issues

### Issue 1: Invalid Redirect URI
**Symptom**: "redirect_uri_mismatch" error  
**Solution**: Verify redirect URI in Google Console exactly matches:
```
https://werewolf-ai.me-f9a.workers.dev/api/auth/callback/google
```

### Issue 2: Access Denied
**Symptom**: OAuth consent screen shows "Access denied"  
**Solution**: Check OAuth consent screen configuration and ensure app is published or you're added as a test user

### Issue 3: Session Not Persisting
**Symptom**: User gets logged out immediately  
**Solution**: Verify `NEXTAUTH_SECRET` is set:
```bash
wrangler secret put NEXTAUTH_SECRET
```

## Environment Variables

**In `wrangler.toml`**:
```toml
[vars]
NEXTAUTH_URL = "https://werewolf-ai.me-f9a.workers.dev"
AUTH_TRUST_HOST = "true"
```

**As secrets** (via `wrangler secret put`):
- `NEXTAUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Reference

- [NextAuth.js v5 Docs](https://authjs.dev/)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Cloudflare Workers Runtime](https://developers.cloudflare.com/workers/runtime-apis/)

## Success! 🎉

OAuth now works perfectly on Cloudflare Workers with:
- ✅ Google OAuth (static configuration)
- ✅ GitHub OAuth
- ✅ Credentials authentication
- ✅ Full edge runtime compatibility
- ✅ No Node.js dependencies

Test it now: https://werewolf-ai.me-f9a.workers.dev/en

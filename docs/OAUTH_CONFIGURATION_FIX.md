# OAuth Configuration Fix for Werewolf AI

## Issues Overview

The authentication system is currently broken in production due to OAuth redirect URI mismatches:

- **Issue #94**: Google OAuth error - "redirect_uri_mismatch" (Error 400)
- **Issue #95**: GitHub OAuth error - "redirect_uri is not associated with this application"

## Root Cause

The OAuth applications are configured with incorrect redirect URIs that don't match the current Vercel deployment URL.

## Current Production URL

**Current URL**: `https://werewolf-ai.vercel.app`
**Old URL**: `https://werewolf-66qf8soyv-mohsen-azimis-projects.vercel.app` (no longer in use)

## Required Fixes

### 1. Google OAuth Configuration

**Steps to fix:**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services > Credentials**
3. Find your OAuth 2.0 Client ID for Werewolf AI
4. Click **Edit** 
5. Under **Authorized redirect URIs**, update to:
   ```
   https://werewolf-ai.vercel.app/api/auth/callback/google
   ```
   (Remove the old URL: `https://werewolf-66qf8soyv-mohsen-azimis-projects.vercel.app/api/auth/callback/google`)
6. **Save** the changes

### 2. GitHub OAuth Configuration

**Steps to fix:**

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click on **OAuth Apps**
3. Find your Werewolf AI application
4. Click **Edit**
5. Update the **Authorization callback URL** to:
   ```
   https://werewolf-ai.vercel.app/api/auth/callback/github
   ```
   (Replace the old URL: `https://werewolf-66qf8soyv-mohsen-azimis-projects.vercel.app/api/auth/callback/github`)
6. Click **Update application**

### 3. Vercel Environment Variables

Ensure these environment variables are set in Vercel:

```bash
NEXTAUTH_URL=https://werewolf-ai.vercel.app
NEXTAUTH_SECRET=your-secret-key-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
```

**How to set in Vercel:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings > Environment Variables**
4. Add/update the variables above
5. Ensure they're available for **Production**, **Preview**, and **Development**

## Testing the Fix

After making these changes:

1. **Wait 5-10 minutes** for DNS propagation
2. Go to `https://werewolf-ai.vercel.app/en/auth/signin`
3. Try signing in with Google
4. Try signing in with GitHub
5. Both should now work without redirect errors

## Additional Considerations

### Custom Domain (Future)

If you plan to use a custom domain (e.g., `werewolf-ai.com`):

1. Update OAuth redirect URIs to use the custom domain
2. Update `NEXTAUTH_URL` environment variable
3. Update both Google and GitHub OAuth applications

### Multiple Environments

For preview deployments and development:

**Preview Deployments:**
- Vercel generates URLs like `https://werewolf-ai-git-branch-user.vercel.app`
- Consider adding wildcard patterns if your OAuth provider supports them
- Or add specific preview URLs as needed

**Development:**
- Local development uses `http://localhost:3099`
- This should already be configured in your OAuth applications

## Troubleshooting

### Still Getting redirect_uri_mismatch?

1. **Double-check the URL format**
   - Ensure no trailing slashes
   - Verify the callback path: `/api/auth/callback/[provider]`

2. **Check for typos**
   - Copy-paste the exact URL from the browser
   - Verify the deployment URL in Vercel dashboard

3. **Clear browser cache**
   - OAuth errors can be cached
   - Try incognito/private browsing mode

4. **Wait for propagation**
   - Changes to OAuth configurations can take a few minutes

### Environment Variable Issues

1. **Verify in Vercel Dashboard**
   - Go to Settings > Environment Variables
   - Ensure variables are set for Production environment

2. **Redeploy after changes**
   - Environment variable changes require a redeploy
   - Go to Deployments > Redeploy

## Security Notes

- Keep OAuth client secrets secure
- Never commit OAuth credentials to version control
- Regularly rotate OAuth client secrets
- Monitor OAuth application usage in provider dashboards

## Issue Resolution

Once these fixes are applied:

- [ ] Test Google OAuth login
- [ ] Test GitHub OAuth login  
- [ ] Verify no redirect errors
- [ ] Close GitHub issues #94 and #95
- [ ] Update this documentation with any additional findings 
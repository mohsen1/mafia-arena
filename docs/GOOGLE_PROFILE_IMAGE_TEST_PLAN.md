# Google Profile Image Test Plan

## Overview
This document outlines the test plan for verifying that Google OAuth profile images are displayed correctly in the werewolf-ai application.

## Fix Summary
The issue "User profile image not showing when logged in via Google" has been fixed with the following changes:

1. **Enhanced JWT Callback**: Now fetches user data from database for OAuth providers to ensure correct ID and profile data
2. **Updated SignIn Callback**: Properly stores OAuth user data including profile images in the database
3. **Session Callback**: Correctly passes all user data including profile images to the session

## Test Steps

### Prerequisites
1. Ensure you have Google OAuth credentials configured in `.env.local`:
   ```
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   NEXTAUTH_URL=http://localhost:3099
   NEXTAUTH_SECRET=your-nextauth-secret
   ```

2. Development server is running on port 3099

### Test Procedure

#### 1. Test New User Sign-In with Google
1. Sign out if currently logged in
2. Click "Sign In" in the navigation bar
3. Click "Continue with Google"
4. Complete Google authentication
5. **Expected Result**: 
   - User is redirected to home page
   - Google profile image appears in the navigation bar
   - User name from Google account is displayed

#### 2. Test Profile Page Display
1. While logged in with Google, click on your profile in the navigation bar
2. Select "Profile" from the dropdown
3. **Expected Result**:
   - Profile page shows your Google profile image
   - Account information section displays your name and email
   - Security section shows "Google Account" badge

#### 3. Test Existing User Sign-In
1. Sign out
2. Sign in again with the same Google account
3. **Expected Result**:
   - Profile image still appears correctly
   - User data is consistent with previous session

#### 4. Test Session Persistence
1. Refresh the page while logged in
2. Navigate to different pages
3. **Expected Result**:
   - Profile image remains visible in navigation bar
   - Session data persists correctly

### Verification Points

1. **Database Check**:
   - User record in database should have `image` field populated with Google profile URL
   - Image URL should start with `https://lh3.googleusercontent.com/`

2. **Network Check**:
   - Browser developer tools should show successful image loads
   - No 404 errors for profile images

3. **Console Check**:
   - No authentication errors in browser console
   - No errors in server logs related to OAuth

## Troubleshooting

If profile images are not showing:

1. **Check Environment Variables**: Ensure all OAuth credentials are correctly set
2. **Check Database**: Verify user record has image URL stored
3. **Check Network**: Ensure Next.js image domains are configured for Google
4. **Check Logs**: Look for "Error saving OAuth user" messages in server logs

## Implementation Details

The fix is implemented in `src/lib/auth/config.ts`:
- JWT callback fetches user from database for OAuth providers
- SignIn callback stores/updates user profile data including images
- Session callback ensures all user data is available in the session

## Status
✅ **FIXED** - The issue has been resolved in commits:
- `fce6e02`: Fix Google OAuth profile image not showing
- `ef53640`: Fix #72: Fix google auth'd avatar url 
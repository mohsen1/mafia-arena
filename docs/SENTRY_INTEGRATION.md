# Sentry Integration

This document explains how to configure and use Sentry error tracking in Werewolf AI.

## Overview

Sentry is integrated to provide error tracking and monitoring for both client-side and server-side errors in production environments. The integration is designed to be:

- **Non-intrusive**: Only active in production environments
- **Lightweight**: Minimal performance impact with 10% sampling rates
- **Filtered**: Common browser warnings and non-actionable errors are excluded
- **Secure**: Only sends error data, not sensitive user information

## Environment Variables

To enable Sentry integration, configure the following environment variables:

### Required for Server-Side Tracking
- `SENTRY_DSN`: The Data Source Name for your Sentry project
  - Format: `https://[key]@[organization].ingest.sentry.io/[project-id]`
  - Available at: Project Settings → Client Keys (DSN)

### Required for Client-Side Tracking
- `NEXT_PUBLIC_SENTRY_DSN`: The public DSN for client-side error tracking
  - Usually the same as `SENTRY_DSN`
  - Must be prefixed with `NEXT_PUBLIC_` to be available in the browser

### Optional for CI/CD
- `SENTRY_TOKEN`: Auth token for uploading source maps and creating releases
  - Required for better error debugging with source maps
  - Available at: User Settings → Auth Tokens

## Configuration

### Production Setup

1. **Create a Sentry Project**
   - Go to [Sentry.io](https://sentry.io)
   - Create a new project (select "Next.js")
   - Copy the DSN from Project Settings

2. **Configure Environment Variables**
   - In Vercel: Project Settings → Environment Variables
   - Add the variables for Production and Preview environments
   - Example:
     ```
     SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id
     NEXT_PUBLIC_SENTRY_DSN=https://your-key@your-org.ingest.sentry.io/your-project-id
     SENTRY_TOKEN=your-auth-token
     ```

3. **Deploy**
   - Redeploy your application
   - Errors will now be tracked in Sentry

### Development Setup

By default, Sentry is disabled in development mode to avoid noise. To enable it for testing:

```bash
# Enable client-side Sentry in development
export NEXT_PUBLIC_SENTRY_DEBUG=true

# Enable server-side Sentry in development
export SENTRY_DEBUG=true
```

## Features

### Error Tracking
- **Automatic**: All uncaught errors are automatically sent to Sentry
- **Manual**: Use `logError()` function for custom error reporting
- **Filtered**: Common browser warnings are automatically filtered out

### Performance Monitoring
- **Sampling**: 10% of transactions are sampled for performance monitoring
- **Profiling**: Performance profiles are captured for optimization insights

### Session Replay
- **Client-side**: 10% of sessions are recorded for debugging
- **Error Sessions**: 100% of sessions with errors are recorded

## Usage

### Automatic Error Reporting

All errors are automatically captured through the existing error handling system:

```typescript
import { logError } from '@/lib/errors/errorUtils';

try {
  // Your code here
} catch (error) {
  // This will automatically send to Sentry in production
  await logError('operation-context', error, { additionalData: 'value' });
}
```

### Manual Error Reporting

For custom error reporting:

```typescript
import * as Sentry from '@sentry/nextjs';

// Server-side
Sentry.captureException(new Error('Custom error'), {
  tags: { feature: 'game-engine' },
  extra: { gameId: 'abc123' }
});

// Client-side
if (typeof window !== 'undefined') {
  Sentry.captureException(new Error('Client error'), {
    tags: { component: 'GameBoard' }
  });
}
```

### Adding Context

Add user context and custom tags:

```typescript
import * as Sentry from '@sentry/nextjs';

// Set user context
Sentry.setUser({
  id: user.id,
  username: user.name,
  email: user.email
});

// Add custom tags
Sentry.setTag('game.phase', 'day');
Sentry.setTag('game.theme', 'classic');

// Add extra context
Sentry.setExtra('gameState', gameState);
```

## Filtering

The following errors are automatically filtered out:
- ResizeObserver loop limit exceeded (common browser warning)
- Network connection errors (ECONNRESET, ENOTFOUND, etc.)
- Socket hang up errors
- Non-Error exceptions captured

## Security

- **No sensitive data**: Only error messages and stack traces are sent
- **Filtered personal info**: User data is not included in error reports
- **Environment separation**: Different projects for different environments
- **Source maps**: Uploaded separately and not exposed publicly

## Troubleshooting

### Errors Not Appearing in Sentry

1. **Check DSN Configuration**
   - Verify `SENTRY_DSN` is set correctly
   - Ensure it's available in the correct environment

2. **Check Environment**
   - Sentry is disabled in development by default
   - Enable debug mode to test: `SENTRY_DEBUG=true`

3. **Check Filtering**
   - Some errors may be filtered out
   - Check the `beforeSend` configuration in `sentry.*.config.ts`

### Performance Issues

1. **Adjust Sampling Rates**
   - Reduce `tracesSampleRate` in production
   - Currently set to 10% (0.1)

2. **Review Integrations**
   - Disable unnecessary integrations
   - Adjust replay sampling rates

### Source Maps Not Working

1. **Check Auth Token**
   - Verify `SENTRY_TOKEN` is set
   - Ensure token has correct permissions

2. **Check Build Process**
   - Source maps are uploaded during build
   - Check build logs for upload errors

## Best Practices

1. **Use Meaningful Context**
   - Always provide context when logging errors
   - Use consistent tag naming conventions

2. **Don't Log Sensitive Data**
   - Avoid logging user passwords, tokens, or personal information
   - Use Sentry's data scrubbing features

3. **Monitor Performance Impact**
   - Keep sampling rates reasonable
   - Monitor your Sentry quota usage

4. **Set Up Alerts**
   - Configure Sentry alerts for critical errors
   - Set up Slack/email notifications for important issues

## Resources

- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Sentry Error Monitoring](https://docs.sentry.io/product/issues/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
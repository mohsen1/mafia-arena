/**
 * Sentry Client Configuration
 * This file is used to configure Sentry SDK for client-side error tracking
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.0,
  
  // Capture interactions and pageloads
  integrations: [
    Sentry.replayIntegration({
      // Capture 10% of all sessions, 100% of sessions with an error
      sessionSampleRate: 0.1,
      errorSampleRate: 1.0,
    }),
  ],
  
  // Set profilesSampleRate to 1.0 to profile every transaction.
  // Since profilesSampleRate is relative to tracesSampleRate,
  // the final profiling rate can be computed as tracesSampleRate * profilesSampleRate
  profilesSampleRate: 1.0,
  
  beforeSend(event) {
    // Filter out development/test related errors
    if (event.exception) {
      const error = event.exception.values?.[0]?.value || '';
      // Filter out common browser warnings that aren't actionable
      if (error.includes('ResizeObserver loop limit exceeded') ||
          error.includes('Non-Error exception captured') ||
          error.includes('Network request failed')) {
        return null;
      }
    }
    
    // Only send in production unless specifically enabled
    if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_SENTRY_DEBUG) {
      return null;
    }
    
    return event;
  },
});
/**
 * Sentry Server Configuration
 * This file is used to configure Sentry SDK for server-side error tracking
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.0,
  
  // Set profilesSampleRate to 1.0 to profile every transaction.
  // Since profilesSampleRate is relative to tracesSampleRate,
  // the final profiling rate can be computed as tracesSampleRate * profilesSampleRate
  profilesSampleRate: 1.0,
  
  beforeSend(event) {
    // Filter out development/test related errors and non-actionable warnings
    if (event.exception) {
      const error = event.exception.values?.[0]?.value || '';
      if (error.includes('ResizeObserver loop limit exceeded') ||
          error.includes('ECONNRESET') ||
          error.includes('ENOTFOUND') ||
          error.includes('socket hang up')) {
        return null;
      }
    }
    
    // Only send in production unless specifically enabled
    if (process.env.NODE_ENV !== 'production' && !process.env.SENTRY_DEBUG) {
      return null;
    }
    
    return event;
  },
});
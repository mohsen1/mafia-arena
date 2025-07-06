/**
 * Next.js Instrumentation
 * This file runs when the Next.js server starts
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Initialize Sentry for server-side error tracking
    if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
      const { init } = await import('@sentry/nextjs');

      init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        // Capture 10% of transactions for performance monitoring
        profilesSampleRate: 0.1,
        // Additional options
        beforeSend(event) {
          // Filter out development/test related errors
          if (event.exception) {
            const error = event.exception.values?.[0]?.value || '';
            if (error.includes('ResizeObserver loop limit exceeded')) {
              return null; // Common browser warning, not actionable
            }
          }
          return event;
        },
      });
    }

    // Only run validation on server startup, not during build
    if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) {
      const { ensureRuntimeEnvironment } = await import(
        './lib/validateRuntimeEnv'
      );

      try {
        ensureRuntimeEnvironment();
        console.log('✅ Runtime environment validation passed');
      } catch (error) {
        console.error('❌ Runtime environment validation failed:', error);
        // In production, we want to fail fast
        if (process.env.NODE_ENV === 'production') {
          process.exit(1);
        }
      }
    }
  }
}

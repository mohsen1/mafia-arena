/**
 * Next.js Instrumentation
 * This file runs when the Next.js server starts
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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

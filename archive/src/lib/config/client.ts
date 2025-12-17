/**
 * Centralized client-side configuration module
 * This module exports only client-safe environment variables
 * Never expose sensitive API keys or secrets here
 */

// Client-safe configuration values
export const clientConfig = {
  // Public URLs
  NEXTAUTH_URL: process.env.NEXT_PUBLIC_NEXTAUTH_URL || '',

  // Feature flags
  ENABLE_TTS: process.env.NEXT_PUBLIC_ENABLE_TTS === 'true',

  // Public API endpoints (if any)
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || '',

  // App metadata
  APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'Werewolf AI',
  APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',

  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',

  // Public feature toggles
  ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
  ENABLE_DEBUG: process.env.NEXT_PUBLIC_ENABLE_DEBUG === 'true',
} as const;

// Type for the client configuration
export type ClientConfig = typeof clientConfig;

// Helper functions for client-side checks
export const isDevelopment = clientConfig.IS_DEVELOPMENT;
export const isProduction = clientConfig.IS_PRODUCTION;

// Export individual values for convenience
export const {
  NEXTAUTH_URL,
  ENABLE_TTS,
  API_BASE_URL,
  APP_NAME,
  APP_VERSION,
  NODE_ENV,
  ENABLE_ANALYTICS,
  ENABLE_DEBUG,
} = clientConfig;

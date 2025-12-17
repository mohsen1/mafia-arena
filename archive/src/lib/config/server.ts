/**
 * Centralized server-side configuration module
 * This module validates and exports all environment variables
 * Import from this module instead of using process.env directly
 */

import { z } from 'zod';

// Define the schema for environment variables
const serverEnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // NextAuth
  NEXTAUTH_URL: z.string().url().optional(),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET is required'),

  // OAuth Providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // AI Providers (at least one required in production)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),


  // Rate Limiting (optional)
  KV_REST_API_URL: z.string().optional(),
  KV_REST_API_TOKEN: z.string().optional(),
  KV_URL: z.string().optional(),

  // Email (optional)
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Melody Authentication Configuration (Phase 4)
  FEATURE_MELODY_AUTH: z.string().optional(),
  AUTH_NEXTAUTH_FALLBACK: z.string().optional(),
  AUTH_LOG_LEVEL: z.string().optional(),
  AUTH_SERVER_URL: z.string().url().optional(),
  NEXT_PUBLIC_AUTH_SERVER_URL: z.string().url().optional(),
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  AUTH_COOKIE_SECRET: z.string().min(32).optional(),
  AUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_GITHUB_CLIENT_ID: z.string().optional(),
  AUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
  AUTH_TEST_MODE: z.string().optional(),
  AUTH_TEST_USER_EMAIL: z.string().email().optional(),
  AUTH_TEST_USER_PASSWORD: z.string().optional(),
  AUTH_LOG_ACTIVITY: z.string().optional(),
  AUTH_METRICS_ENABLED: z.string().optional(),
  
  // Cloudflare Configuration
  CLOUDFLARE_PROJECT_NAME: z.string().optional(),
  CLOUDFLARE_ENVIRONMENT: z.string().optional(),
  CLOUDFLARE_TOKEN: z.string().optional(),

  // Application Configuration
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  ADMIN_EMAIL: z.string().email().optional(),

  // Environment
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  CI: z.string().optional(),
});

// Type for the validated environment
type ServerEnv = z.infer<typeof serverEnvSchema>;

// Validate environment variables
function validateEnv(): ServerEnv {
  try {
    return serverEnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => e.path.join('.')).join(', ');
      console.error('❌ Invalid environment variables:', missingVars);
      console.error('Validation errors:', error.errors);

      // In development, provide helpful error messages
      if (process.env.NODE_ENV === 'development') {
        console.error(
          '\n📋 Please check your .env.local file and ensure all required variables are set.'
        );
        console.error(
          'You can copy env.example to .env.local as a starting point.\n'
        );
      }

      throw new Error(`Environment validation failed: ${missingVars}`);
    }
    throw error;
  }
}

// Validate and export the configuration
export const serverConfig = validateEnv();

// Helper functions for common checks
export const isDevelopment = serverConfig.NODE_ENV === 'development';
export const isProduction = serverConfig.NODE_ENV === 'production';
export const isTest = serverConfig.NODE_ENV === 'test';
export const isCI = Boolean(serverConfig.CI);

// Check if at least one AI provider is configured
export function hasAIProvider(): boolean {
  return Boolean(
    serverConfig.OPENAI_API_KEY ||
      serverConfig.ANTHROPIC_API_KEY ||
      serverConfig.GEMINI_API_KEY ||
      serverConfig.GOOGLE_API_KEY ||
      serverConfig.GROQ_API_KEY
  );
}

// Check if OAuth is configured
export function hasOAuthProvider(): boolean {
  return Boolean(
    (serverConfig.GOOGLE_CLIENT_ID && serverConfig.GOOGLE_CLIENT_SECRET) ||
      (serverConfig.GITHUB_CLIENT_ID && serverConfig.GITHUB_CLIENT_SECRET)
  );
}

// Check if email is configured
export function hasEmailProvider(): boolean {
  return Boolean(serverConfig.RESEND_API_KEY && serverConfig.EMAIL_FROM);
}

// Check if rate limiting is configured
export function hasRateLimiting(): boolean {
  return Boolean(
    serverConfig.KV_REST_API_URL && serverConfig.KV_REST_API_TOKEN
  );
}

// Export individual config values for convenience
export const {
  DATABASE_URL,
  NEXTAUTH_URL,
  NEXTAUTH_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  GEMINI_API_KEY,
  GOOGLE_API_KEY,
  GROQ_API_KEY,
  KV_REST_API_URL,
  KV_REST_API_TOKEN,
  KV_URL,
  RESEND_API_KEY,
  EMAIL_FROM,
  FEATURE_MELODY_AUTH,
  AUTH_NEXTAUTH_FALLBACK,
  AUTH_LOG_LEVEL,
  AUTH_SERVER_URL,
  NEXT_PUBLIC_AUTH_SERVER_URL,
  AUTH_JWT_SECRET,
  AUTH_COOKIE_SECRET,
  AUTH_GOOGLE_CLIENT_ID,
  AUTH_GOOGLE_CLIENT_SECRET,
  AUTH_GITHUB_CLIENT_ID,
  AUTH_GITHUB_CLIENT_SECRET,
  AUTH_TEST_MODE,
  AUTH_TEST_USER_EMAIL,
  AUTH_TEST_USER_PASSWORD,
  AUTH_LOG_ACTIVITY,
  AUTH_METRICS_ENABLED,
  CLOUDFLARE_PROJECT_NAME,
  CLOUDFLARE_ENVIRONMENT,
  CLOUDFLARE_TOKEN,
  NEXT_PUBLIC_APP_URL,
  ADMIN_EMAIL,
  NODE_ENV,
} = serverConfig;

// Melody Authentication Helper Functions
export function isMelodyEnabled(): boolean {
  return serverConfig.FEATURE_MELODY_AUTH === 'true';
}

export function hasNextAuthFallback(): boolean {
  return serverConfig.AUTH_NEXTAUTH_FALLBACK !== 'false';
}

export function isAuthTestMode(): boolean {
  return serverConfig.AUTH_TEST_MODE === 'true';
}

export function getActiveAuthProvider(): 'melody' | 'nextauth' {
  if (isMelodyEnabled() && !hasNextAuthFallback()) {
    return 'melody';
  }
  return 'nextauth';
}

export function hasMelodyOAuthProvider(): boolean {
  return Boolean(
    (serverConfig.AUTH_GOOGLE_CLIENT_ID && serverConfig.AUTH_GOOGLE_CLIENT_SECRET) ||
    (serverConfig.AUTH_GITHUB_CLIENT_ID && serverConfig.AUTH_GITHUB_CLIENT_SECRET)
  );
}

export function validateMelodySecrets(): string[] {
  const errors: string[] = [];
  
  if (serverConfig.AUTH_JWT_SECRET && serverConfig.AUTH_JWT_SECRET.length < 32) {
    errors.push('AUTH_JWT_SECRET must be at least 32 characters long');
  }
  
  if (serverConfig.AUTH_COOKIE_SECRET && serverConfig.AUTH_COOKIE_SECRET.length < 32) {
    errors.push('AUTH_COOKIE_SECRET must be at least 32 characters long');
  }
  
  return errors;
}

/**
 * Melody Auth Configuration
 * Migration from NextAuth to Melody Auth
 * Cloudflare Workers Deployment Compatible
 */

import { z } from 'zod';

// Melody Configuration Schema
const melodyConfigSchema = z.object({
  server: z.object({
    url: z.string().url(),
    jwtSecret: z.string().min(32),
    cookieSecret: z.string().min(32),
  }),
  
  database: z.object({
    type: z.enum(['postgres', 'd1']),
    url: z.string(),
    kvUrl: z.string().optional(),
  }),
  
  providers: z.object({
    google: z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      redirectUri: z.string().url(),
    }),
    github: z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      redirectUri: z.string().url(),
    }),
    credentials: z.object({
      enabled: z.boolean(),
      registration: z.object({
        enabled: z.boolean(),
        emailVerification: z.boolean(),
      }),
    }),
  }),
  
  session: z.object({
    strategy: z.enum(['jwt', 'database']),
    maxAge: z.number(),
    updateAge: z.number(),
    secure: z.boolean(),
  }),
  
  security: z.object({
    rateLimit: z.object({
      windowMs: z.number(),
      max: z.number(),
    }),
    bruteForceProtection: z.boolean(),
  }),
  
  admin: z.object({
    enabled: z.boolean(),
    email: z.string().email().optional(),
  }),
});

// Main Melody Configuration
export const melodyConfig = melodyConfigSchema.parse({
  // Server configuration
  server: {
    url: process.env.AUTH_SERVER_URL || 'http://localhost:8787',
    jwtSecret: process.env.AUTH_JWT_SECRET || 'your-jwt-secret-here-change-in-production',
    cookieSecret: process.env.AUTH_COOKIE_SECRET || 'your-cookie-secret-here',
  },

  // Database configuration
  database: {
    type: process.env.NODE_ENV === 'development' ? 'postgres' : 'd1',
    url: process.env.DATABASE_URL || 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev',
    kvUrl: process.env.KV_URL,
  },

  // OAuth Providers
  providers: {
    google: {
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri: `${process.env.AUTH_SERVER_URL || 'http://localhost:8787'}/auth/callback/google`,
    },
    github: {
      clientId: process.env.AUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
      clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
      redirectUri: `${process.env.AUTH_SERVER_URL || 'http://localhost:8787'}/auth/callback/github`,
    },
    credentials: {
      enabled: true,
      registration: {
        enabled: true,
        emailVerification: false, // Can enable later with resend
      },
    },
  },

  // Session configuration
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
    secure: process.env.NODE_ENV === 'production',
  },

  // Security configuration
  security: {
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
    bruteForceProtection: true,
  },

  // Admin configuration
  admin: {
    enabled: true,
    email: process.env.ADMIN_EMAIL,
  },
});

// Client-side configuration for React SDK
export const melodyClientConfig = {
  serverUrl: process.env.NEXT_PUBLIC_AUTH_SERVER_URL || 'http://localhost:8787',
  clientId: 'werewolf-ai-client', // Unique client identifier
  redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
  
  // OAuth providers configuration
  providers: {
    google: {
      enabled: !!(process.env.NEXT_PUBLIC_AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID),
      clientId: process.env.NEXT_PUBLIC_AUTH_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    },
    github: {
      enabled: !!(process.env.NEXT_PUBLIC_AUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID),
      clientId: process.env.NEXT_PUBLIC_AUTH_GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID,
    },
    credentials: {
      enabled: true,
    },
  },
};

// Environment variable mapping helpers
export const envMapping = {
  // NextAuth → Melody Migration Mapping
  NEXTAUTH_URL: 'AUTH_SERVER_URL',
  NEXTAUTH_SECRET: 'AUTH_JWT_SECRET',
  GOOGLE_CLIENT_ID: 'AUTH_GOOGLE_CLIENT_ID',
  GOOGLE_CLIENT_SECRET: 'AUTH_GOOGLE_CLIENT_SECRET',
  GITHUB_CLIENT_ID: 'AUTH_GITHUB_CLIENT_ID',
  GITHUB_CLIENT_SECRET: 'AUTH_GITHUB_CLIENT_SECRET',
} as const;

// Export types for TypeScript
export type MelodyConfig = typeof melodyConfig;
export type MelodyClientConfig = typeof melodyClientConfig;

// Validation function to check required environment variables
export function validateMelodyEnv(): string[] {
  const errors: string[] = [];
  
  if (!process.env.AUTH_JWT_SECRET || process.env.AUTH_JWT_SECRET.length < 32) {
    errors.push('AUTH_JWT_SECRET must be set and at least 32 characters long');
  }
  
  if (!process.env.AUTH_COOKIE_SECRET || process.env.AUTH_COOKIE_SECRET.length < 32) {
    errors.push('AUTH_COOKIE_SECRET must be set and at least 32 characters long');
  }
  
  if (!process.env.AUTH_GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID) {
    errors.push('At least one Google OAuth client ID must be configured');
  }
  
  if (!process.env.AUTH_GITHUB_CLIENT_ID && !process.env.GITHUB_CLIENT_ID) {
    errors.push('At least one GitHub OAuth client ID must be configured');
  }
  
  return errors;
}

// Debug function for development
export function logMelodyConfig(): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('🎵 Melody Auth Configuration:', {
      server: {
        url: melodyConfig.server.url,
        hasJwtSecret: !!melodyConfig.server.jwtSecret,
        hasCookieSecret: !!melodyConfig.server.cookieSecret,
      },
      database: {
        type: melodyConfig.database.type,
        hasUrl: !!melodyConfig.database.url,
      },
      providers: {
        google: {
          enabled: !!melodyConfig.providers.google.clientId,
          hasRedirect: !!melodyConfig.providers.google.redirectUri,
        },
        github: {
          enabled: !!melodyConfig.providers.github.clientId,
          hasRedirect: !!melodyConfig.providers.github.redirectUri,
        },
        credentials: {
          enabled: melodyConfig.providers.credentials.enabled,
          registration: melodyConfig.providers.credentials.registration.enabled,
        },
      },
      session: {
        strategy: melodyConfig.session.strategy,
        maxAge: melodyConfig.session.maxAge,
      },
    });
  }
}
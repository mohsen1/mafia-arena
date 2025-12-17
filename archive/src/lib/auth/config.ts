/**
 * Unified Authentication Configuration
 * Supports both NextAuth and Melody Auth with feature flags
 * Phase 2 Migration: NextAuth to Melody
 */

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db/config';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// TypeScript interfaces for authentication
export interface AuthSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  provider?: 'nextauth' | 'melody';
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  provider?: 'nextauth' | 'melody';
}

// Feature flag configuration
const authFeatureFlagsSchema = z.object({
  enableMelody: z.boolean().default(true), // Default to Melody enabled
  melodyServerUrl: z.string().optional(),
  nextAuthFallback: z.boolean().default(false), // NextAuth removed
  logAuthActivity: z.boolean().default(process.env.NODE_ENV === 'development'),
});

// Environment-based configuration
const authConfigSchema = z.object({
  featureFlags: authFeatureFlagsSchema,
  
  // NextAuth configuration
  nextAuth: z.object({
    trustHost: z.boolean().default(true),
    sessionStrategy: z.enum(['jwt', 'database']).default('jwt'),
    sessionMaxAge: z.number().default(30 * 24 * 60 * 60), // 30 days
    sessionUpdateAge: z.number().default(24 * 60 * 60), // 24 hours
    pages: z.object({
      signIn: z.string().default('/auth/signin'),
      error: z.string().default('/auth/error'),
    }),
  }),
  
  // Melody configuration
  melody: z.object({
    serverUrl: z.string().default('http://localhost:8787'),
    clientId: z.string().default('werewolf-ai-client'),
    clientSecret: z.string(),
    jwtSecret: z.string(),
    cookieSecret: z.string(),
    sessionStrategy: z.enum(['jwt', 'database']).default('jwt'),
    sessionMaxAge: z.number().default(30 * 24 * 60 * 60), // 30 days
    sessionUpdateAge: z.number().default(24 * 60 * 60), // 24 hours
  }),
  
  // Database configuration
  database: z.object({
    url: z.string(),
    kvUrl: z.string().optional(),
  }),
  
  // OAuth Providers (shared between both systems)
  providers: z.object({
    google: z.object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      redirectUri: z.string(),
    }),
    github: z.object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      redirectUri: z.string(),
    }),
    credentials: z.object({
      enabled: z.boolean().default(true),
      registration: z.object({
        enabled: z.boolean().default(true),
        emailVerification: z.boolean().default(false),
      }),
    }),
  }),
});

// Create unified auth configuration
export const authConfig = authConfigSchema.parse({
  featureFlags: {
    enableMelody: process.env.AUTH_ENABLE_MELODY === 'true',
    melodyServerUrl: process.env.MELODY_SERVER_URL,
    nextAuthFallback: process.env.AUTH_NEXTAUTH_FALLBACK !== 'false',
    logAuthActivity: process.env.NODE_ENV === 'development' || process.env.AUTH_LOG_ACTIVITY === 'true',
  },
  
  nextAuth: {
    trustHost: true,
    sessionStrategy: 'jwt',
    sessionMaxAge: 30 * 24 * 60 * 60,
    sessionUpdateAge: 24 * 60 * 60,
    pages: {
      signIn: '/auth/signin',
      error: '/auth/error',
    },
  },
  
  melody: {
    serverUrl: process.env.MELODY_SERVER_URL || 'http://localhost:8787',
    clientId: 'werewolf-ai-client',
    clientSecret: process.env.MELODY_CLIENT_SECRET || '',
    jwtSecret: process.env.AUTH_JWT_SECRET || 'your-jwt-secret-here',
    cookieSecret: process.env.AUTH_COOKIE_SECRET || 'your-cookie-secret-here',
    sessionStrategy: 'jwt',
    sessionMaxAge: 30 * 24 * 60 * 60,
    sessionUpdateAge: 24 * 60 * 60,
  },
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://werewolf_ai:dev_password_2024@localhost:5432/werewolf_ai_dev',
    kvUrl: process.env.KV_URL,
  },
  
  providers: {
    google: {
      enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/melody/callback/google`,
    },
    github: {
      enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      redirectUri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/melody/callback/github`,
    },
    credentials: {
      enabled: true,
      registration: {
        enabled: true,
        emailVerification: false,
      },
    },
  },
});

// Authentication provider interface
export interface AuthProvider {
  name: string;
  enabled: boolean;
  signIn: (options?: any) => Promise<any>;
  signOut: (options?: any) => Promise<any>;
  getSession?: (request?: Request) => Promise<any>;
  getUser?: (token?: string) => Promise<any>;
}

// NextAuth provider (REMOVED - use Melody instead)
export class NextAuthProvider implements AuthProvider {
  name = 'nextauth';
  enabled = false; // Always disabled - NextAuth removed

  constructor() {
    console.warn('⚠️  NextAuth provider is deprecated. Use Melody instead.');
  }

  async signIn(_options?: any) {
    throw new Error('NextAuth has been removed. Use Melody endpoints.');
  }

  async signOut(_options?: any) {
    throw new Error('NextAuth has been removed. Use Melody endpoints.');
  }

  async getSession(_request?: Request) {
    return null;
  }

  get handlers() {
    throw new Error('NextAuth handlers not available. Use Melody endpoints.');
  }
}

// Melody provider (new system)
export class MelodyProvider implements AuthProvider {
  name = 'melody';
  enabled = authConfig.featureFlags.enableMelody;
  
  constructor() {
    if (authConfig.featureFlags.logAuthActivity) {
      console.log(`🎵 Melody Auth ${this.enabled ? 'enabled' : 'disabled'}`);
    }
  }
  
  async signIn(options?: any) {
    if (!this.enabled) {
      throw new Error('Melody is not enabled');
    }
    
    // Redirect to Melody auth server
    const { provider, redirect } = options;
    const authUrl = `${authConfig.melody.serverUrl}/auth/signin/${provider}`;
    
    if (redirect !== false) {
      return redirect(authUrl);
    }
    
    return { url: authUrl };
  }
  
  async signOut(options?: any) {
    if (!this.enabled) {
      throw new Error('Melody is not enabled');
    }
    
    // Clear session cookie and redirect to auth server logout
    const logoutUrl = `${authConfig.melody.serverUrl}/auth/signout`;
    
    if (options?.redirect !== false) {
      return new Response(null, {
        status: 302,
        headers: { Location: logoutUrl },
      });
    }
    
    return { url: logoutUrl };
  }
  
  async getSession(request?: Request) {
    if (!this.enabled) {
      return null;
    }
    
    try {
      // Extract session from Melody session cookie
      const sessionToken = request?.headers.get('cookie')
        ?.split(';')
        .find(c => c.trim().startsWith('melody-session='))
        ?.split('=')[1];
      
      if (!sessionToken) {
        return null;
      }
      
      // Validate session with Melody server
      const response = await fetch(`${authConfig.melody.serverUrl}/api/auth/session`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Cookie': `melody-session=${sessionToken}`,
        },
      });
      
      if (!response.ok) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      if (authConfig.featureFlags.logAuthActivity) {
        console.error('Melody session validation error:', error);
      }
      return null;
    }
  }
  
  async getUser(token?: string) {
    if (!this.enabled || !token) {
      return null;
    }
    
    try {
      const response = await fetch(`${authConfig.melody.serverUrl}/api/auth/user`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      if (authConfig.featureFlags.logAuthActivity) {
        console.error('Melody user fetch error:', error);
      }
      return null;
    }
  }
}

// Credentials provider (shared logic)
export class CredentialsProvider implements AuthProvider {
  name = 'credentials';
  enabled = authConfig.providers.credentials.enabled;
  
  async signIn(credentials: { email: string; password: string }) {
    if (!this.enabled) {
      throw new Error('Credentials authentication is not enabled');
    }
    
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, credentials.email))
        .limit(1);
      
      if (!user || !user.password) {
        return null;
      }
      
      const isValidPassword = await bcrypt.compare(
        credentials.password,
        user.password
      );
      
      if (!isValidPassword) {
        return null;
      }
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    } catch (error) {
      console.error('Credentials authentication error:', error);
      return null;
    }
  }
  
  async signOut() {
    return { success: true };
  }
}

// Initialize providers
export const nextAuthProvider = new NextAuthProvider();
export const melodyProvider = new MelodyProvider();
export const credentialsProvider = new CredentialsProvider();

// Unified authentication handlers (Melody-only)
export class UnifiedAuth {
  private activeProvider: AuthProvider;

  constructor() {
    // Only use Melody - NextAuth removed
    this.activeProvider = melodyProvider;

    if (authConfig.featureFlags.logAuthActivity) {
      console.log('🎵 Using Melody as auth provider (NextAuth removed)');
      console.log('🔐 Auth Provider Status:', {
        melody: melodyProvider.enabled,
        credentials: credentialsProvider.enabled,
        active: this.activeProvider.name,
      });
    }
  }

  // Get current active provider
  getProvider() {
    return this.activeProvider;
  }

  // Switch provider (for testing/development) - only Melody supported
  setProvider(providerName: 'nextauth' | 'melody') {
    if (providerName === 'melody' && melodyProvider.enabled) {
      this.activeProvider = melodyProvider;
    } else if (providerName === 'nextauth') {
      throw new Error('NextAuth has been removed. Use Melody instead.');
    }
  }
  
  // Auth methods
  async signIn(options?: any) {
    if (authConfig.featureFlags.logAuthActivity) {
      console.log(`🔐 SignIn via ${this.activeProvider.name}`);
    }
    return this.activeProvider.signIn(options);
  }
  
  async signOut(options?: any) {
    if (authConfig.featureFlags.logAuthActivity) {
      console.log(`🔐 SignOut via ${this.activeProvider.name}`);
    }
    return this.activeProvider.signOut(options);
  }
  
  async getSession(request?: Request) {
    return this.activeProvider.getSession?.(request);
  }
  
  async getUser(token?: string) {
    return this.activeProvider.getUser?.(token);
  }
  
  // Get handlers for Melody
  get handlers() {
    // Return Melody-compatible handlers
    return {
      GET: async (request: Request) => {
        const session = await this.getSession(request);
        return new Response(JSON.stringify({ authenticated: !!session }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      POST: async () => {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    };
  }
  
  // Get auth function for NextAuth compatibility
  get auth() {
    return async (request?: Request) => {
      return this.getSession(request);
    };
  }
}

// Create unified auth instance
export const unifiedAuth = new UnifiedAuth();

// Export unified interface
export const { handlers, signIn, signOut, auth } = unifiedAuth;

// Export feature flags for components
export const authFeatureFlags = authConfig.featureFlags;
export const isMelodyEnabled = authConfig.featureFlags.enableMelody;
export const isNextAuthEnabled = false; // NextAuth removed

// TypeScript interfaces for NextAuth compatibility
export interface NextAuthSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  provider?: 'nextauth' | 'melody';
}

export interface NextAuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  provider?: 'nextauth' | 'melody';
}

// Note: Module augmentation handled separately when needed
// NextAuth types will be imported directly from NextAuth package when available

// Development utilities
if (authConfig.featureFlags.logAuthActivity) {
  console.log('🎵 Melody Auth Configuration:', {
    featureFlags: authConfig.featureFlags,
    activeProvider: unifiedAuth.getProvider().name,
    melodyEnabled: melodyProvider.enabled,
    credentialsEnabled: credentialsProvider.enabled,
  });
}

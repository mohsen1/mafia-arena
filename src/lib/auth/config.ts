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
  enableMelody: z.boolean().default(false),
  melodyServerUrl: z.string().optional(),
  nextAuthFallback: z.boolean().default(true),
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

// NextAuth provider (legacy system)
export class NextAuthProvider implements AuthProvider {
  name = 'nextauth';
  enabled = authConfig.featureFlags.nextAuthFallback && !authConfig.featureFlags.enableMelody;
  
  private nextAuthConfig: any;
  private nextAuthHandlers: any;
  
  constructor() {
    if (!this.enabled) return;
    
    try {
      // Create NextAuth configuration matching the original setup
      const NextAuth = require('next-auth');
      const Google = require('next-auth/providers/google');
      const GitHub = require('next-auth/providers/github');
      const Credentials = require('next-auth/providers/credentials');
      
      this.nextAuthConfig = {
        trustHost: true,
        providers: [
          // Google provider
          ...(authConfig.providers.google.enabled ? [
            Google({
              clientId: authConfig.providers.google.clientId,
              clientSecret: authConfig.providers.google.clientSecret,
              authorization: {
                url: "https://accounts.google.com/o/oauth2/v2/auth",
                params: {
                  prompt: "consent",
                  access_type: "offline",
                  response_type: "code",
                  scope: "openid email profile",
                },
              },
              token: "https://oauth2.googleapis.com/token",
              userinfo: "https://www.googleapis.com/oauth2/v3/userinfo",
            }),
          ] : []),
          
          // GitHub provider
          ...(authConfig.providers.github.enabled ? [
            GitHub({
              clientId: authConfig.providers.github.clientId,
              clientSecret: authConfig.providers.github.clientSecret,
            }),
          ] : []),
          
          // Credentials provider
          ...(authConfig.providers.credentials.enabled ? [
            Credentials({
              credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
              },
              async authorize(credentials: { email: string; password: string }) {
                if (!credentials?.email || !credentials?.password) {
                  return null;
                }
                
                // Use the credentials provider logic from unified auth
                return await credentialsProvider.signIn(credentials);
              },
            }),
          ] : []),
        ],
        
        session: {
          strategy: authConfig.nextAuth.sessionStrategy,
          maxAge: authConfig.nextAuth.sessionMaxAge,
          updateAge: authConfig.nextAuth.sessionUpdateAge,
        },
        
        callbacks: {
          async jwt({ token, user, account }: any) {
            if (account && user) {
              token.id = user.id;
              token.email = user.email;
              token.name = user.name;
              token.image = user.image;
            }
            return token;
          },
          
          async session({ session, token }: any) {
            if (token && session.user) {
              session.user.id = token.id as string;
              session.user.email = token.email as string;
              session.user.name = token.name as string;
              session.user.image = token.image as string;
            }
            return session;
          },
        },
        
        pages: {
          signIn: authConfig.nextAuth.pages.signIn,
          error: authConfig.nextAuth.pages.error,
        },
      };
      
      // Create NextAuth instance
      const authInstance = NextAuth(this.nextAuthConfig);
      this.nextAuthHandlers = authInstance;
      
      if (authConfig.featureFlags.logAuthActivity) {
        console.log('✅ NextAuth provider initialized successfully');
      }
    } catch (error) {
      console.error('❌ NextAuth initialization failed:', error);
      this.enabled = false;
    }
  }
  
  async signIn(options?: any) {
    if (!this.enabled || !this.nextAuthHandlers) {
      throw new Error('NextAuth is not enabled');
    }
    
    return this.nextAuthHandlers.signIn(options);
  }
  
  async signOut(options?: any) {
    if (!this.enabled || !this.nextAuthHandlers) {
      throw new Error('NextAuth is not enabled');
    }
    
    return this.nextAuthHandlers.signOut(options);
  }
  
  async getSession(request?: Request) {
    if (!this.enabled || !this.nextAuthHandlers) {
      return null;
    }
    
    return this.nextAuthHandlers.auth(request);
  }
  
  get handlers() {
    return {
      GET: this.nextAuthHandlers.GET,
      POST: this.nextAuthHandlers.POST,
      PUT: this.nextAuthHandlers.PUT,
      DELETE: this.nextAuthHandlers.DELETE,
    };
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

// Unified authentication handlers
export class UnifiedAuth {
  private activeProvider: AuthProvider;
  
  constructor() {
    // Determine active provider based on feature flags
    if (authConfig.featureFlags.enableMelody) {
      this.activeProvider = melodyProvider;
      if (authConfig.featureFlags.logAuthActivity) {
        console.log('🎵 Using Melody as primary auth provider');
      }
    } else {
      this.activeProvider = nextAuthProvider;
      if (authConfig.featureFlags.logAuthActivity) {
        console.log('🔐 Using NextAuth as primary auth provider');
      }
    }
    
    if (authConfig.featureFlags.logAuthActivity) {
      console.log('🔐 Auth Provider Status:', {
        nextAuth: nextAuthProvider.enabled,
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
  
  // Switch provider (for testing/development)
  setProvider(providerName: 'nextauth' | 'melody') {
    if (providerName === 'melody' && melodyProvider.enabled) {
      this.activeProvider = melodyProvider;
    } else if (providerName === 'nextauth' && nextAuthProvider.enabled) {
      this.activeProvider = nextAuthProvider;
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
  
  // Get NextAuth handlers for compatibility
  get handlers() {
    if (this.activeProvider.name === 'nextauth' && nextAuthProvider.enabled) {
      return nextAuthProvider.handlers;
    }
    
    // Return dummy handlers for Melody
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
export const isNextAuthEnabled = !authConfig.featureFlags.enableMelody;

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
  console.log('🔐 Unified Auth Configuration:', {
    featureFlags: authConfig.featureFlags,
    activeProvider: unifiedAuth.getProvider().name,
    nextAuthEnabled: nextAuthProvider.enabled,
    melodyEnabled: melodyProvider.enabled,
    credentialsEnabled: credentialsProvider.enabled,
  });
}

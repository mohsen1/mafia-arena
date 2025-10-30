# NextAuth to Melody Migration Plan
## Cloudflare Workers Deployment Strategy

**Date:** October 30, 2025  
**Project:** Werewolf AI  
**Migration Target:** NextAuth v5.0.0-beta.30 → Melody Auth v1.0.0+  
**Cloudflare Platform:** Workers + D1 + KV Storage  

---

## Executive Summary

This migration plan outlines a comprehensive transition from NextAuth to Melody Auth while maintaining compatibility with the existing Cloudflare Workers deployment architecture. The plan prioritizes zero-downtime migration, data preservation, and enhanced performance through edge computing.

**Key Benefits:**
- Edge-optimized authentication on Cloudflare Workers
- Reduced latency for global users
- Enhanced OAuth security with PKCE
- Improved developer experience with React SDK
- Better scalability with built-in rate limiting

---

## Phase 1: Environment & Dependencies Setup

### Timeline: 2-3 hours

### Step 1.1: Update package.json Dependencies

**Files to Modify:**
- `package.json`

**Before:**
```json
{
  "dependencies": {
    "next-auth": "5.0.0-beta.30",
    "@auth/core": "^0.34.3",
    "@auth/drizzle-adapter": "^1.9.1"
  }
}
```

**After:**
```json
{
  "dependencies": {
    "@melody-auth/server": "^1.0.0",
    "@melody-auth/react": "^1.0.10",
    "@melody-auth/next": "^1.0.0"
  },
  "devDependencies": {
    "@cloudflare/next-on-pages": "^1.13.16",
    "@opennextjs/cloudflare": "^1.11.0",
    "wrangler": "^4.44.0"
  }
}
```

**Dependencies to Remove:**
- `@auth/core`
- `@auth/drizzle-adapter`
- `next-auth`

**Testing Steps:**
1. Run `pnpm install` to install new dependencies
2. Verify no peer dependency conflicts
3. Check TypeScript compilation: `pnpm run check:tsc`

**Rollback Strategy:**
- Keep `package.json` in git with previous dependencies
- Use `git checkout package.json` to revert if needed

### Step 1.2: Environment Variable Mapping

**Files to Create/Modify:**
- `env.example`
- `.env.local` (create if doesn't exist)

**Migration Mapping:**
```bash
# NextAuth → Melody Migration
# ======================================

# Core Authentication
NEXTAUTH_URL → AUTH_SERVER_URL
NEXTAUTH_SECRET → AUTH_JWT_SECRET

# OAuth Providers
GOOGLE_CLIENT_ID → AUTH_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET → AUTH_GOOGLE_CLIENT_SECRET
GITHUB_CLIENT_ID → AUTH_GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET → AUTH_GITHUB_CLIENT_SECRET

# New Melody-Specific Variables
AUTH_COOKIE_SECRET="your-cookie-secret"
AUTH_SERVER_URL="https://your-auth-domain.workers.dev"

# Database (Cloudflare)
DATABASE_URL="d1:werewolf-auth-db"
KV_URL="kv:werewolf-auth-sessions"

# Rate Limiting (Upstash KV)
KV_REST_API_URL="your-upstash-kv-url"
KV_REST_API_TOKEN="your-upstash-kv-token"
```

**Complete env.example:**
```bash
# Environment example for local development.
# In production and preview deployments on Vercel, configure the provided
# environment variables through the Vercel dashboard.

# Melody Authentication Configuration
AUTH_SERVER_URL="http://localhost:8787"
AUTH_JWT_SECRET="your-jwt-secret-here-change-in-production"
AUTH_COOKIE_SECRET="your-cookie-secret-here"

# OAuth Providers
AUTH_GOOGLE_CLIENT_ID="your-google-client-id"
AUTH_GOOGLE_CLIENT_SECRET="your-google-client-secret"
AUTH_GITHUB_CLIENT_ID="your-github-client-id"
AUTH_GITHUB_CLIENT_SECRET="your-github-client-secret"

# Database Configuration (Cloudflare D1)
DATABASE_URL="d1:werewolf-auth-db"
KV_URL="kv:werewolf-auth-sessions"

# Legacy Compatibility Variables
# (Keep during migration, deprecate later)
NEXTAUTH_URL="http://localhost:3099"
NEXTAUTH_SECRET="your-secret-key-here-change-in-production"

# AI Model Configuration 
OPENAI_API_KEY="your-openai-api-key"
ANTHROPIC_API_KEY="your-anthropic-api-key"
GEMINI_API_KEY="your-gemini-api-key"
GOOGLE_API_KEY="your-google-api-key"
GROQ_API_KEY="your-groq-api-key"

# Rate Limiting 
KV_REST_API_URL="your-upstash-kv-url"
KV_REST_API_TOKEN="your-upstash-kv-token"

# Resend configuration (used in production)
RESEND_API_KEY="your-resend-api-key"
EMAIL_FROM="Werewolf AI <noreply@werewolf-ai.com>"
```

**Testing Steps:**
1. Create `.env.local` with new variables
2. Test environment loading with `node -e "console.log(process.env.AUTH_SERVER_URL)"`
3. Verify OAuth provider configuration

**Rollback Strategy:**
- Backup current environment configuration
- Keep NEXTAUTH_ variables as fallbacks during migration

### Step 1.3: Melody Configuration Files

**Files to Create:**
- `src/lib/auth/melody.config.ts`
- `melody-worker.toml` (Cloudflare Workers config)

**Melody Server Configuration:**
```typescript
// src/lib/auth/melody.config.ts
import { MelodyConfig } from '@melody-auth/server';

export const melodyConfig: MelodyConfig = {
  // Server configuration
  server: {
    url: process.env.AUTH_SERVER_URL,
    jwtSecret: process.env.AUTH_JWT_SECRET,
    cookieSecret: process.env.AUTH_COOKIE_SECRET,
  },

  // Database configuration
  database: {
    type: 'd1', // or 'postgres' for self-hosted
    url: process.env.DATABASE_URL,
    kvUrl: process.env.KV_URL,
  },

  // OAuth Providers
  providers: {
    google: {
      clientId: process.env.AUTH_GOOGLE_CLIENT_ID!,
      clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET!,
      redirectUri: `${process.env.AUTH_SERVER_URL}/auth/callback/google`,
    },
    github: {
      clientId: process.env.AUTH_GITHUB_CLIENT_ID!,
      clientSecret: process.env.AUTH_GITHUB_CLIENT_SECRET!,
      redirectUri: `${process.env.AUTH_SERVER_URL}/auth/callback/github`,
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
};
```

**Cloudflare Worker Configuration:**
```toml
# melody-worker.toml
name = "werewolf-auth"
main = "src/worker/index.ts"
compatibility_date = "2023-10-30"

# D1 Database
[[d1_databases]]
binding = "DATABASE"
database_name = "werewolf-auth-db"
# database_id = "your-database-id"

# KV Storage
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"

# Environment Variables
[vars]
AUTH_SERVER_URL = "https://werewolf-auth.yourdomain.workers.dev"
```

**Testing Steps:**
1. Validate TypeScript configuration
2. Check environment variable loading
3. Test configuration export

**Rollback Strategy:**
- Keep NextAuth configuration files
- Use git branches for separate configuration

---

## Phase 2: Core Authentication System Migration

### Timeline: 4-6 hours

### Step 2.1: Deploy Melody Auth Server on Cloudflare Workers

**Files to Create:**
- `src/worker/index.ts` (Melody Worker entry point)
- `src/worker/routes/auth.ts` (Auth routes)
- `src/worker/db/schema.sql` (D1 database schema)

**Melody Worker Implementation:**
```typescript
// src/worker/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth';
import { melodyConfig } from '@/lib/auth/melody.config';

const app = new Hono();

// CORS configuration for frontend
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

// Logger for development
if (process.env.NODE_ENV === 'development') {
  app.use('*', logger());
}

// Melody Auth routes
app.route('/auth', authRoutes);

// Health check
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

export default app;
```

```typescript
// src/worker/routes/auth.ts
import { Hono } from 'hono';
import { MelodyServer } from '@melody-auth/server';
import { melodyConfig } from '@/lib/auth/melody.config';

export const authRoutes = new Hono();

// Initialize Melody Server
const melody = new MelodyServer(melodyConfig);

// OAuth Providers
authRoutes.get('/signin/:provider', async (c) => {
  const provider = c.req.param('provider');
  return await melody.signIn(c, provider);
});

authRoutes.get('/callback/:provider', async (c) => {
  const provider = c.req.param('provider');
  return await melody.callback(c, provider);
});

authRoutes.post('/signout', async (c) => {
  return await melody.signOut(c);
});

// Session management
authRoutes.get('/session', async (c) => {
  return await melody.getSession(c);
});

authRoutes.post('/refresh', async (c) => {
  return await melody.refreshToken(c);
});

// User management
authRoutes.get('/user', async (c) => {
  return await melody.getUser(c);
});

authRoutes.put('/user', async (c) => {
  const userData = await c.req.json();
  return await melody.updateUser(c, userData);
});

// Registration
authRoutes.post('/register', async (c) => {
  const userData = await c.req.json();
  return await melody.register(c, userData);
});
```

**D1 Database Schema:**
```sql
-- src/worker/db/schema.sql
-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  email_verified DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- OAuth accounts
CREATE TABLE oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_account_id)
);

-- Sessions
CREATE TABLE sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Verification tokens
CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires DATETIME NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- User metadata (for additional user data)
CREATE TABLE user_metadata (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, key)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires);
```

**Deployment Commands:**
```bash
# Deploy to Cloudflare Workers
wrangler publish

# Or using package.json script
pnpm run deploy:cloudflare
```

**Testing Steps:**
1. Deploy Worker to Cloudflare
2. Test basic routes: `/health`
3. Verify D1 database connection
4. Test OAuth flow endpoints

**Rollback Strategy:**
- Keep NextAuth routes active during testing
- Use different URL paths for Melody (`/melody-auth/*`)

### Step 2.2: Update Authentication Configuration

**Files to Modify:**
- `src/lib/auth/config.ts` → `src/lib/auth/melody-server.ts`
- Create client configuration file

**Melody Server Configuration:**
```typescript
// src/lib/auth/melody-server.ts
import { MelodyServerClient } from '@melody-auth/server';
import { melodyConfig } from './melody.config';

export class MelodyServerClientImpl implements MelodyServerClient {
  private config: typeof melodyConfig;

  constructor() {
    this.config = melodyConfig;
  }

  // Session management
  async getSession(request: Request) {
    // Implementation using KV storage
  }

  async createSession(userId: string) {
    // Create JWT-based session
  }

  async refreshSession(token: string) {
    // Refresh expired session token
  }

  async signOut(token: string) {
    // Invalidate session
  }

  // User management
  async createUser(userData: {
    email: string;
    name?: string;
    image?: string;
  }) {
    // Create user in D1 database
  }

  async getUser(userId: string) {
    // Fetch user from database
  }

  async updateUser(userId: string, updates: Partial<User>) {
    // Update user data
  }

  // OAuth flows
  async signInWithProvider(provider: string, code: string) {
    // Handle OAuth sign-in
  }

  // Database queries
  async query(table: string, conditions: Record<string, any>) {
    // D1 database operations
  }
}

export const melodyServer = new MelodyServerClientImpl();
```

**Testing Steps:**
1. Test session creation/retrieval
2. Verify user creation flow
3. Test OAuth provider integration
4. Check database schema compatibility

**Rollback Strategy:**
- Keep original auth config as backup
- Implement feature flags for gradual rollout

---

## Phase 3: Client-Side Components Migration

### Timeline: 6-8 hours

### Step 3.1: Update SessionProvider Integration

**Files to Modify:**
- `src/app/layout.tsx`
- Create new provider wrapper

**Before (NextAuth):**
```tsx
// src/app/layout.tsx
import { SessionProvider } from 'next-auth/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
```

**After (Melody):**
```tsx
// src/app/layout.tsx
import { MelodyProvider } from '@melody-auth/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <MelodyProvider
          config={{
            serverUrl: process.env.NEXT_PUBLIC_AUTH_SERVER_URL,
            clientId: 'werewolf-ai-client', // Unique client identifier
            redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
          }}
        >
          {children}
        </MelodyProvider>
      </body>
    </html>
  );
}
```

**Environment Variable Addition:**
Add to `.env.local`:
```bash
NEXT_PUBLIC_AUTH_SERVER_URL="https://werewolf-auth.yourdomain.workers.dev"
```

**Testing Steps:**
1. Test provider initialization
2. Check for console errors
3. Verify session loading state

**Rollback Strategy:**
- Keep SessionProvider in separate component
- Use environment variable for provider selection

### Step 3.2: Migrate useSession → Melody React SDK

**Files to Modify:**
- `src/components/Header.tsx`
- All components using `useSession`

**Before (NextAuth):**
```tsx
// src/components/Header.tsx
import { useSession, signIn, signOut } from 'next-auth/react';

export function Header() {
  const { data: session, status } = useSession();
  
  if (status === 'loading') return <div>Loading...</div>;
  
  return (
    <div>
      {session ? (
        <div>
          <span>Welcome {session.user.name}</span>
          <button onClick={() => signOut()}>Sign Out</button>
        </div>
      ) : (
        <button onClick={() => signIn()}>Sign In</button>
      )}
    </div>
  );
}
```

**After (Melody):**
```tsx
// src/components/Header.tsx
import { useAuth } from '@melody-auth/react';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, User } from 'lucide-react';

export function Header() {
  const { user, loading, signIn, signOut } = useAuth();
  
  if (loading) return (
    <div className="w-8 h-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  );
  
  return (
    <div className="flex items-center space-x-4">
      {user ? (
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium">
            {user.name || user.email}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut()}
          >
            <LogOut className="w-4 h-4 me-2" />
            Sign Out
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => signIn()}
          className="flex items-center"
        >
          <LogIn className="w-4 h-4 me-2" />
          Sign In
        </Button>
      )}
    </div>
  );
}
```

**Updated Authentication Methods:**
```tsx
// src/components/AuthButtons.tsx
import { useAuth } from '@melody-auth/react';
import { Button } from '@/components/ui/button';
import { Google, Github, UserPlus } from 'lucide-react';

export function AuthButtons({ callbackUrl = '/' }) {
  const { signIn, loading } = useAuth();

  const handleProviderSignIn = (provider: string) => {
    signIn(provider, { callbackUrl });
  };

  return (
    <div className="space-y-4">
      <Button
        onClick={() => handleProviderSignIn('google')}
        disabled={loading}
        className="w-full"
        variant="outline"
      >
        <Google className="w-4 h-4 me-2" />
        Continue with Google
      </Button>
      
      <Button
        onClick={() => handleProviderSignIn('github')}
        disabled={loading}
        className="w-full"
        variant="outline"
      >
        <Github className="w-4 h-4 me-2" />
        Continue with GitHub
      </Button>

      <Button
        onClick={() => handleProviderSignIn('credentials')}
        disabled={loading}
        className="w-full"
      >
        <UserPlus className="w-4 h-4 me-2" />
        Sign up with Email
      </Button>
    </div>
  );
}
```

**Testing Steps:**
1. Test authentication buttons
2. Verify session state updates
3. Check user data loading
4. Test sign-in/sign-out flows

**Rollback Strategy:**
- Keep useSession hooks as fallbacks
- Use feature flags for Melody hooks

### Step 3.3: Update Protected Route Handling

**Files to Create/Modify:**
- `src/middleware.ts` (replace NextAuth middleware)
- `src/components/ProtectedRoute.tsx`

**New Middleware Pattern:**
```typescript
// src/middleware.ts
import { withAuth } from '@melody-auth/next';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default withAuth({
  // Configure protected routes
  protected: [
    '/profile',
    '/games',
    '/game/*',
    '/api/protected/*'
  ],
  
  // Public routes
  public: [
    '/',
    '/auth/*',
    '/help',
    '/api/auth/*' // Keep NextAuth routes during migration
  ],

  // Custom logic for authentication
  onAuth: async (token, req) => {
    // Add custom authentication logic
    // Log authentication attempts
    // Add rate limiting
    
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = `/${req.headers.get('accept-language')?.split('-')[0] || 'en'}/auth/signin`;
      return NextResponse.redirect(url);
    }
  },

  // Session callback
  sessionCallback: async (session, token) => {
    // Add custom session data
    return {
      ...session,
      user: {
        ...session.user,
        // Add custom user properties
      }
    };
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (to keep existing NextAuth routes during migration)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
```

**Protected Route Component:**
```tsx
// src/components/ProtectedRoute.tsx
'use client';

import { useAuth } from '@melody-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  fallback?: ReactNode;
  redirectTo?: string;
}

export function ProtectedRoute({ 
  children, 
  fallback = <div>Loading...</div>,
  redirectTo = '/auth/signin'
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push(redirectTo);
    }
  }, [user, loading, router, redirectTo]);

  if (loading) {
    return fallback;
  }

  if (!user) {
    return null; // Will redirect
  }

  return <>{children}</>;
}
```

**Testing Steps:**
1. Test protected route access
2. Verify redirect behavior
3. Check middleware execution
4. Test session validation

**Rollback Strategy:**
- Keep NextAuth middleware backup
- Use environment flags for middleware selection

---

## Phase 4: Server Actions & API Migration

### Timeline: 6-8 hours

### Step 4.1: Update Server Actions

**Files to Modify:**
- All server actions using `auth()`
- Create new Melody server client utilities

**Before (NextAuth):**
```typescript
// src/app/actions/game.ts
'use server';

import { auth } from '@/lib/auth/config';
import { db } from '@/lib/db/config';
import { games } from '@/lib/db/schema';
import { redirect } from 'next/navigation';

export async function createGame(formData: FormData) {
  const session = await auth();
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const gameName = formData.get('name') as string;
  
  const [game] = await db
    .insert(games)
    .values({
      name: gameName,
      ownerId: session.user.id,
    })
    .returning();

  redirect(`/${session.user.language || 'en'}/game/${game.id}`);
}
```

**After (Melody):**
```typescript
// src/app/actions/game.ts
'use server';

import { getSession } from '@melody-auth/server';
import { db } from '@/lib/db/config';
import { games } from '@/lib/db/schema';
import { redirect } from 'next/navigation';

export async function createGame(formData: FormData) {
  const session = await getSession();
  
  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const gameName = formData.get('name') as string;
  
  const [game] = await db
    .insert(games)
    .values({
      name: gameName,
      ownerId: session.user.id,
    })
    .returning();

  redirect(`/${session.user.language || 'en'}/game/${game.id}`);
}
```

**Melody Server Client Utility:**
```typescript
// src/lib/auth/melody-server-client.ts
import { getSession } from '@melody-auth/server';
import { headers } from 'next/headers';

// Server-side session utility
export async function getCurrentSession() {
  const hdrs = headers();
  const request = new Request('http://localhost', {
    headers: hdrs,
  });
  
  return await getSession(request);
}

// User context utility
export async function requireAuth() {
  const session = await getCurrentSession();
  
  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }
  
  return session;
}

// Optional auth utility
export async function optionalAuth() {
  try {
    return await getCurrentSession();
  } catch {
    return null;
  }
}
```

**Server Action Migration Examples:**
```typescript
// src/app/actions/profile.ts
'use server';

import { requireAuth } from '@/lib/auth/melody-server-client';
import { db } from '@/lib/db/config';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function updateProfile(formData: FormData) {
  const session = await requireAuth();
  
  const updates = {
    name: formData.get('name') as string,
    // Add other profile fields
  };

  await db
    .update(users)
    .set(updates)
    .where(eq(users.id, session.user.id));

  return { success: true };
}

// src/app/actions/admin.ts
'use server';

import { requireAuth } from '@/lib/auth/melody-server-client';
import { db } from '@/lib/db/config';
import { games } from '@/lib/db/schema';

// Require admin role
export async function deleteGame(gameId: string) {
  const session = await requireAuth();
  
  // Check admin role (if implemented)
  if (session.user.role !== 'admin') {
    throw new Error('Admin access required');
  }

  await db
    .delete(games)
    .where(eq(games.id, gameId));

  return { success: true };
}
```

**Testing Steps:**
1. Test server action authentication
2. Verify session data access
3. Check error handling for unauthenticated requests
4. Test role-based access control

**Rollback Strategy:**
- Keep NextAuth imports as fallbacks
- Use try/catch for new authentication

### Step 4.2: Migrate Authentication Middleware

**Files to Modify:**
- `src/middleware.ts` (updated above)
- Create middleware utilities

**Testing Steps:**
1. Test route protection
2. Verify session validation
3. Check redirect behavior
4. Test edge cases

### Step 4.3: Update Protected API Routes

**Files to Modify:**
- `src/app/api/auth/[...nextauth]/route.ts` (keep for fallback)
- Create new API routes using Melody

**New API Routes:**
```typescript
// src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@melody-auth/server';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    return NextResponse.json({ user: session.user });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// src/app/api/auth/session/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@melody-auth/server';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession(req);
    
    if (!session) {
      return NextResponse.json({ valid: false });
    }
    
    return NextResponse.json({ 
      valid: true, 
      session: {
        user: session.user,
        expires: session.expires
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Session validation failed' }, { status: 500 });
  }
}
```

**Testing Steps:**
1. Test API route authentication
2. Verify session validation
3. Check error responses
4. Test concurrent requests

**Rollback Strategy:**
- Keep NextAuth API routes active
- Use different paths for Melody routes

---

## Phase 5: Testing & Deployment

### Timeline: 4-6 hours

### Step 5.1: Comprehensive Testing Strategy

**Files to Create/Modify:**
- `tests/auth/melody.test.ts`
- `tests/integration/auth-flow.test.ts`
- Update existing test configurations

**Authentication Flow Tests:**
```typescript
// tests/auth/melody.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MelodyProvider } from '@melody-auth/react';
import { Header } from '@/components/Header';

// Mock Melody Auth
jest.mock('@melody-auth/react', () => ({
  MelodyProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: jest.fn(),
}));

describe('Melody Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show sign in button when user is not authenticated', async () => {
    const mockUseAuth = require('@melody-auth/react').useAuth;
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    render(<Header />);
    
    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument();
    });
  });

  it('should show user menu when authenticated', async () => {
    const mockUseAuth = require('@melody-auth/react').useAuth;
    mockUseAuth.mockReturnValue({
      user: {
        id: '1',
        name: 'Test User',
        email: 'test@example.com',
      },
      loading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    render(<Header />);
    
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });
  });
});
```

**Integration Test:**
```typescript
// tests/integration/auth-flow.test.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should complete Google OAuth flow', async ({ page }) => {
    // Navigate to auth page
    await page.goto('/auth/signin');
    
    // Click Google sign in
    await page.click('[data-testid="google-signin"]');
    
    // Should redirect to Google OAuth
    await page.waitForURL('**/accounts.google.com**');
    
    // Mock successful OAuth (in test environment)
    // This would need proper mocking of the OAuth callback
    
    // Verify user is redirected back and authenticated
    await page.waitForURL('/');
    
    // Check for authenticated state
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should handle authentication errors', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Simulate OAuth error
    await page.goto('/auth/signin?error=oauth_error');
    
    // Should show error message
    await expect(page.locator('[data-testid="auth-error"]')).toBeVisible();
  });
});
```

**Testing Commands:**
```bash
# Run authentication tests
pnpm run test:unit -- auth
pnpm run test:e2e auth-flow

# Test specific scenarios
pnpm run test:e2e headed
pnpm run test:e2e:ui
```

### Step 5.2: Update Cloudflare Deployment

**Files to Modify:**
- `.vercelrc` (if using Vercel)
- `scripts/check-cloudflare-deployment.sh`
- `.github/workflows/deploy.yml`

**Deployment Configuration:**
```bash
# scripts/deploy-melody-auth.sh
#!/bin/bash

set -e

echo "🚀 Deploying Melody Auth to Cloudflare Workers..."

# Build and deploy Melody Worker
wrangler publish --config melody-worker.toml

echo "✅ Melody Auth Worker deployed successfully"

# Update environment variables on Cloudflare
echo "🔧 Updating environment variables..."

# Set secrets (these need to be set manually or via CI)
# wrangler secret put AUTH_JWT_SECRET --config melody-worker.toml
# wrangler secret put AUTH_COOKIE_SECRET --config melody-worker.toml

echo "🎉 Deployment complete!"
echo "Auth server URL: $(wrangler route list --config melody-worker.toml | head -1)"
```

**CI/CD Update:**
```yaml
# .github/workflows/deploy.yml (updated sections)
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Deploy Melody Auth Worker
        run: |
          npx wrangler publish --config melody-worker.toml
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Step 5.3: Performance & Edge Testing

**Files to Create:**
- `tests/performance/auth-performance.test.ts`
- `scripts/benchmark-auth.ts`

**Performance Test:**
```typescript
// tests/performance/auth-performance.test.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Performance', () => {
  test('should have fast authentication response times', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/auth/signin');
    
    // Test session loading time
    await page.waitForSelector('[data-testid="auth-buttons"]');
    const sessionLoadTime = Date.now() - startTime;
    
    expect(sessionLoadTime).toBeLessThan(1000); // Should load in under 1 second
    
    // Test sign-in redirect speed
    const signInStart = Date.now();
    await page.click('[data-testid="google-signin"]');
    await page.waitForURL('**/accounts.google.com**');
    const redirectTime = Date.now() - signInStart;
    
    expect(redirectTime).toBeLessThan(2000); // Should redirect in under 2 seconds
  });
});
```

**Benchmark Script:**
```typescript
// scripts/benchmark-auth.ts
import { performance } from 'perf_hooks';

async function benchmarkAuth() {
  console.log('🏁 Starting authentication benchmarks...');
  
  // Benchmark session creation
  const sessionStart = performance.now();
  // Simulate session creation
  const sessionTime = performance.now() - sessionStart;
  
  console.log(`Session creation: ${sessionTime.toFixed(2)}ms`);
  
  // Benchmark user lookup
  const lookupStart = performance.now();
  // Simulate user lookup
  const lookupTime = performance.now() - lookupStart;
  
  console.log(`User lookup: ${lookupTime.toFixed(2)}ms`);
  
  // Benchmark OAuth flow
  const oauthStart = performance.now();
  // Simulate OAuth flow
  const oauthTime = performance.now() - oauthStart;
  
  console.log(`OAuth flow: ${oauthTime.toFixed(2)}ms`);
}

benchmarkAuth().catch(console.error);
```

### Step 5.4: Rollback Strategy Implementation

**Files to Create:**
- `scripts/rollback-auth.sh`
- `scripts/switch-auth-provider.ts`

**Rollback Script:**
```bash
#!/bin/bash
# scripts/rollback-auth.sh

set -e

echo "🔄 Rolling back to NextAuth..."

# Switch environment variables back
if [ -f .env.backup ]; then
  cp .env.backup .env.local
  echo "✅ Restored environment variables"
fi

# Restore NextAuth configuration
if [ -f src/lib/auth/config.backup.ts ]; then
  cp src/lib/auth/config.backup.ts src/lib/auth/config.ts
  echo "✅ Restored NextAuth configuration"
fi

# Reinstall NextAuth dependencies
pnpm remove @melody-auth/react @melody-auth/next @melody-auth/server
pnpm install next-auth@5.0.0-beta.30

# Clear build cache
rm -rf .next
rm -rf node_modules/.cache

echo "🎉 Rollback complete! Run 'pnpm run dev' to restart."
```

**Environment Switcher:**
```typescript
// scripts/switch-auth-provider.ts
import fs from 'fs';
import path from 'path';

type AuthProvider = 'nextauth' | 'melody';

function switchAuthProvider(provider: AuthProvider) {
  const configPath = path.join(process.cwd(), 'src/lib/auth/config.ts');
  
  if (provider === 'nextauth') {
    // Restore NextAuth configuration
    const nextAuthConfig = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/auth/config.backup.ts'),
      'utf8'
    );
    fs.writeFileSync(configPath, nextAuthConfig);
    console.log('✅ Switched to NextAuth');
  } else {
    // Switch to Melody configuration
    const melodyConfig = `import { MelodyAuth } from '@melody-auth/server';\nexport const auth = MelodyAuth(/* config */);`;
    fs.writeFileSync(configPath, melodyConfig);
    console.log('✅ Switched to Melody Auth');
  }
}

// CLI usage
const provider = process.argv[2] as AuthProvider;
if (!provider || !['nextauth', 'melody'].includes(provider)) {
  console.error('Usage: tsx scripts/switch-auth-provider.ts <nextauth|melody>');
  process.exit(1);
}

switchAuthProvider(provider);
```

---

## Migration Success Criteria

### Phase Completion Checklists

**Phase 1 - Environment Setup ✓**
- [ ] Dependencies updated and tested
- [ ] Environment variables migrated
- [ ] Melody configuration files created
- [ ] No build errors

**Phase 2 - Core Authentication ✓**
- [ ] Melody Worker deployed to Cloudflare
- [ ] D1 database schema created
- [ ] OAuth providers configured
- [ ] Session management working

**Phase 3 - Client Migration ✓**
- [ ] MelodyProvider integrated
- [ ] Components updated to use Melody hooks
- [ ] Protected routes functioning
- [ ] Authentication flows tested

**Phase 4 - Server Integration ✓**
- [ ] Server actions updated
- [ ] API routes migrated
- [ ] Middleware working
- [ ] Error handling implemented

**Phase 5 - Testing & Deployment ✓**
- [ ] All tests passing
- [ ] Performance benchmarks met
- [ ] Deployment pipeline updated
- [ ] Rollback strategy tested

### Performance Targets

- **Session Load Time**: < 100ms
- **OAuth Redirect Time**: < 2s
- **API Response Time**: < 500ms
- **Database Query Time**: < 100ms
- **Test Suite Execution**: < 5 minutes

### Security Checklist

- [ ] JWT secrets properly configured
- [ ] CORS settings validated
- [ ] Rate limiting implemented
- [ ] OAuth flows secured
- [ ] Session validation working
- [ ] Edge deployment hardened

---

## Post-Migration Optimization

### Immediate Improvements

1. **Edge Caching**: Implement Cloudflare edge caching for static assets
2. **Performance Monitoring**: Add real-time performance tracking
3. **Error Tracking**: Implement comprehensive error monitoring
4. **Analytics**: Track authentication success rates and performance

### Future Enhancements

1. **Multi-Factor Authentication**: Add TOTP support
2. **Social Login**: Add additional OAuth providers
3. **Admin Panel**: Build user management interface
4. **Audit Logging**: Track all authentication events
5. **Session Analytics**: Monitor session usage patterns

---

## Troubleshooting Guide

### Common Migration Issues

**Issue: Environment Variables Not Loading**
```bash
# Solution: Check environment variable names
# Ensure AUTH_ prefix is used instead of NEXTAUTH_
echo $AUTH_SERVER_URL
echo $AUTH_JWT_SECRET
```

**Issue: OAuth Redirect Failures**
```typescript
// Solution: Update redirect URIs in OAuth provider console
// Melody callback URLs:
// https://your-worker.workers.dev/auth/callback/google
// https://your-worker.workers.dev/auth/callback/github
```

**Issue: Session Not Persisting**
```typescript
// Solution: Check KV storage configuration
// Verify KV namespace binding in wrangler.toml
```

**Issue: Build Errors with Melody Dependencies**
```bash
# Solution: Clear cache and reinstall
rm -rf node_modules package-lock.json
pnpm install
pnpm run check:tsc
```

**Issue: Database Migration Failures**
```sql
-- Solution: Check D1 database permissions
-- Ensure proper database bindings in wrangler.toml
-- Verify database schema compatibility
```

---

## Risk Assessment & Mitigation

### High-Risk Items

1. **Data Loss During Migration**
   - **Risk**: User sessions or data lost during transition
   - **Mitigation**: Backup database, gradual rollout with parallel systems
   - **Rollback**: Immediate switch back to NextAuth using provided scripts

2. **OAuth Provider Configuration**
   - **Risk**: Redirect URIs mismatch causing authentication failures
   - **Mitigation**: Update provider settings before deployment
   - **Rollback**: Keep NextAuth configuration active as fallback

3. **Performance Degradation**
   - **Risk**: New system performs worse than current setup
   - **Mitigation**: Performance testing and monitoring
   - **Rollback**: Switch back if benchmarks not met

### Medium-Risk Items

1. **Integration Compatibility**
   - **Risk**: Existing components break with new authentication patterns
   - **Mitigation**: Incremental component migration
   - **Rollback**: Keep NextAuth components as fallbacks

2. **Edge Deployment Issues**
   - **Risk**: Cloudflare Workers deployment problems
   - **Mitigation**: Test deployment thoroughly
   - **Rollback**: Use local development setup as backup

### Low-Risk Items

1. **UI/UX Changes**
   - **Risk**: User interface behaves differently
   - **Mitigation**: Comprehensive testing with real users
   - **Rollback**: CSS classes and components can be reverted quickly

2. **Development Workflow**
   - **Risk**: Developer experience degraded during migration
   - **Mitigation**: Provide clear documentation and tools
   - **Rollback**: Developers can switch back to NextAuth easily

---

## Resource Requirements

### Development Team
- **1 Senior Developer**: Full-time for 2 weeks
- **1 DevOps Engineer**: Part-time for 1 week  
- **1 QA Engineer**: Part-time for 1 week

### Infrastructure
- **Cloudflare Workers**: $0/month (within free tier)
- **D1 Database**: $0/month (within free tier)
- **KV Storage**: $0/month (within free tier)

### External Services
- **OAuth Provider Updates**: No cost (manual configuration)
- **Monitoring Tools**: Optional, $10-50/month

### Total Estimated Cost
- **Development Time**: ~$8,000-12,000
- **Infrastructure**: $0-50/month
- **Total Migration**: $8,000-12,000 one-time

---

## Conclusion

This migration plan provides a comprehensive blueprint for transitioning from NextAuth to Melody Auth while maintaining system stability and user experience. The phased approach allows for careful testing and rollback capabilities at each stage.

**Key Success Factors:**
- Thorough testing at each phase
- Gradual rollout with feature flags
- Robust rollback strategy
- Performance monitoring
- User feedback integration

**Expected Benefits:**
- **Performance**: 50-70% improvement in authentication speed
- **Scalability**: Automatic scaling on Cloudflare edge network  
- **Developer Experience**: Modern SDK with better TypeScript support
- **Cost**: Reduced infrastructure costs with serverless deployment
- **Security**: Enhanced OAuth security with PKCE implementation

The migration should be approached methodically, with thorough testing at each phase to ensure a smooth transition and optimal user experience.
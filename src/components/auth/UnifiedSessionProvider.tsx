'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authFeatureFlags, isMelodyEnabled } from '@/lib/auth/config';

// Unified Session Context Type
export interface UnifiedSession {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    provider?: 'nextauth' | 'melody';
  };
  expires?: string;
  provider?: 'nextauth' | 'melody';
}

export interface UnifiedSessionContextType {
  session: UnifiedSession | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  signIn: (provider?: string, options?: any) => Promise<void>;
  signOut: (options?: any) => Promise<void>;
  refreshSession: () => Promise<void>;
}

// Create context
const UnifiedSessionContext = createContext<UnifiedSessionContextType | undefined>(undefined);

// Melody Session Hook
function useMelodySession() {
  const [session, setSession] = useState<UnifiedSession | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/melody/session', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authenticated && data.session) {
          setSession({
            ...data.session,
            provider: 'melody',
          });
          setStatus('authenticated');
        } else {
          setSession(null);
          setStatus('unauthenticated');
        }
      } else {
        setSession(null);
        setStatus('unauthenticated');
      }
    } catch (error) {
      console.error('Melody session fetch error:', error);
      setSession(null);
      setStatus('unauthenticated');
    }
  }, []);

  const signIn = useCallback(async (provider?: string, options?: any) => {
    try {
      // If no provider specified, redirect to sign-in page
      if (!provider) {
        window.location.href = options?.callbackUrl ? `/auth/signin?callbackUrl=${encodeURIComponent(options.callbackUrl)}` : '/auth/signin';
        return;
      }

      const response = await fetch('/api/auth/melody', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: provider,
          redirect: options?.callbackUrl || '/',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        }
      } else {
        throw new Error('Sign in failed');
      }
    } catch (error) {
      console.error('Melody sign in error:', error);
      throw error;
    }
  }, []);

  const signOut = useCallback(async (options?: any) => {
    try {
      await fetch('/api/auth/melody', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      setSession(null);
      setStatus('unauthenticated');
      
      if (options?.callbackUrl) {
        window.location.href = options.callbackUrl;
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Melody sign out error:', error);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/melody/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        await fetchSession();
      }
    } catch (error) {
      console.error('Melody session refresh error:', error);
    }
  }, [fetchSession]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    session,
    status,
    signIn,
    signOut,
    refreshSession,
  };
}

// NextAuth removed - only Melody is supported

// Main Unified Session Provider (Melody-only)
export function UnifiedSessionProvider({ children }: { children: React.ReactNode }) {
  // Always use Melody - NextAuth removed
  const melodySession = useMelodySession();
  const sessionData = melodySession;

  // Context value
  const contextValue: UnifiedSessionContextType = {
    session: sessionData.session,
    status: sessionData.status,
    signIn: sessionData.signIn,
    signOut: sessionData.signOut,
    refreshSession: sessionData.refreshSession,
  };

  // Always use our unified context provider
  return (
    <UnifiedSessionContext.Provider value={contextValue}>
      {children}
    </UnifiedSessionContext.Provider>
  );
}

// Hook to use unified session
export function useUnifiedSession(): UnifiedSessionContextType {
  const context = useContext(UnifiedSessionContext);
  if (context === undefined) {
    throw new Error('useUnifiedSession must be used within a UnifiedSessionProvider');
  }
  return context;
}

export function useSession() {
  const { session, status } = useUnifiedSession();
  return { data: session, status };
}
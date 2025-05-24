'use client';

import { signIn, getProviders } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { ClientSafeProvider } from 'next-auth/react';

export function SignInForm() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const setupProviders = async () => {
      const res = await getProviders();
      setProviders(res);
    };
    setupProviders();
  }, []);

  const handleSignIn = async (providerId: string) => {
    setLoading(true);
    try {
      await signIn(providerId, { callbackUrl: '/' });
    } catch (error) {
      console.error('Sign in error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!providers) {
    return (
      <div className="bg-card border rounded-lg p-6">
        <div className="text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-card border rounded-lg p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Sign In</h2>
        <p className="text-muted-foreground text-sm">
          Choose your preferred sign-in method to continue
        </p>
      </div>
      
      <div className="space-y-3">
        {Object.values(providers).map((provider: ClientSafeProvider) => (
          <Button
            key={provider.name}
            variant="outline"
            className="w-full"
            onClick={() => handleSignIn(provider.id)}
            disabled={loading}
          >
            {provider.id === 'google' && '🌐 '}
            {provider.id === 'github' && '🐙 '}
            Continue with {provider.name}
          </Button>
        ))}
      </div>
    </div>
  );
} 
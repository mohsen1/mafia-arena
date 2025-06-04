'use client';

import { signIn, getProviders } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Chrome, Github, Eye, EyeOff, LogIn } from 'lucide-react';
import { FcGoogle } from 'react-icons/fc';
import Link from 'next/link';
import type { ClientSafeProvider } from 'next-auth/react';
import type { LanguageCode } from '@/lib/i18n/settings';

export function SignInForm() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);
  const [loading, setLoading] = useState(false);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({
    email: '',
    password: '',
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const errorParam = searchParams.get('error');

  // Extract current language from pathname
  const getCurrentLanguage = (): LanguageCode => {
    const segments = pathname.split('/').filter(Boolean);
    return (segments[0] as LanguageCode) || 'en';
  };

  const currentLang = getCurrentLanguage();

  useEffect(() => {
    const setupProviders = async () => {
      const res = await getProviders();
      setProviders(res);
    };
    setupProviders();
  }, []);

  useEffect(() => {
    if (errorParam) {
      switch (errorParam) {
        case 'CredentialsSignin':
          setError(t('signIn.invalidCredentials'));
          break;
        case 'OAuthSignin':
        case 'OAuthCallback':
        case 'OAuthCreateAccount':
          setError(t('signIn.oauthError'));
          break;
        default:
          setError(t('signIn.generalError'));
      }
    }
  }, [errorParam, t]);

  const handleOAuthSignIn = async (providerId: string) => {
    setLoading(true);
    try {
      await signIn(providerId, { callbackUrl: `/${currentLang}` });
    } catch (error) {
      console.error('OAuth sign in error:', error);
      setError(t('signIn.oauthError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredentialsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: credentials.email,
        password: credentials.password,
        redirect: false,
      });

      if (result?.error) {
        setError(t('signIn.invalidCredentials'));
      } else if (result?.ok) {
        router.push(`/${currentLang}`);
      }
    } catch (error) {
      console.error('Credentials sign in error:', error);
      setError(t('signIn.unexpectedError'));
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'google':
        return <FcGoogle className="w-4 h-4 me-2" />;
      case 'github':
        return <Github className="w-4 h-4 me-2" />;
      default:
        return <Chrome className="w-4 h-4 me-2" />;
    }
  };

  if (!providers) {
    return (
      <div className="bg-card border rounded-lg p-6">
        <div className="text-center text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  // Filter out credentials provider from OAuth providers list
  const oauthProviders = Object.values(providers).filter(
    provider => provider.id !== 'credentials'
  );

  return (
    <div className="bg-card border rounded-lg p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{t('signIn.title')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('signIn.choosePreferredSignInMethod')}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Email/Password Form */}
      <form onSubmit={handleCredentialsSignIn} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('signIn.email')}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={credentials.email}
            onChange={handleInputChange}
            placeholder={t('signIn.enterYourEmail')}
            required
            disabled={credentialsLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t('signIn.password')}</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={credentials.password}
              onChange={handleInputChange}
              placeholder={t('signIn.enterYourPassword')}
              required
              disabled={credentialsLoading}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
              disabled={credentialsLoading}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div className="text-right">
            <Link
              href={`/${currentLang}/auth/forgot`}
              className="text-sm text-primary hover:underline"
            >
              {t('forgotPassword.title')}
            </Link>
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={credentialsLoading}>
          {credentialsLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin me-2" />
              {t('signIn.signingIn')}
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4 me-2" />
              {t('signIn.signInWithEmail')}
            </>
          )}
        </Button>
      </form>

      {/* Divider */}
      {oauthProviders.length > 0 && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">
              {t('signIn.orContinueWith')}
            </span>
          </div>
        </div>
      )}

      {/* OAuth Providers */}
      {oauthProviders.length > 0 && (
        <div className="space-y-3">
          {oauthProviders.map((provider: ClientSafeProvider) => (
            <Button
              key={provider.name}
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleOAuthSignIn(provider.id)}
              disabled={loading || credentialsLoading}
            >
              {getProviderIcon(provider.id)}
              {t('signIn.continueWith', { provider: provider.name })}
            </Button>
          ))}
        </div>
      )}

      {/* Sign Up Link */}
      <div className="text-center text-sm">
        <span className="text-muted-foreground">{t('signIn.dontHaveAnAccount')}</span>
        <Link
          href={`/${currentLang}/auth/signup`}
          className="text-primary hover:underline"
        >
          {t('signIn.signUp')}
        </Link>
      </div>
    </div>
  );
} 
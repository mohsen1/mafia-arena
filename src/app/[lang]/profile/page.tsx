'use client';

import { use } from 'react';
import { useSession } from 'next-auth/react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import Link from 'next/link';
import {
  User,
  Mail,
  Calendar,
  Shield,
  Key,
  GamepadIcon,
  Trophy,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserApiKeyManager } from '@/components/UserApiKeyManager';
import { UserStatsDisplay } from '@/components/UserStatsDisplay';
import type { LanguageCode } from '@/lib/i18n/settings';

interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

function LoadingView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <div className="w-12 h-12 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">
            {t('profile.loading')}
          </p>
        </div>
      </main>
      <Footer currentLang={lang} />
    </div>
  );
}

function UnauthenticatedView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh] space-y-8">
        <div className="text-center max-w-2xl">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-foreground">
              {t('profile.signInRequired')}
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              {t('profile.signInRequiredDescription')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link href={`/${lang}/auth/signin`}>{t('common.signIn')}</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={`/${lang}`}>{t('common.backToHome')}</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer currentLang={lang} />
    </div>
  );
}

function ProfileContent({ lang }: { lang: LanguageCode }) {
  const { data: session } = useSession();
  const { t } = useTranslation();

  if (!session?.user) {
    return <UnauthenticatedView lang={lang} />;
  }

  const user = session.user;
  const joinDate = new Date(session.expires).toLocaleDateString();

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Profile Header */}
        <div className="mt-8 text-center">
          <div className="mb-6">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || 'User'}
                width={120}
                height={120}
                className="w-32 h-32 rounded-full border-4 border-primary/20 mx-auto shadow-lg"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto shadow-lg">
                <User className="w-16 h-16 text-primary" />
              </div>
            )}
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {user.name || t('profile.anonymousUser')}
          </h1>
          <p className="text-muted-foreground">{user.email}</p>
          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge
              variant="default"
              className="bg-primary/10 text-primary border-primary/20"
            >
              <Calendar className="w-3 h-3 me-1" />
              {t('profile.memberSince')} {joinDate}
            </Badge>
            {user.email === 'dev@werewolf-ai.com' && (
              <Badge
                variant="secondary"
                className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"
              >
                {t('profile.developmentAccount')}
              </Badge>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button
            asChild
            variant="default"
            size="lg"
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            <Link href={`/${lang}/new`}>
              <GamepadIcon className="w-5 h-5 me-2" />
              {t('profile.startNewGame')}
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-primary/20 hover:bg-primary/10"
          >
            <Link href={`/${lang}/games`}>
              <Trophy className="w-5 h-5 me-2" />
              {t('profile.viewMyGames')}
            </Link>
          </Button>
        </div>

        {/* Game Statistics */}
        <Card className="border-primary/10 shadow-md">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              {t('profile.gameStatistics', 'Game Statistics')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <UserStatsDisplay />
          </CardContent>
        </Card>

        {/* API Key Management */}
        <Card className="border-primary/10 shadow-md">
          <CardHeader className="bg-gradient-to-r from-blue-500/5 to-blue-500/10">
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-500" />
              {t('profile.apiKeyManagement', 'API Key Management')}
            </CardTitle>
            <CardDescription>
              {t(
                'profile.apiKeyManagementDescription',
                'Manage your AI provider API keys for enhanced game experiences'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <UserApiKeyManager />
          </CardContent>
        </Card>

        {/* Account Security */}
        <Card className="border-primary/10 shadow-md">
          <CardHeader className="bg-gradient-to-r from-green-500/5 to-green-500/10">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              {t('profile.security')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-2">
              {user.image?.includes('googleusercontent.com') && (
                <Badge
                  variant="outline"
                  className="border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400"
                >
                  <svg
                    className="w-4 h-4 me-2"
                    viewBox="0 0 24 24"
                    aria-label="Google"
                  >
                    <title>Google</title>
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  {t('profile.googleAccount')}
                </Badge>
              )}

              {user.image?.includes('githubusercontent.com') && (
                <Badge
                  variant="outline"
                  className="border-gray-500/20 bg-gray-500/10 text-gray-700 dark:text-gray-400"
                >
                  <svg
                    className="w-4 h-4 me-2"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-label="GitHub"
                  >
                    <title>GitHub</title>
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  {t('profile.githubAccount')}
                </Badge>
              )}

              {user.email === 'dev@werewolf-ai.com' && (
                <Badge
                  variant="outline"
                  className="border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400"
                >
                  <Mail className="w-4 h-4 me-2" />
                  {t('profile.emailPassword')}
                </Badge>
              )}

              <Badge
                variant="outline"
                className="border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
              >
                <Shield className="w-3 h-3 me-1" />
                {t('profile.verified')}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </main>
      <Footer currentLang={lang} />
    </div>
  );
}

export default function ProfilePage({ params: paramsPromise }: PageProps) {
  const params = use(paramsPromise);
  const { lang } = params;
  const { status } = useSession();

  if (status === 'loading') {
    return <LoadingView lang={lang} />;
  }

  return <ProfileContent lang={lang} />;
}

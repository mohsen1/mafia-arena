import { getTranslation } from '@/lib/i18n/server';
import type { LanguageCode } from '@/lib/i18n/settings';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface Props {
  params: Promise<{
    lang: LanguageCode;
  }>;
  searchParams: Promise<{
    error?: string;
  }>;
}

export default async function AuthErrorPage({ params, searchParams }: Props) {
  const { lang } = await params;
  const { error } = await searchParams;
  const { t } = await getTranslation(lang);

  // Map error codes to user-friendly messages
  const getErrorMessage = (errorCode?: string) => {
    switch (errorCode) {
      case 'Configuration':
        return t('auth.configurationError');
      case 'AccessDenied':
        return t('auth.accessDeniedError');
      case 'Verification':
        return t('auth.verificationError');
      default:
        return t('auth.unknownError');
    }
  };

  const errorMessage = getErrorMessage(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-destructive">
            {t('auth.authenticationError')}
          </h1>
          <p className="text-muted-foreground">{errorMessage}</p>
        </div>

        <div className="bg-card border rounded-lg p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Error Code: {error || 'Unknown'}
          </p>

          <div className="space-y-2">
            <Button asChild className="w-full">
              <Link href={`/${lang}/auth/signin`}>{t('auth.tryAgain')}</Link>
            </Button>

            <Button variant="outline" asChild className="w-full">
              <Link href={`/${lang}`}>{t('auth.goHome')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

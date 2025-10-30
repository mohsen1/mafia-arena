import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/auth/SignInForm';
import { getTranslation } from '@/lib/i18n/server';
import type { LanguageCode } from '@/lib/i18n/settings';

interface Props {
  params: Promise<{
    lang: LanguageCode;
  }>;
}

export default async function SignInPage({ params }: Props) {
  const { lang } = await params;
  const session = await auth();

  if (session) {
    redirect(`/${lang}`);
  }

  const { t } = await getTranslation(lang);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">{t('appName')}</h1>
          <p className="text-muted-foreground mt-2">
            {t('auth.authRequiredDescription')}
          </p>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}

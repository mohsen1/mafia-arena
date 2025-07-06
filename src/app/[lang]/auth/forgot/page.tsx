'use client';

import { useState, use } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { requestPasswordReset } from '@/app/actions/password-reset.actions';
import type { LanguageCode } from '@/lib/i18n/settings';
import { useRouter } from 'next/navigation';

interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

export default function ForgotPasswordPage({
  params: paramsPromise,
}: PageProps) {
  const params = use(paramsPromise);
  const { lang } = params;
  const { t } = useTranslation();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(false);

    try {
      await requestPasswordReset(email);
      setSuccess(true);
    } catch {
      setError(t('forgotPassword.failedToSend'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('forgotPassword.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>
                {t('forgotPassword.checkEmail')}
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('signIn.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {t('forgotPassword.submit')}
            </Button>
          </form>
          <Button
            variant="link"
            onClick={() => router.push(`/${lang}/auth/signin`)}
          >
            {t('signIn.title')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { resetPassword } from '@/app/actions/password-reset.actions';
import type { LanguageCode } from '@/lib/i18n/settings';

interface PageProps {
  params: Promise<{ lang: LanguageCode; token: string }>;
}

export default function ResetPasswordPage({
  params: paramsPromise,
}: PageProps) {
  const params = use(paramsPromise);
  const { lang, token } = params;
  const { t } = useTranslation();
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess(false);

    if (password !== confirm) {
      setError(t('signUp.passwordsNoMatch'));
      setIsLoading(false);
      return;
    }

    const result = await resetPassword(token, password);
    if (!result.success) {
      setError(result.error || t('resetPassword.failedToReset'));
    } else {
      setSuccess(true);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('resetPassword.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert>
              <AlertDescription>{t('resetPassword.success')}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t('signIn.password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t('signUp.confirmPassword')}</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {t('resetPassword.submit')}
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

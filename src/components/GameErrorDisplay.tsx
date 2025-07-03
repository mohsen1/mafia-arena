'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GameErrorDisplayProps {
  error: string;
  onRetry?: () => void;
  className?: string;
}

export function GameErrorDisplay({
  error,
  onRetry,
  className,
}: GameErrorDisplayProps) {
  const { t } = useTranslation();

  // Determine if this is an API-related error
  const isApiError =
    error.toLowerCase().includes('api') ||
    error.toLowerCase().includes('failed to call') ||
    error.toLowerCase().includes('model') ||
    error.toLowerCase().includes('groq') ||
    error.toLowerCase().includes('openai') ||
    error.toLowerCase().includes('anthropic') ||
    error.toLowerCase().includes('gemini');

  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        <div className="font-semibold mb-1">
          {isApiError
            ? t('errors.apiError', 'API Error')
            : t('errors.gameError', 'Game Error')}
        </div>
        <p className="mb-3">{error}</p>
        {isApiError && (
          <p className="text-sm opacity-90 mb-3">
            {t(
              'errors.apiErrorHelp',
              'This may be due to an invalid API key, rate limiting, or service unavailability. Please check your API keys in your profile.'
            )}
          </p>
        )}
        {onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="mt-2"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('errors.retry', 'Try Again')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

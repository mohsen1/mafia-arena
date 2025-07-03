'use client';

import { AlertCircle, RefreshCw, Home, MessageSquare } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

interface GameErrorDisplayProps {
  error: string | { message: string; type?: string };
  onRetry?: () => void;
  gameId?: string;
  lang?: string;
}

export function GameErrorDisplay({
  error,
  onRetry,
  gameId,
  lang = 'en',
}: GameErrorDisplayProps) {
  const { t } = useTranslation();

  // Parse error details
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorType =
    typeof error === 'object' && error.type ? error.type : 'UNKNOWN_ERROR';

  // Get user-friendly error title and description based on error type
  const getErrorDetails = () => {
    switch (errorType) {
      case 'AUTHENTICATION_ERROR':
        return {
          title: t('error.authenticationTitle', 'Authentication Error'),
          description: t(
            'error.authenticationDesc',
            'Your API key is invalid or missing. Please check your settings.'
          ),
          showSettings: true,
        };
      case 'RATE_LIMIT_ERROR':
        return {
          title: t('error.rateLimitTitle', 'Rate Limit Exceeded'),
          description: t(
            'error.rateLimitDesc',
            'Too many requests. Please wait a moment and try again.'
          ),
          showRetry: true,
        };
      case 'TIMEOUT_ERROR':
        return {
          title: t('error.timeoutTitle', 'Request Timeout'),
          description: t(
            'error.timeoutDesc',
            'The request took too long. The AI service may be busy.'
          ),
          showRetry: true,
        };
      case 'CONNECTION_ERROR':
        return {
          title: t('error.connectionTitle', 'Connection Error'),
          description: t(
            'error.connectionDesc',
            'Cannot connect to the AI service. Check your internet connection.'
          ),
          showRetry: true,
        };
      case 'MODEL_ERROR':
        return {
          title: t('error.modelTitle', 'Invalid Model'),
          description: t(
            'error.modelDesc',
            'The selected AI model is not available. Try a different model.'
          ),
          showSettings: true,
        };
      case 'CONTEXT_LENGTH_ERROR':
        return {
          title: t('error.contextLengthTitle', 'Message Too Long'),
          description: t(
            'error.contextLengthDesc',
            'The conversation is too long. Start a new game to continue.'
          ),
          showNewGame: true,
        };
      case 'SAFETY_ERROR':
        return {
          title: t('error.safetyTitle', 'Content Blocked'),
          description: t(
            'error.safetyDesc',
            'The AI response was blocked by safety filters.'
          ),
          showRetry: true,
        };
      default:
        return {
          title: t('error.unknownTitle', 'Something went wrong'),
          description:
            errorMessage ||
            t(
              'error.unknownDesc',
              'An unexpected error occurred. Please try again.'
            ),
          showRetry: true,
        };
    }
  };

  const { title, description, showRetry, showSettings, showNewGame } =
    getErrorDetails();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-semibold mb-1">
              {t('error.details', 'Error Details')}
            </div>
            <div className="mt-2 font-mono text-sm">{errorMessage}</div>
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          {showRetry && onRetry && (
            <Button onClick={onRetry} variant="default">
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('error.retry', 'Try Again')}
            </Button>
          )}

          {showSettings && (
            <Link href={`/${lang}/profile`}>
              <Button variant="outline">
                {t('error.goToSettings', 'Go to Settings')}
              </Button>
            </Link>
          )}

          {showNewGame && (
            <Link href={`/${lang}/new`}>
              <Button variant="outline">
                {t('error.startNewGame', 'Start New Game')}
              </Button>
            </Link>
          )}

          <Link href={`/${lang}`}>
            <Button variant="ghost">
              <Home className="mr-2 h-4 w-4" />
              {t('error.goHome', 'Go Home')}
            </Button>
          </Link>

          {gameId && (
            <Link href={`/${lang}/help`}>
              <Button variant="ghost">
                <MessageSquare className="mr-2 h-4 w-4" />
                {t('error.getHelp', 'Get Help')}
              </Button>
            </Link>
          )}
        </div>

        {errorType === 'RATE_LIMIT_ERROR' && (
          <Alert className="mt-4">
            <AlertDescription>
              {t(
                'error.rateLimitTip',
                'Tip: You can add your own API keys in your profile to avoid rate limits.'
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

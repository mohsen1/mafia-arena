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
import { ErrorCode } from '@/lib/errors/GameError';

interface GameErrorDisplayProps {
  error:
    | string
    | {
        message: string;
        userMessage?: string;
        code?: ErrorCode | string;
        type?: string;
        retryable?: boolean;
        context?: Record<string, unknown>;
      };
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
  const errorMessage =
    typeof error === 'string' ? error : error.userMessage || error.message;
  const technicalMessage = typeof error === 'string' ? error : error.message;
  const errorCode =
    typeof error === 'object' && error.code
      ? error.code
      : typeof error === 'object' && error.type
        ? error.type
        : 'UNKNOWN_ERROR';
  const isRetryable =
    typeof error === 'object' && error.retryable !== undefined
      ? error.retryable
      : true; // Default to retryable

  // Get user-friendly error title and description based on error type
  const getErrorDetails = () => {
    switch (errorCode) {
      case 'AUTHENTICATION_ERROR':
      case ErrorCode.AI_AUTHENTICATION:
        return {
          title: t('error.authenticationTitle', 'Authentication Error'),
          description:
            errorMessage ||
            t(
              'error.authenticationDesc',
              'Your API key is invalid or missing. Please check your settings.'
            ),
          showSettings: true,
          showRetry: false,
        };
      case 'RATE_LIMIT_ERROR':
      case ErrorCode.AI_RATE_LIMIT:
        return {
          title: t('error.rateLimitTitle', 'Rate Limit Exceeded'),
          description:
            errorMessage ||
            t(
              'error.rateLimitDesc',
              'Too many requests. Please wait a moment and try again.'
            ),
          showRetry: isRetryable,
        };
      case 'TIMEOUT_ERROR':
      case ErrorCode.AI_TIMEOUT:
        return {
          title: t('error.timeoutTitle', 'Request Timeout'),
          description:
            errorMessage ||
            t(
              'error.timeoutDesc',
              'The request took too long. The AI service may be busy.'
            ),
          showRetry: isRetryable,
        };
      case 'CONNECTION_ERROR':
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.AI_CONNECTION:
        return {
          title: t('error.connectionTitle', 'Connection Error'),
          description:
            errorMessage ||
            t(
              'error.connectionDesc',
              'Cannot connect to the AI service. Check your internet connection.'
            ),
          showRetry: isRetryable,
        };
      case 'MODEL_ERROR':
      case ErrorCode.AI_MODEL_NOT_FOUND:
        return {
          title: t('error.modelTitle', 'Invalid Model'),
          description:
            errorMessage ||
            t(
              'error.modelDesc',
              'The selected AI model is not available. Try a different model.'
            ),
          showSettings: true,
          showRetry: false,
        };
      case 'CONTEXT_LENGTH_ERROR':
      case ErrorCode.AI_CONTEXT_LENGTH:
        return {
          title: t('error.contextLengthTitle', 'Message Too Long'),
          description:
            errorMessage ||
            t(
              'error.contextLengthDesc',
              'The conversation is too long. Start a new game to continue.'
            ),
          showNewGame: true,
          showRetry: false,
        };
      case 'SAFETY_ERROR':
      case ErrorCode.AI_SAFETY_FILTER:
        return {
          title: t('error.safetyTitle', 'Content Blocked'),
          description:
            errorMessage ||
            t(
              'error.safetyDesc',
              'The AI response was blocked by safety filters.'
            ),
          showRetry: isRetryable,
        };
      case ErrorCode.GAME_NOT_FOUND:
        return {
          title: t('error.gameNotFoundTitle', 'Game Not Found'),
          description:
            errorMessage ||
            t(
              'error.gameNotFoundDesc',
              'This game could not be found. It may have been deleted.'
            ),
          showNewGame: true,
          showRetry: false,
        };
      case ErrorCode.CHARACTER_GEN_FAILED:
        return {
          title: t('error.characterGenTitle', 'Character Generation Failed'),
          description:
            errorMessage ||
            t(
              'error.characterGenDesc',
              'Failed to generate characters. Please try again.'
            ),
          showRetry: isRetryable,
        };
      case ErrorCode.DB_CONNECTION_FAILED:
      case ErrorCode.DB_QUERY_FAILED:
        return {
          title: t('error.databaseTitle', 'Database Error'),
          description:
            errorMessage ||
            t(
              'error.databaseDesc',
              'A database error occurred. Please try again later.'
            ),
          showRetry: isRetryable,
        };
      case ErrorCode.AUTH_UNAUTHORIZED:
        return {
          title: t('error.unauthorizedTitle', 'Unauthorized'),
          description:
            errorMessage ||
            t(
              'error.unauthorizedDesc',
              'You are not authorized to perform this action.'
            ),
          showRetry: false,
        };
      case ErrorCode.VALIDATION_FAILED:
      case ErrorCode.INVALID_INPUT:
        return {
          title: t('error.validationTitle', 'Invalid Input'),
          description:
            errorMessage ||
            t('error.validationDesc', 'Please check your input and try again.'),
          showRetry: false,
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
            <div className="mt-2 font-mono text-sm">{technicalMessage}</div>
            {process.env.NODE_ENV === 'development' &&
              typeof error === 'object' &&
              error.context && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Debug Information
                  </summary>
                  <pre className="mt-1 text-xs overflow-auto bg-background p-2 rounded">
                    {JSON.stringify(error.context, null, 2)}
                  </pre>
                </details>
              )}
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

        {errorCode === 'RATE_LIMIT_ERROR' && (
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

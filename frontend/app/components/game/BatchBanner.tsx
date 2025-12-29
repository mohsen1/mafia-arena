/**
 * BatchBanner - Shows status when game is waiting for batch processing.
 * Helps users understand why a game appears to pause during batch API mode.
 */

import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import type { GameStatus, AIProgress, HealthCheckResponse } from '~/lib/game-types';
import { formatAiProgress } from '~/lib/game-types';

interface BatchBannerProps {
  status: GameStatus;
  aiProgress: AIProgress | null;
  suspenseReason: string | null;
  healthStatus: HealthCheckResponse['healthStatus'] | null;
}

export function BatchBanner({ status, aiProgress, suspenseReason, healthStatus }: BatchBannerProps) {
  // Show nothing if game is running normally
  if (status !== 'waiting_for_batch' && healthStatus !== 'warning' && healthStatus !== 'critical') {
    return null;
  }

  // Critical health status - game may be stuck
  if (healthStatus === 'critical') {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
        <div className="flex items-start gap-3">
          <div className="shrink-0 text-amber-500">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-0.5 min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Game may be stuck
            </div>
            {suspenseReason && (
              <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 font-mono mt-1">
                {suspenseReason}
              </div>
            )}
            {aiProgress && (
              <div className="text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                {formatAiProgress(aiProgress)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Warning health status
  if (healthStatus === 'warning') {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
        <div className="flex items-center gap-3">
          <div className="shrink-0 text-amber-500">
            <Clock size={16} />
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-400">
            Waiting for AI response...
            {aiProgress && ` (${formatAiProgress(aiProgress)})`}
          </div>
        </div>
      </div>
    );
  }

  // Batch processing mode
  if (status === 'waiting_for_batch') {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 border-b border-blue-100 dark:border-blue-800/30">
        <div className="flex items-center gap-3">
          <div className="animate-pulse bg-blue-400 h-2 w-2 rounded-full" />
          <div>
            <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-300">
              Batch Processing Active
            </h3>
            <p className="text-xs text-muted-foreground">
              AI is processing in the background (Discount Mode).
              {aiProgress && ` ${formatAiProgress(aiProgress)}.`}
              Next update expected in ~10 minutes.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * ConnectionStatus - Compact connection status indicator.
 */
interface ConnectionStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  isPolling: boolean;
  aiProgress: AIProgress | null;
  suspenseReason: string | null;
  eventCount: number;
}

export function ConnectionStatus({
  isConnected,
  isConnecting,
  isPolling,
  aiProgress,
  suspenseReason,
  eventCount,
}: ConnectionStatusProps) {
  if (isConnecting) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 size={9} className="animate-spin" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (isPolling) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span>
            {aiProgress ? formatAiProgress(aiProgress) : `Polling mode · ${eventCount} events`}
          </span>
        </div>
        {suspenseReason && (
          <div className="text-[10px] text-muted-foreground/70">{suspenseReason}</div>
        )}
      </div>
    );
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>Connected</span>
        {aiProgress && (
          <span className="text-muted-foreground">· {formatAiProgress(aiProgress)}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
      <span>Disconnected</span>
    </div>
  );
}

/**
 * ErrorBanner - Shows game error with formatted message.
 */
interface ErrorBannerProps {
  error: string;
}

function formatErrorForUser(rawError: string): { title: string; message: string; suggestion?: string } {
  const error = rawError.toLowerCase();

  if (error.includes('quota') || error.includes('billing') || error.includes('limit: 0')) {
    return {
      title: 'Model Not Available',
      message: rawError,
      suggestion: 'Try starting a new game with a different model (e.g., Gemini 2.5 Flash).',
    };
  }

  if (error.includes('api key') || error.includes('invalid api') || error.includes('access denied')) {
    return {
      title: 'API Key Issue',
      message: rawError,
      suggestion: 'Check your API key configuration in settings.',
    };
  }

  if (error.includes('not found') || error.includes('unsupported') || error.includes('not supported')) {
    return {
      title: 'Model Unavailable',
      message: rawError,
      suggestion: 'This model may have been deprecated. Try a different model.',
    };
  }

  if (error.includes('timeout') || error.includes('timed out')) {
    return {
      title: 'AI Timeout',
      message: rawError,
      suggestion: 'The AI provider took too long to respond. This is usually temporary.',
    };
  }

  if (error.includes('network') || error.includes('fetch') || error.includes('connection')) {
    return {
      title: 'Connection Error',
      message: rawError,
      suggestion: 'Check your internet connection and try again.',
    };
  }

  if (error.includes('persistence failure') || error.includes('checkpoint')) {
    return {
      title: 'Internal Error',
      message: 'Failed to save game state.',
      suggestion: 'This is a temporary infrastructure issue. Please try again.',
    };
  }

  return {
    title: 'Game Failed',
    message: rawError || 'An unexpected error occurred.',
  };
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  const formatted = formatErrorForUser(error);

  return (
    <div className="rounded bg-rose-500/10 p-3 border border-rose-500/20">
      <div className="text-xs font-semibold text-rose-600 dark:text-rose-400">{formatted.title}</div>
      <div className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
        {formatted.message}
        {formatted.suggestion && (
          <div className="mt-1 opacity-70">{formatted.suggestion}</div>
        )}
      </div>
    </div>
  );
}


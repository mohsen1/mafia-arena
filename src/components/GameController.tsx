'use client';

import { Button } from '@/components/ui/button'; // Import Button
import { useGameContext } from '@/context/GameContext'; // Import context hook
import { Loader, Pause, Play, SkipForward } from 'lucide-react';

import { useTranslation } from 'react-i18next'; // Import from react-i18next
import { GameErrorDisplay } from '@/components/GameErrorDisplay';
import { useParams } from 'next/navigation';

export default function GameController() {
  const { t } = useTranslation();
  const params = useParams();
  const gameId = params?.gameId as string;
  const lang = (params?.lang as string) || 'en';

  const {
    isLoadingNextTurn,
    isAutoRunning,
    toggleAutoRun,
    runNextTurnAction,
    gameState,
    error,
  } = useGameContext();



  const handleNextClick = () => {
    // Don't run next if auto-running is on, let it proceed naturally
    // Or, maybe clicking Next manually should always work and disable auto-run?
    // Let's allow manual Next only when paused for now.
    if (!isAutoRunning) {
      runNextTurnAction();
    }
  };

  // Get phase-aware loading message
  const getLoadingMessage = () => {
    if (!gameState) return t('LoadingNextTurnGeneral');

    const phase = gameState.phase;
    switch (phase) {
      case 'Day':
        return t('LoadingNextTurnDay');
      case 'Night':
      case 'FirstNight':
        return t('LoadingNextTurnNight');
      case 'CharacterGeneration':
        return t(
          'character-generation.please-wait',
          'Please wait while we create unique AI characters...'
        );
      default:
        return t('LoadingNextTurnGeneral');
    }
  };

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <GameErrorDisplay
          error={error}
          onRetry={() => window.location.reload()}
          gameId={gameId}
          lang={lang}
        />
      </div>
    );
  }

  return (
    // Use flex-col for rows, add gap between rows
    <div className="flex flex-col gap-2 items-start">
      {/* Row 1: Buttons */}
      <div className="flex items-center gap-3">
        {/* Pause/Play Button */}
        <Button
          onClick={toggleAutoRun}
          variant="outline"
          size="icon"
          aria-label={isAutoRunning ? t('PauseButton') : t('ResumeButton')}
        >
          {isAutoRunning ? (
            <Pause className="h-4 w-4 rtl:-scale-x-100" />
          ) : (
            <Play className="h-4 w-4 rtl:-scale-x-100" />
          )}
        </Button>

        {/* Next Button - Restore loader inside */}
        <Button
          onClick={handleNextClick}
          disabled={isLoadingNextTurn || isAutoRunning} // Disable if loading OR auto-running
          type="button" // Changed from submit, assuming manual trigger now
          variant="default"
          size="sm"
          className="px-4 py-2"
          aria-label={t('NextTurnButton')}
        >
          <SkipForward className="h-4 w-4 mr-1 rtl:-scale-x-100" />
          {/* Translate button text */}
          {t('NextTurnButton')}
        </Button>
      </div>

      {/* Row 2: Loader Icon with phase-aware message */}
      <div className="flex items-center gap-2 h-8">
        {/* Standalone Loading Indicator (only shown when loading) */}
        {isLoadingNextTurn && (
          <>
            <Loader className="animate-spin" size={18} />
            <span className="text-xs text-muted-foreground">
              {getLoadingMessage()}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

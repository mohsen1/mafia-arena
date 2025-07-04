'use client';

import { Button } from '@/components/ui/button';
import { useGameContext } from '@/context/GameContext';
import { Loader, Pause, Play, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function GameController() {
  const { t } = useTranslation();
  const {
    isLoadingNextTurn,
    isAutoRunning,
    toggleAutoRun,
    runNextTurnAction,
    gameState,
  } = useGameContext();

  const handleNextClick = () => {
    if (!isAutoRunning) {
      runNextTurnAction();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={toggleAutoRun}
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        aria-label={isAutoRunning ? t('PauseButton') : t('ResumeButton')}
      >
        {isAutoRunning ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3" />
        )}
      </Button>

      <Button
        onClick={handleNextClick}
        disabled={isLoadingNextTurn || isAutoRunning}
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        aria-label={t('NextTurnButton')}
      >
        {isLoadingNextTurn ? (
          <Loader className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <SkipForward className="h-3 w-3 mr-1" />
            <span className="text-xs">{t('NextTurnButton')}</span>
          </>
        )}
      </Button>

      {isLoadingNextTurn && gameState && (
        <span className="text-[10px] text-muted-foreground">
          {gameState.phase === 'Day'
            ? t('LoadingNextTurnDay')
            : gameState.phase === 'Night' || gameState.phase === 'FirstNight'
              ? t('LoadingNextTurnNight')
              : t('LoadingNextTurnGeneral')}
        </span>
      )}
    </div>
  );
}

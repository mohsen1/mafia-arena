'use client';

import { Button } from '@/components/ui/button';
import { useGameContext } from '@/context/GameContext';
import {
  Loader,
  Pause,
  Play,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSpokenText } from '@/context/SpokenTextContext';
import { useEffect } from 'react';

export default function GameController() {
  const { t } = useTranslation();
  const {
    isLoadingNextTurn,
    isAutoRunning,
    toggleAutoRun,
    runNextTurnAction,
    gameState,
    isAudioGloballyEnabled,
    toggleGlobalAudio,
  } = useGameContext();

  const { currentlySpeakingId, resetAudio } = useSpokenText();

  // Clear any stuck audio on mount
  useEffect(() => {
    if (currentlySpeakingId) {
      console.log(
        '[GameController] Clearing stuck audio on mount:',
        currentlySpeakingId
      );
      resetAudio();
    }
  }, []); // Run only on mount

  const handleNextClick = () => {
    if (!isAutoRunning) {
      // In manual mode, stop any current audio before advancing
      if (currentlySpeakingId) {
        console.log('[GameController] Stopping audio before manual next turn');
        resetAudio();
      }
      runNextTurnAction();
    }
  };

  const handleClearAudio = () => {
    console.log('[GameController] Manually clearing audio');
    resetAudio();
  };

  if (!gameState) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Audio Toggle Button - only show if voice mode is enabled */}
      {gameState?.voiceModeEnabled && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={toggleGlobalAudio}
            aria-label={
              isAudioGloballyEnabled ? t('MuteAudio') : t('UnmuteAudio')
            }
            title={isAudioGloballyEnabled ? t('MuteAudio') : t('UnmuteAudio')}
          >
            {isAudioGloballyEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </Button>
          {currentlySpeakingId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleClearAudio}
              aria-label={t('SkipAudio')}
              title="Skip current audio"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          )}
        </>
      )}

      <Button
        onClick={() => {
          console.log('[GameController] Toggling auto-run mode:', {
            currentMode: isAutoRunning ? 'auto' : 'manual',
            newMode: isAutoRunning ? 'manual' : 'auto',
            currentlySpeakingId,
            isAudioGloballyEnabled,
          });
          toggleAutoRun();
        }}
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        aria-label={isAutoRunning ? t('PauseButton') : t('ResumeButton')}
        title={isAutoRunning ? t('PauseButton') : t('ResumeButton')}
      >
        {isAutoRunning ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
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

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
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface GameControllerProps {
  compact?: boolean;
  className?: string;
}

export default function GameController({
  compact = false,
  className,
}: GameControllerProps) {
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
  }, [currentlySpeakingId, resetAudio]); // Run when these dependencies change

  const handleNextClick = () => {
    if (!isAutoRunning) {
      runNextTurnAction();
    }
  };

  const handleClearAudio = () => {
    console.log('[GameController] Manually clearing audio');
    resetAudio();
  };

  if (!gameState) return null;

  if (compact) {
    // Compact version for header
    return (
      <div className={cn('flex items-center gap-2', className)}>
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
                title={t('SkipAudio')}
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            )}
          </>
        )}

        <Button
          onClick={toggleAutoRun}
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

  // Full control panel version
  return (
    <Card className={cn('w-full', className)}>
      <CardContent className="p-3 space-y-3">
        {/* Main Controls */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {t('PlaybackControl')}
            </span>
            <Badge variant={isAutoRunning ? 'default' : 'secondary'}>
              {isAutoRunning ? t('AutoMode') : t('ManualMode')}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={toggleAutoRun}
              variant={isAutoRunning ? 'default' : 'outline'}
              size="sm"
              className="flex-1"
              disabled={isLoadingNextTurn}
            >
              {isAutoRunning ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  {t('PauseButton')}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  {t('PlayButton')}
                </>
              )}
            </Button>

            <Button
              onClick={handleNextClick}
              disabled={isLoadingNextTurn || isAutoRunning}
              variant="outline"
              size="sm"
              className="flex-1"
            >
              {isLoadingNextTurn ? (
                <>
                  <Loader className="h-4 w-4 mr-2 animate-spin" />
                  {t('loading')}
                </>
              ) : (
                <>
                  <SkipForward className="h-4 w-4 mr-2" />
                  {t('NextTurn')}
                </>
              )}
            </Button>
          </div>

          {isLoadingNextTurn && (
            <div className="text-xs text-muted-foreground text-center">
              {gameState.phase === 'Day'
                ? t('LoadingNextTurnDay')
                : gameState.phase === 'Night' ||
                    gameState.phase === 'FirstNight'
                  ? t('LoadingNextTurnNight')
                  : t('LoadingNextTurnGeneral')}
            </div>
          )}
        </div>

        {/* Audio Controls */}
        {gameState?.voiceModeEnabled && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {t('AudioControl')}
                </span>
                <Badge
                  variant={isAudioGloballyEnabled ? 'default' : 'secondary'}
                >
                  {isAudioGloballyEnabled ? t('On') : t('Off')}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={toggleGlobalAudio}
                  variant={isAudioGloballyEnabled ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                >
                  {isAudioGloballyEnabled ? (
                    <>
                      <Volume2 className="h-4 w-4 mr-2" />
                      {t('MuteAudio')}
                    </>
                  ) : (
                    <>
                      <VolumeX className="h-4 w-4 mr-2" />
                      {t('UnmuteAudio')}
                    </>
                  )}
                </Button>

                {currentlySpeakingId && (
                  <Button
                    onClick={handleClearAudio}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    {t('SkipAudio')}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Current Status */}
        <Separator />
        <div className="space-y-2">
          <div className="text-sm font-medium">
            {t('CurrentStatus')}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>{t('GamePhaseLabel')}:</span>
              <span className="font-medium">
                {t(`gamePhases.${gameState.phase}`, gameState.phase)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>{t('RoundLabel')}:</span>
              <span className="font-medium">{gameState.round}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('PlayersLabel')}:</span>
              <span className="font-medium">
                {gameState.livingPlayerIds?.length || 0} alive
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

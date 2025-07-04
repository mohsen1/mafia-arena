'use client';

import { Button } from '@/components/ui/button'; // Import Button
import { useGameContext } from '@/context/GameContext'; // Import context hook
import {
  Loader,
  Pause,
  Play,
  SkipForward,
  Keyboard,
  Volume2,
} from 'lucide-react';
import { useSoundEffects } from '@/hooks/useSoundEffects';
import { SoundSettings } from '@/components/SoundSettings';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useEffect, useState } from 'react';

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

  // Sound effects state
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundVolume, setSoundVolume] = useState(0.5);
  const soundEffects = useSoundEffects({
    enabled: soundEnabled,
    volume: soundVolume,
  });

  // Track phase changes for sound effects
  useEffect(() => {
    if (!gameState || !soundEnabled) return;

    // Play phase change sounds
    if (gameState.phase === 'Day') {
      soundEffects.playSound('dayStart');
    } else if (
      gameState.phase === 'Night' ||
      gameState.phase === 'FirstNight'
    ) {
      soundEffects.playSound('nightStart');
    } else if (gameState.phase === 'GameOver') {
      // Determine if player won or lost
      const winCondition = gameState.winCondition as {
        outcome?: string;
      } | null;
      const playerWon =
        winCondition?.outcome?.includes('Town') && gameState.humanPlayerId;
      soundEffects.playSound(playerWon ? 'victory' : 'defeat');
    }
  }, [gameState, soundEnabled, soundEffects]);

  // Play sound for voting
  useEffect(() => {
    if (!gameState || !soundEnabled) return;

    const latestMessage = gameState.log?.[0];
    if (
      latestMessage?.content?.includes('votes for') ||
      latestMessage?.content?.includes('abstains')
    ) {
      soundEffects.playSound('vote');
    } else if (
      latestMessage?.content?.includes('eliminated') ||
      latestMessage?.content?.includes('killed')
    ) {
      soundEffects.playSound('elimination');
    }
  }, [gameState, soundEnabled, soundEffects]);

  const handleNextClick = () => {
    // Don't run next if auto-running is on, let it proceed naturally
    // Or, maybe clicking Next manually should always work and disable auto-run?
    // Let's allow manual Next only when paused for now.
    if (!isAutoRunning) {
      runNextTurnAction();
    }
  };

  const showKeyboardShortcuts = () => {
    const event = new CustomEvent('showKeyboardShortcuts');
    window.dispatchEvent(event);
  };

  const handleSoundEnabledChange = (enabled: boolean) => {
    setSoundEnabled(enabled);
    soundEffects.setEnabled(enabled);
  };

  const handleVolumeChange = (volume: number) => {
    setSoundVolume(volume);
    soundEffects.setVolume(volume);
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
    <div className="flex flex-col gap-2">
      {/* Aria-live region for game state announcements */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {gameState && (
          <>
            {t('CurrentPhase', 'Current phase: {{phase}}', {
              phase: gameState.phase,
            })}
            {gameState.phase === 'Day' &&
              t('RoundNumber', ', Round {{round}}', { round: gameState.round })}
          </>
        )}
      </div>

      {/* Row 1: Controls */}
      <div className="flex items-center gap-3">
        {/* Pause/Play Button */}
        <Button
          onClick={toggleAutoRun}
          variant="outline"
          size="icon"
          aria-label={isAutoRunning ? t('PauseButton') : t('ResumeButton')}
          title={isAutoRunning ? 'Pause (P)' : 'Play (P)'}
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
          title="Next Turn (N or →)"
        >
          <SkipForward className="h-4 w-4 mr-1 rtl:-scale-x-100" />
          {/* Translate button text */}
          {t('NextTurnButton')}
        </Button>

        {/* Sound settings button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('soundSettings.title')}
              title="Sound Settings"
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <SoundSettings
              enabled={soundEnabled}
              volume={soundVolume}
              onEnabledChange={handleSoundEnabledChange}
              onVolumeChange={handleVolumeChange}
            />
          </PopoverContent>
        </Popover>

        {/* Keyboard shortcuts help button */}
        <Button
          onClick={showKeyboardShortcuts}
          variant="ghost"
          size="icon"
          className="ms-auto"
          aria-label={t('KeyboardShortcuts')}
          title="Keyboard Shortcuts (?)"
        >
          <Keyboard className="h-4 w-4" />
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
        {/* Show keyboard hint when not loading */}
        {!isLoadingNextTurn && (
          <span className="text-xs text-muted-foreground">
            {t('KeyboardHint', 'Press ? for keyboard shortcuts')}
          </span>
        )}
      </div>
    </div>
  );
}

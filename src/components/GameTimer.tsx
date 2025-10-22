'use client';

import { useEffect, useState } from 'react';
import { useGameContext } from '@/context/GameContext';
import { useTranslation } from 'react-i18next';
import { Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface PhaseTimeConfig {
  CharacterGeneration: number;
  Init: number;
  Briefing: number;
  FirstNight: number;
  Day: number;
  Night: number;
  GameOver: number;
}

const PHASE_TIME_LIMITS: PhaseTimeConfig = {
  CharacterGeneration: 300, // 5 minutes
  Init: 60, // 1 minute
  Briefing: 120, // 2 minutes
  FirstNight: 180, // 3 minutes
  Day: 300, // 5 minutes
  Night: 180, // 3 minutes
  GameOver: 0, // No limit
};

export function GameTimer() {
  const { t } = useTranslation();
  const { gameState } = useGameContext();
  const [timeRemaining, setTimeRemaining] = useState(0);

  const [isWarning, setIsWarning] = useState(false);
  const [isCritical, setIsCritical] = useState(false);

  useEffect(() => {
    if (!gameState?.phase) return;

    // Reset timer when phase changes
    const startTime = Date.now();
    const timeLimit =
      PHASE_TIME_LIMITS[gameState.phase as keyof PhaseTimeConfig] || 0;
    setTimeRemaining(timeLimit);

    if (timeLimit === 0) return; // No timer for this phase

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = Math.max(0, timeLimit - elapsed);
      setTimeRemaining(remaining);

      // Set warning states
      const wasWarning = isWarning;
      const wasCritical = isCritical;

      setIsWarning(remaining <= 60 && remaining > 30);
      setIsCritical(remaining <= 30);

      if (remaining === 0) {
        clearInterval(interval);
        // Could trigger phase advancement here if needed
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.phase, isWarning, isCritical]);

  if (
    !gameState ||
    gameState.phase === 'GameOver' ||
    (timeRemaining === 0 &&
      PHASE_TIME_LIMITS[gameState.phase as keyof PhaseTimeConfig] === 0)
  ) {
    return null;
  }

  const timeLimit =
    PHASE_TIME_LIMITS[gameState.phase as keyof PhaseTimeConfig] || 0;
  const progress =
    timeLimit > 0 ? ((timeLimit - timeRemaining) / timeLimit) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card
      className={cn(
        'p-3 transition-all duration-300',
        isWarning && 'border-yellow-500 bg-yellow-500/10',
        isCritical && 'border-red-500 bg-red-500/10 animate-pulse'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isCritical ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {t('PhaseTimer', 'Phase Timer')}
          </span>
        </div>
        <div
          className={cn(
            'text-lg font-mono font-bold',
            isWarning && 'text-yellow-500',
            isCritical && 'text-red-500'
          )}
        >
          {formatTime(timeRemaining)}
        </div>
      </div>
      {timeLimit > 0 && (
        <Progress
          value={progress}
          className={cn(
            'mt-2 h-2',
            isWarning && '[&>*]:bg-yellow-500',
            isCritical && '[&>*]:bg-red-500'
          )}
        />
      )}
    </Card>
  );
}

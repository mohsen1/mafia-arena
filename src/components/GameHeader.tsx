'use client';

import GameController from '@/components/GameController';
import { useGameContext } from '@/context/GameContext';
import { useTranslation } from 'react-i18next';

export function GameHeader() {
  const { gameState } = useGameContext();
  const { t } = useTranslation();

  if (!gameState) return null;

  // Use title and description from FilteredGameState
  const { title, description, phase, round, winCondition } = gameState;

  // Translate phase and win condition
  const translatedPhase = t(phase, { defaultValue: phase });

  return (
    <div className="p-2 flex-shrink-0 bg-card/50 border-b">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-bold truncate">
              {/* Use title or default */}
              {title || t('WerewolfAITitle')}
            </h1>
            {description && (
              <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                {description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              {t('RoundLabel')}: <span className="font-medium">{round}</span>
            </span>
            <span>•</span>
            <span className="font-medium capitalize">{translatedPhase}</span>
            {winCondition && (
              <>
                <span>•</span>
                <span className="text-success font-medium">
                  {t(`Outcome${winCondition.replace(/\s/g, '')}`, {
                    defaultValue: winCondition,
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        {/* Action Buttons - Now appears below game info */}
        {phase !== 'GameOver' && <GameController />}
      </div>
    </div>
  );
}

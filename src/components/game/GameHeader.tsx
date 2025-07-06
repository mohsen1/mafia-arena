'use client';

import GameController from '@/components/game/GameController';
import { useGameContext } from '@/context/GameContext';
import { useTranslation } from 'react-i18next';

export function GameHeader() {
  const { gameState } = useGameContext();
  const { t } = useTranslation();

  if (!gameState) return null;

  // Use title from FilteredGameState (description is not used)
  const { title, phase, round, winCondition } = gameState;

  // Translate phase and win condition
  const translatedPhase = t(phase, { defaultValue: phase });

  return (
    <div className="py-2 px-4 flex-shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-sm font-semibold truncate">
              {/* Use title or default */}
              {title || t('WerewolfAITitle')}
            </h1>
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
        </div>
        {/* Action Buttons - Now appears below game info */}
        {phase !== 'GameOver' && <GameController compact />}
      </div>
    </div>
  );
}

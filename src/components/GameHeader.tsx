'use client'; // Ensure this is a client component

import GameController from "@/components/GameController";
import { useGameContext } from "@/context/GameContext";
// Import from react-i18next
import { useTranslation } from "react-i18next"; 

export function GameHeader() {
  const { gameState } = useGameContext(); // Only get gameState
  
  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  if (!gameState) return null; 

  const { title, description, phase, round, winCondition } = gameState;

  return (
    <header className="p-4 flex justify-between items-center flex-shrink-0 gap-6">
      {/* Game Info Group */}
      <div className="flex-grow min-w-0">
        <h1 className="text-2xl font-bold mb-1 truncate">
          {/* Use key from the appropriate namespace (now lang code) */}
          {title || t("WerewolfAITitle")}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mb-1 italic">
            {description}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t("RoundLabel")}:{" "}
          <span className="font-semibold">{round}</span> |{" "}
          <span className="font-semibold capitalize">
            {/* Assuming phase names might be translation keys */}
            {t(phase, phase)}
          </span>
        </p>
        <div className="mt-1">
          {winCondition && (
            <span className="text-lg font-bold text-success">
              {/* Assuming outcome strings might be translation keys */} 
              {t(winCondition.outcome, winCondition.outcome)}
            </span>
          )}
          {phase === "GameOver" && !winCondition && (
            <span className="text-lg font-bold text-destructive">
              {t("GameOverStatus")}
            </span>
          )}
        </div>
      </div>
      {/* Action Buttons */}
      {phase !== "GameOver" && (
        <GameController /> 
      )}
    </header>
  );
}

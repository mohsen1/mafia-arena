'use client'; // Ensure this is a client component

import { useState } from "react"; // Added import for state
import GameController from "@/components/GameController";
import { useGameContext } from "@/context/GameContext";
// Import from react-i18next
import { useTranslation } from "react-i18next"; 

export function GameHeader() {
  const { gameState } = useGameContext(); // Only get gameState
  
  // Use standard hook
  const { t } = useTranslation();

  // State for description expansion
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false); 

  if (!gameState) return null; 

  // Use themeTitle and themeDescription from FilteredGameState
  const { themeTitle, themeDescription, phase, round, winCondition } = gameState;

  return (
    <div className="p-4 space-y-3 flex-shrink-0"> 
      <div> 
        <h1 className="text-xl font-bold mb-1 truncate"> 
          {/* Use themeTitle or default */}
          {themeTitle || t("WerewolfAITitle")}
        </h1>
        
        {/* Use themeDescription */}
        {themeDescription && (
          <div> {/* Wrapper div for description and toggle button */}
            <p 
              className={[
                "text-sm text-muted-foreground italic",
                !isDescriptionExpanded ? "line-clamp-1 mb-0" : "mb-1" // Apply line clamp and adjust margin
              ].join(" ")}
            >
              {themeDescription}
            </p>
            {/* Toggle button */} 
            <button 
              type="button"
              onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
              className="text-sm text-primary hover:underline mt-0.5" // Use primary color
            >
              {isDescriptionExpanded ? t("ShowLess") : t("ShowMore")}
            </button>
          </div>
        )}

        <p className="text-sm text-muted-foreground mt-2"> {/* Added margin top */}
          {t("RoundLabel")}:{" "}
          <span className="font-semibold">{round}</span> |{" "}
          <span className="font-semibold capitalize">
            {/* Assuming phase names might be translation keys */}
            {t(`GamePhase${phase}`, { defaultValue: phase })}
          </span>
        </p>
        <div className="mt-1">
          {winCondition && (
            <span className="text-lg font-bold text-success">
              {/* Assuming outcome strings might be translation keys */} 
              {t(`Outcome${winCondition.outcome.replace(/\s/g, '')}`, { defaultValue: winCondition.outcome })}
            </span>
          )}
          {phase === "GameOver" && !winCondition && (
            <span className="text-lg font-bold text-destructive">
              {t("GameOverStatus")}
            </span>
          )}
        </div>
      </div>
      {/* Action Buttons - Now appears below game info */}
      {phase !== "GameOver" && (
        <GameController /> 
      )}
    </div> 
  );
}

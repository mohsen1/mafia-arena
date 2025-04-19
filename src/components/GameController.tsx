"use client";

import React from "react";
import {
  Play,
  Pause,
  SkipForward,
  // AlertCircle,
  // Loader2,
  Volume2,
  VolumeX,
  Loader,
} from "lucide-react";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import { Button } from "@/components/ui/button"; // Import Button
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import { Label } from "@/components/ui/label"; // Import Label
import { useTranslation } from "react-i18next"; // Import from react-i18next

export default function GameController() {
  const {
    // Get gameState only if needed for something else, otherwise remove
    // gameState, 
    isAutoRunning,
    toggleAutoRun,
    isLoadingNextTurn,
    runNextTurnAction,
    // Get global audio state and toggle function
    isAudioGloballyEnabled,
    toggleAudioGloballyEnabled,
  } = useGameContext();

  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  const handleNextClick = () => {
    // Don't run next if auto-running is on, let it proceed naturally
    // Or, maybe clicking Next manually should always work and disable auto-run?
    // Let's allow manual Next only when paused for now.
    if (!isAutoRunning) {
      runNextTurnAction();
    }
  };

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
          aria-label={isAutoRunning ? t("PauseButton") : t("ResumeButton")}
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
          aria-label={t("NextTurnButton")}
        >
          <SkipForward className="h-4 w-4 mr-1 rtl:-scale-x-100" />
          {/* Translate button text */}
          {t("NextTurnButton")}
        </Button>
      </div>

      {/* Row 2: Audio Toggle and Loader Icon (optional, shown only when loading) */}
      <div className="flex items-center gap-2 h-8">
        {" "}
        {/* Ensure consistent height */}
        {/* Audio Toggle Icon Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleAudioGloballyEnabled}
          aria-label={
            isAudioGloballyEnabled
              ? t("DisableAudioButton")
              : t("EnableAudioButton")
          }
        >
          {isAudioGloballyEnabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </Button>

        {/* Standalone Loading Indicator (only shown when loading) */}
        {isLoadingNextTurn && (
          <>
            <Loader className="animate-spin" size={18} />
            <span className="text-xs text-muted-foreground">
              {t("LoadingNextTurn")}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

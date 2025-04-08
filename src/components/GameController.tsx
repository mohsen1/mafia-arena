"use client";

import {
  Loader,
  Play,
  Pause,
  SkipForward,
  Loader2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import { Button } from "@/components/ui/button"; // Import Button
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import { Label } from "@/components/ui/label"; // Import Label

export default function GameController() {
  const {
    isAutoRunning,
    toggleAutoRun,
    runNextTurnAction,
    isLoadingNextTurn,
    t, // Get t function from context
    // Get global audio state and toggle function
    isAudioGloballyEnabled,
    toggleAudioGloballyEnabled,
  } = useGameContext();

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
          aria-label={
            isAutoRunning
              ? t("PauseButton", "Pause Auto-Run")
              : t("ResumeButton", "Resume Auto-Run")
          } // Translate aria-label based on state
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
          aria-label={t("NextTurnButton", "Next Turn")} // Translate aria-label
        >
          <SkipForward className="h-4 w-4 mr-1 rtl:-scale-x-100" />
          {/* Translate button text */}
          {t("NextTurnButton", "Next")}
        </Button>
      </div>

      {/* Row 2: Audio Toggle and Loader Icon (optional, shown only when loading) */}
      <div className="flex items-center gap-2 h-8">
        {" "}
        {/* Ensure consistent height */}
        {/* Audio Toggle Checkbox */}
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <Checkbox
            id="audio-toggle"
            checked={isAudioGloballyEnabled}
            onCheckedChange={() => toggleAudioGloballyEnabled()}
          />
          <Label
            htmlFor="audio-toggle"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-1"
          >
            {isAudioGloballyEnabled ? (
              <Volume2 size={16} />
            ) : (
              <VolumeX size={16} />
            )}
            {/* Keep text label for clarity */}
            {/* {t('EnableAudioLabel', 'Enable Audio')} */}
          </Label>
        </div>
        {/* Standalone Loading Indicator (only shown when loading) */}
        {isLoadingNextTurn && <Loader className="animate-spin" size={18} />}
      </div>
    </div>
  );
}

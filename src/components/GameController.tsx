"use client";

import {
  Loader,
  ArrowRight,
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
    <div className="flex flex-col gap-4 items-start justify-start">
      <div className="flex items-center gap-3">
        {/* status */}
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
            // Wrap icon in span with title for tooltip
            <>
              {t("PauseButton", "Pause")}

              <Pause className="h-4 w-4 rtl:-scale-x-100" />
            </>
          ) : (
            // Wrap icon in span with title for tooltip
            <>
              {t("ResumeButton", "Resume")}
              <Play className="h-4 w-4 rtl:-scale-x-100" />
            </>
          )}
        </Button>

        {/* Next Button */}
        {/* Consider hiding Next button when isAutoRunning is true? Or just disabling? */}
        {/* Let's disable it when auto-running or loading */}
        <Button
          onClick={handleNextClick}
          disabled={isLoadingNextTurn || isAutoRunning} // Disable if loading OR auto-running
          type="button" // Changed from submit, assuming manual trigger now
          variant="default"
          size="sm"
          className="px-4 py-2"
          aria-label={t("NextTurnButton", "Next Turn")} // Translate aria-label
        >
          {isLoadingNextTurn ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <SkipForward className="h-4 w-4 mr-1 rtl:-scale-x-100" />
              {/* Translate button text */}
              {t("NextTurnButton", "Next")}
            </>
          )}
        </Button>
      </div>

      {/* Row 2: Audio Toggle Checkbox */}
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
              {isAudioGloballyEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              {t('EnableAudioLabel', 'Enable Audio')}
          </Label>
      </div>

      {/* Row 3: Loading Indicator (Conditional) */}
      <div
        className={`flex items-center gap-2 ${
          isLoadingNextTurn ? "block" : "hidden"
        }`}
      >
        <Loader className="animate-spin" size={18} />
      </div>
    </div>
  );
}

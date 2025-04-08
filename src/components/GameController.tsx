'use client';

import { Loader, ArrowRight, Play, Pause } from "lucide-react";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import { Button } from "./ui/button"; // Import Button

export default function GameController() {
    const {
        isAutoRunning,
        toggleAutoRun,
        runNextTurnAction,
        isLoadingNextTurn
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
                type="button" // Important: prevent form submission if inside a form
                variant={isAutoRunning ? "secondary" : "default"}
                title={isAutoRunning ? "Pause Auto-Run" : "Start Auto-Run"}
            >
                {isAutoRunning ? <Pause size={18} /> : <Play size={18} />}
                <span>{isAutoRunning ? "Pause" : "Auto"}</span>
            </Button>

            {/* Next Button */}
            {/* Consider hiding Next button when isAutoRunning is true? Or just disabling? */}
            {/* Let's disable it when auto-running or loading */}
            <Button
                onClick={handleNextClick}
                disabled={isLoadingNextTurn || isAutoRunning} // Disable if loading OR auto-running
                type="button" // Changed from submit, assuming manual trigger now
                variant="default"
            >
                 <ArrowRight size={18} />
                Next
            </Button>
         </div>
         <div className={`flex items-center gap-2 ${isLoadingNextTurn ? 'block' : 'hidden'}`}>
                <Loader className="animate-spin" size={18} />
            </div>
        </div>
    );
}
'use client';

import { Loader, ArrowRight, Play, Pause } from "lucide-react";
import { useGameContext } from "@/context/GameContext"; // Import context hook

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
            <button
                onClick={toggleAutoRun}
                type="button" // Important: prevent form submission if inside a form
                className={`px-4 py-2 cursor-pointer flex items-center gap-2 text-white rounded shadow transition duration-150 ease-in-out disabled:bg-gray-500 disabled:cursor-not-allowed ${
                    isAutoRunning
                        ? 'bg-yellow-500 hover:bg-yellow-600'
                        : 'bg-blue-500 hover:bg-blue-600'
                }`}
                title={isAutoRunning ? "Pause Auto-Run" : "Start Auto-Run"}
            >
                {isAutoRunning ? <Pause size={18} /> : <Play size={18} />}
                <span>{isAutoRunning ? "Pause" : "Auto"}</span>
            </button>

            {/* Next Button */}
            {/* Consider hiding Next button when isAutoRunning is true? Or just disabling? */}
            {/* Let's disable it when auto-running or loading */}
            <button
                onClick={handleNextClick}
                disabled={isLoadingNextTurn || isAutoRunning} // Disable if loading OR auto-running
                type="button" // Changed from submit, assuming manual trigger now
                className="px-4 py-2 cursor-pointer flex items-center gap-2 bg-green-500 text-white rounded shadow hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition duration-150 ease-in-out"
            >
                 <ArrowRight size={18} />
                Next
            </button>
         </div>
         <div className={`flex items-center gap-2 ${isLoadingNextTurn ? 'block' : 'hidden'}`}>
                <Loader className="animate-spin" size={18} />
            </div>
        </div>
    );
}
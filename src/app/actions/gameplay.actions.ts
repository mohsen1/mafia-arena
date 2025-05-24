"use server";

// Use updated types and persistence functions
import type { FilteredGameState } from "@/lib/interfaces/gameState.types"; // Use gameState.types
import { loadGameData, saveGameData } from '@/lib/persistence'; // Assuming persistence functions
import { Game } from '@/lib/engine/core/Game'; // For loadFromState
// import { GameOverPhase } from '@/lib/engine/phases/GameOverPhase'; // No longer needed here
import { filterGameStateForClient } from '@/lib/visibilityHelper'; // Use the helper

export async function advanceGameStateAction(gameId: string): Promise<FilteredGameState | { error: string }> {
    try {
        const loadedState = await loadGameData(gameId);
        if (!loadedState) {
            throw new Error(`Game not found: ${gameId}`);
        }

        if (loadedState.phase === 'GameOver') {
            return filterGameStateForClient(loadedState);
        }
        
        if (loadedState.pendingHumanAction) {
             return filterGameStateForClient(loadedState);
        }

        const game = Game.loadFromState(loadedState);

        const currentPhaseInstance = game.getCurrentPhase(); 
        if (!currentPhaseInstance) {
             throw new Error(`Could not get current phase instance for type: ${game.getCurrentPhaseType()}`);
        }
        
        await currentPhaseInstance.runStep(game);

        const finalStateToSave = game.getCurrentSerializableState(game.getPendingHumanAction()); 

        await saveGameData(gameId, finalStateToSave);

        const filteredState = filterGameStateForClient(finalStateToSave);
        return filteredState;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error advancing game state";
        console.error(`Error in advanceGameStateAction for ${gameId}:`, message, error);
        return { error: message };
    }
}

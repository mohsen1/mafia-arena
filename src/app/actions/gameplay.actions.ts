"use server";

// Use updated types and persistence functions
import type { FilteredGameState } from "@/lib/interfaces/gameState.types"; // Use gameState.types
import { loadGameData, saveGameData } from '@/lib/persistence'; // Assuming persistence functions
import { Game } from '@/lib/engine/core/Game'; // For loadFromState
// import { GameOverPhase } from '@/lib/engine/phases/GameOverPhase'; // No longer needed here
import { filterGameStateForClient } from '@/lib/visibilityHelper'; // Use the helper

export async function advanceGameStateAction(gameId: string): Promise<FilteredGameState | { error: string }> {
    console.log(`advanceGameStateAction triggered for gameId: ${gameId}`);

    try {
        // 1. Load state
        const loadedState = await loadGameData(gameId);
        if (!loadedState) {
            throw new Error(`Game not found: ${gameId}`);
        }
        console.log(`Loaded: ${gameId}, Phase=${loadedState.phase}, Step=${loadedState.phaseStep}, Round=${loadedState.round}, Index=${loadedState.nextPlayerIndexToAction}`);

        // 2. Check terminal/pending states
        if (loadedState.phase === 'GameOver') {
            console.log(`Game ${gameId} is already over.`);
            return filterGameStateForClient(loadedState);
        }
        // IMPORTANT: Only return if pending action is for the *current* player index
        // If a human submitted, pendingAction might be cleared, but the index hasn't advanced yet.
        // The runStep logic should handle this by processing the submitted action if needed.
        // However, if we load state and there IS a pending action, we should wait.
        if (loadedState.pendingHumanAction) {
             console.log(`Game ${gameId} is waiting for human input (Player: ${loadedState.pendingHumanAction.playerId}).`);
             return filterGameStateForClient(loadedState);
        }

        // 3. Rehydrate game instance
        const game = Game.loadFromState(loadedState); 
        console.log(`Game ${gameId} rehydrated.`);

        // 4. Get Current Phase Instance
        const currentPhaseInstance = game.getCurrentPhase(); 
        if (!currentPhaseInstance) {
             throw new Error(`Could not get current phase instance for type: ${game.getCurrentPhaseType()}`);
        }
        
        // 5. Execute ONE Step
        console.log(`Running step ${game.getPhaseStep()} for phase ${game.getCurrentPhaseType()} (Game ${gameId})`);
        // The runStep method will now handle internal state changes (step, index) 
        // and potentially call game.advanceToPhase() if the phase completes.
        await currentPhaseInstance.runStep(game);
        console.log(`Step completed. New state: Step=${game.getPhaseStep()}, Index=${game.getNextPlayerIndexToAction()}, Phase=${game.getCurrentPhaseType()}`);

        // 6. Get Final State (including potential pending action set by runStep)
        // No need to check win condition or transition here - runStep handles it.
        const finalStateToSave = game.getCurrentSerializableState(game.getPendingHumanAction()); 

        // 7. Save 
        await saveGameData(gameId, finalStateToSave);
        console.log(`Game state saved for ${gameId}.`);

        // 8. Filter & Return
        const filteredState = filterGameStateForClient(finalStateToSave);
        console.log(`Filtered state returned for ${gameId}. Phase=${filteredState.phase}, Step=${finalStateToSave.phaseStep}`); // Log step for debugging
        return filteredState;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error advancing game state";
        console.error(`Error in advanceGameStateAction for ${gameId}:`, message, error);
        return { error: message };
    }
}

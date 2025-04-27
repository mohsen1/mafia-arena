"use server";

// Use updated types and persistence functions
import type { FilteredGameState } from "@/lib/interfaces/gameState.types"; // Use gameState.types
import { loadGameData, saveGameData } from '@/lib/persistence'; // Assuming persistence functions
import { Game } from '@/lib/engine/core/Game'; // For loadFromState
import { DayPhase } from '@/lib/engine/phases/DayPhase';
import { NightPhase } from '@/lib/engine/phases/NightPhase';
import { GameOverPhase } from '@/lib/engine/phases/GameOverPhase';
import { InitializationPhase } from '@/lib/engine/phases/InitializationPhase';
import type { IGamePhase, GamePhaseType } from '@/lib/engine/interfaces/IGamePhase';
import { filterGameStateForClient } from '@/lib/visibilityHelper'; // Use the helper
import type { SerializableGameState } from "@/lib/interfaces/persistence.types"; // Use persistence type

// Map phase types to their classes
const phaseInstanceMap: Record<string, new (...args: any[]) => IGamePhase> = { // Use string index signature
    'Init': InitializationPhase,
    'Day': DayPhase,
    'Night': NightPhase,
    'GameOver': GameOverPhase,
};

export async function advanceGameStateAction(gameId: string): Promise<FilteredGameState | { error: string }> {
    console.log(`advanceGameStateAction called for gameId: ${gameId}`);

    try {
        // 1. Load state
        let loadedState = await loadGameData(gameId);
        if (!loadedState) {
            throw new Error(`Game not found: ${gameId}`);
        }
        console.log(`Loaded game state for ${gameId}: Phase=${loadedState.phase}, Round=${loadedState.round}`);

        // 2. Check terminal/pending states
        if (loadedState.phase === 'GameOver') {
            console.log(`Game ${gameId} is already over.`);
            return filterGameStateForClient(loadedState);
        }
        if (loadedState.pendingHumanAction) {
            console.log(`Game ${gameId} is waiting for human input.`);
            return filterGameStateForClient(loadedState);
        }

        // 3. Rehydrate game instance
        const game = Game.loadFromState(loadedState); // Use static method
        console.log(`Game ${gameId} rehydrated.`);

        // 4. Get Current Phase Instance
        const currentPhaseType = game.getCurrentPhaseType();
        const currentPhaseInstance = game.getCurrentPhase(); // Get instance from game
        if (!currentPhaseInstance) {
             throw new Error(`Could not get current phase instance for type: ${currentPhaseType}`);
        }
        
        // 5. Execute Phase
        console.log(`Running phase ${currentPhaseType} for game ${gameId}`);
        await currentPhaseInstance.runPhase(game); // Pass the live game instance
        console.log(`Phase ${currentPhaseType} run completed for ${gameId}.`);

        // 6. Check for Deferral 
        let finalStateToSave: SerializableGameState;
        const pendingAction = game.getPendingHumanAction(); 

        if (pendingAction) {
            console.log(`Game ${gameId} deferred for human input during phase ${currentPhaseType}.`);
            finalStateToSave = game.getCurrentSerializableState(pendingAction); // Store pending action
        } else {
            // 7. Check Win Condition 
            const winner = game.checkWinCondition();
            if (winner) {
                console.log(`Win condition met for ${gameId}. Winner: ${winner}`);
                game.advanceToPhase(new GameOverPhase(winner)); // Update game's internal state
                finalStateToSave = game.getCurrentSerializableState();
            } else {
                // 8. Transition Phase 
                console.log(`Transitioning phase for game ${gameId}...`);
                game.advanceToPhase(currentPhaseInstance.transition(game)); // Update game's internal state
                console.log(`Game ${gameId} transitioned to phase ${game.getCurrentPhaseType()}.`);
                finalStateToSave = game.getCurrentSerializableState();
            }
        }

        // 9. Save 
        await saveGameData(gameId, finalStateToSave);
        console.log(`Game state saved for ${gameId}.`);

        // 10. Filter & Return
        const filteredState = filterGameStateForClient(finalStateToSave);
        console.log(`Filtered state returned for ${gameId}.`); // Removed state logging for brevity
        return filteredState;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error advancing game state";
        console.error(`Error in advanceGameStateAction for ${gameId}:`, message, error);
        return { error: message };
    }
}

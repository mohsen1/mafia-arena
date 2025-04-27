"use server";

import type { FilteredGameState } from "@/lib/interfaces/client.types";





// TODO: Import necessary functions and classes:
// import { Game } from "@/lib/game/Game";
// import { loadGameData, saveGameData } from "@/lib/db/gameData";
// import { filterGameStateForClient } from "@/lib/game/gameStateFiltering";
// import { DayPhase, NightPhase, GameOverPhase, type IGamePhase } from "@/lib/game/phases"; // Assuming phase locations

// Placeholder types and functions until actual imports are resolved
type SerializableGameState = any;
type Game = any;
const loadGameData = async (gameId: string): Promise<SerializableGameState | null> => {
    console.log(`loadGameData called for gameId: ${gameId}`);
    // Placeholder implementation
    if (gameId === "error-load") return null;
    return { id: gameId, phase: 'Night', round: 1, players: [], /* other state data */ pendingHumanAction: null, winner: null };
};
const saveGameData = async (gameId: string, state: SerializableGameState): Promise<void> => {
    console.log(`saveGameData called for gameId: ${gameId}`, state);
    // Placeholder implementation
    await Promise.resolve();
};
const filterGameStateForClient = (state: SerializableGameState): FilteredGameState => {
    console.log("filterGameStateForClient called with state:", state);
    // Placeholder implementation
    return { ...state, filtered: true }; // Mark as filtered for clarity
};
const Game = { // Placeholder Game class
    loadFromState: (state: SerializableGameState): Game => {
        console.log("Game.loadFromState called with state:", state);
        // Placeholder implementation
        return {
            id: state.id,
            getCurrentPhaseType: () => state.phase,
            getPendingHumanAction: () => state.pendingHumanAction, // Assumes state has this
            checkWinCondition: () => state.winner, // Assumes state has this or logic calculates it
            getCurrentSerializableState: () => ({ ...state, timestamp: Date.now() }), // Return updated state
            // Stub methods for phases to call
            logMessage: () => { },
            requestPlayerAction: () => { },
            advanceToPhase: (phaseInstance: any) => { state.phase = phaseInstance?.type || 'Unknown'; console.log("Advanced to phase:", state.phase) },
            setGameOver: (winner: string) => { state.phase = 'GameOver'; state.winner = winner; console.log("Game over, winner:", winner) }
        };
    },
};
// Placeholder Phase classes
const NightPhase = { type: 'Night', runPhase: async (game: Game) => { console.log("Running Night Phase (stubbed)"); game.advanceToPhase(DayPhase); }, transition: (game: Game) => DayPhase };
const DayPhase = { type: 'Day', runPhase: async (game: Game) => { console.log("Running Day Phase (stubbed)"); game.advanceToPhase(NightPhase); }, transition: (game: Game) => NightPhase };
const GameOverPhase = { type: 'GameOver', runPhase: async (game: Game) => { console.log("Running GameOver Phase (stubbed)"); }, transition: (game: Game) => GameOverPhase };


export async function advanceGameStateAction(gameId: string): Promise<FilteredGameState | { error: string }> {
    console.log(`advanceGameStateAction called for gameId: ${gameId}`);

    try {
        // 1. Load state
        const loadedState = await loadGameData(gameId);
        if (!loadedState) {
            throw new Error(`Game not found: ${gameId}`);
        }
        console.log("Loaded game state:", loadedState);

        // 2. Check terminal/pending states
        if (loadedState.phase === 'GameOver') {
            console.log("Game is already over.");
            return filterGameStateForClient(loadedState);
        }
        if (loadedState.pendingHumanAction) {
            console.log("Waiting for human action.");
            return filterGameStateForClient(loadedState);
        }

        // 3. Rehydrate game
        const game = Game.loadFromState(loadedState);
        console.log("Game rehydrated.");

        // 4. Get Current Phase Instance
        const currentPhaseType = game.getCurrentPhaseType();
        let currentPhaseInstance: any; // Replace 'any' with IGamePhase later

        switch (currentPhaseType) {
            case 'Night': currentPhaseInstance = NightPhase; break; // Replace with actual instances
            case 'Day': currentPhaseInstance = DayPhase; break;
            case 'GameOver': currentPhaseInstance = GameOverPhase; break; // Needs winner if loaded directly
            default: throw new Error(`Unknown game phase: ${currentPhaseType}`);
        }
        console.log("Current phase instance:", currentPhaseType);

        // 5. Execute Phase
        console.log("Executing phase run...");
        await currentPhaseInstance.runPhase(game);
        console.log("Phase run completed.");

        // 6. Check for Deferral (re-check after runPhase)
        const pendingAction = game.getPendingHumanAction(); // Assuming runPhase might set this
        if (pendingAction) {
            console.log("Human action pending after phase execution.");
            // Go directly to saving the state with the pending action
        } else {
            // 7. Check Win Condition
            const winCondition = game.checkWinCondition();
            if (winCondition) {
                console.log(`Win condition met: ${winCondition}`);
                game.setGameOver(winCondition); // Update game's internal state
                // Proceed to save the GameOver state
            } else {
                // 8. Transition Phase (only if no win/deferral)
                console.log("Transitioning to next phase...");
                const nextPhaseInstance = currentPhaseInstance.transition(game);
                game.advanceToPhase(nextPhaseInstance); // Update game's internal state
                console.log("Phase transitioned.");
            }
        }

        // 9. Serialize
        const stateToSave = game.getCurrentSerializableState(); // Includes changes from runPhase, win check, or transition
        console.log("Serialized state to save:", stateToSave);

        // 10. Save
        await saveGameData(gameId, stateToSave);
        console.log("Game state saved.");

        // 11. Filter & Return
        const filteredState = filterGameStateForClient(stateToSave);
        console.log("Filtered state returned:", filteredState);
        return filteredState;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error advancing game state";
        console.error("Error in advanceGameStateAction:", message, error);
        return { error: message };
    }
}

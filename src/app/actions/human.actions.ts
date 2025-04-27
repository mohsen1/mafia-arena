"use server";

import type { HumanActionPayload } from "@/lib/interfaces/actions.types"; // Assuming type location
import type { FilteredGameState } from "@/lib/interfaces/gameState.types"; // Assuming type location
import { advanceGameStateAction } from "./gameplay.actions.ts";
// TODO: Import necessary functions and classes:
// import { Game } from "@/lib/game/Game";
// import { loadGameData, saveGameData } from "@/lib/db/gameData";

// Using placeholders from gameplay.actions.ts for now
type SerializableGameState = any;
type Game = any;
declare const loadGameData: (gameId: string) => Promise<SerializableGameState | null>;
declare const saveGameData: (gameId: string, state: SerializableGameState) => Promise<void>;
declare const Game: { loadFromState: (state: SerializableGameState) => Game; };
// Add placeholder methods needed for human actions if not on placeholder Game
interface PlaceholderGame extends Game {
    getPlayer: (playerId: string) => any;
    clearPendingHumanAction: () => void;
    logMessage: (playerId: string, content: string) => void;
    recordHumanVote: (playerId: string, targetPlayerId: string) => void;
    recordHumanNightAction: (playerId: string, payload: HumanActionPayload) => void;
    getCurrentSerializableState: () => SerializableGameState;
    pendingHumanAction: any; // Add placeholder field
    humanPlayerId: string | undefined; // Add placeholder field
}


export async function submitHumanAction(gameId: string, payload: HumanActionPayload): Promise<FilteredGameState | { error: string }> {
    console.log(`submitHumanAction called for gameId: ${gameId}`, payload);

    try {
        // 1. Load state
        const loadedState = await loadGameData(gameId);
        if (!loadedState) {
            throw new Error(`Game not found: ${gameId}`);
        }
        console.log("Loaded game state:", loadedState);

        // 2. Verify pending action
        const expectedAction = loadedState.pendingHumanAction;
        if (!expectedAction) {
            console.warn("Received human action but none was pending. Ignoring.");
            // Optionally return current state or an error indicating no action was expected
            // For now, let's try advancing state anyway, maybe the load was slightly stale?
             return await advanceGameStateAction(gameId);
            // return { error: "No human action was expected at this time." };
        }

        // Basic type check (can be more sophisticated)
        // This check might be too strict if multiple actions are allowed (e.g., message OR vote)
        // A better check would see if payload.type is *one of* the allowed types.
        // if (expectedAction.allowedActions && !expectedAction.allowedActions.includes(payload.type)) {
        //    console.error(`Received action type ${payload.type} but expected one of ${expectedAction.allowedActions.join(', ')}`);
        //    return { error: `Invalid action type submitted. Expected ${expectedAction.allowedActions.join(' or ')}.` };
        // }
        console.log("Pending action verified (stubbed check).");


        // 3. Rehydrate game
        const game = Game.loadFromState(loadedState) as PlaceholderGame; // Cast to access specific methods
        console.log("Game rehydrated.");

        // 4. Find human player (Assuming humanPlayerId is stored in state)
        const humanPlayerId = loadedState.humanPlayerId;
        if (!humanPlayerId) {
             throw new Error("Human player ID not found in game state.");
        }
        const humanPlayer = game.getPlayer(humanPlayerId); // Needs implementation
        if (!humanPlayer) {
            throw new Error(`Human player with ID ${humanPlayerId} not found in rehydrated game.`);
        }
        console.log("Human player found:", humanPlayerId);

        // 5. Clear pending action (important to do before applying)
        game.clearPendingHumanAction(); // Needs implementation in Game class
        console.log("Pending human action cleared in game instance.");


        // 6. Apply Human Action to Game State
        console.log(`Applying human action: ${payload.type}`);
        switch (payload.type) {
            case "message":
                if (typeof payload.content === 'string') {
                    game.logMessage(humanPlayerId, payload.content); // Needs implementation
                } else {
                     throw new Error("Invalid payload for message action: content missing or not string.");
                }
                break;
            case "vote":
                 if (typeof payload.targetPlayerId === 'string') {
                    game.recordHumanVote(humanPlayerId, payload.targetPlayerId); // Needs implementation
                 } else {
                     throw new Error("Invalid payload for vote action: targetPlayerId missing or not string.");
                 }
                break;
            // Add cases for night actions like 'mafiaKill', 'doctorSave', 'seerInvestigate'
            case "mafiaKill":
            case "doctorSave":
            case "seerInvestigate":
                // These might require targetPlayerId or other fields
                 if (typeof payload.targetPlayerId === 'string') {
                    game.recordHumanNightAction(humanPlayerId, payload); // Needs implementation
                 } else {
                     // Seer might not have target initially? Adjust as needed.
                     throw new Error(`Invalid payload for ${payload.type} action: targetPlayerId missing or not string.`);
                 }
                break;
            default:
                // This attempts to handle unexpected action types gracefully.
                console.warn(`Unsupported human action type: ${payload.type}`);
                 throw new Error(`Unsupported human action type: ${payload.type}`);

        }
        console.log("Human action applied to game state.");

        // 7. Serialize Intermediate State
        const stateWithHumanAction = game.getCurrentSerializableState();
        stateWithHumanAction.pendingHumanAction = null; // Ensure pending is cleared in saved state too
        console.log("Serialized intermediate state:", stateWithHumanAction);

        // 8. Save Intermediate State
        await saveGameData(gameId, stateWithHumanAction);
        console.log("Intermediate game state saved.");

        // 9. Trigger Game Advancement
        console.log("Triggering game advancement...");
        return await advanceGameStateAction(gameId);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error submitting human action";
        console.error("Error in submitHumanAction:", message, error);
        return { error: message };
    }
}

"use server";

import type { HumanActionPayload } from "@/lib/interfaces/actions.types";
import type { FilteredGameState } from "@/lib/interfaces/gameState.types"; // Use correct path
import { advanceGameStateAction } from "./gameplay.actions";
import { loadGameData, saveGameData } from '@/lib/persistence'; // Assuming persistence functions
import { Game } from '@/lib/engine/core/Game'; // Use engine Game class
// import { RoleName } from '@/lib/engine/interfaces/IRole'; // No longer directly needed
// import { MessageVisibility } from '@/lib/engine/interfaces/IMessage'; // No longer directly needed

export async function submitHumanAction(
    gameId: string,
    payload: HumanActionPayload
): Promise<FilteredGameState | { error: string }> {
    console.log(`submitHumanAction called for gameId: ${gameId}`, payload);

    try {
        // 1. Load state
        const loadedState = await loadGameData(gameId);
        if (!loadedState) {
            throw new Error(`Game not found: ${gameId}`);
        }
        // console.log("Loaded game state:", loadedState); // Keep log brief

        // 2. Verify Pending Action
        const pending = loadedState.pendingHumanAction;
        if (!pending) {
            console.warn(`SubmitHumanAction: No pending human action for game ${gameId}. Ignoring.`);
            // Advance state anyway, might resolve stale state or trigger next AI
             return await advanceGameStateAction(gameId);
        }
         // Ensure action is for the correct player
         if (pending.playerId !== payload.playerId) {
             return { error: `Action submitted by wrong player. Expected ${pending.playerId}, got ${payload.playerId}` };
         }
        // Ensure the submitted action type is one of the allowed ones
        if (!pending.allowedActions.includes(payload.type)) {
             return { error: `Invalid action type submitted. Expected one of ${pending.allowedActions.join(', ')}, got ${payload.type}` };
        }
        console.log("Pending action verified.");

        // 3. Rehydrate game instance
        const game = Game.loadFromState(loadedState); 
        console.log("Game rehydrated.");

        // 4. Find human player (already verified by pending.playerId check)
        const humanPlayerId = pending.playerId;
        // const humanPlayer = game.getPlayer(humanPlayerId); // Not strictly needed now

        // 5. Get Current Phase Instance
        const currentPhaseInstance = game.getCurrentPhase();
        if (!currentPhaseInstance) {
            throw new Error(`Could not get phase instance for phase ${game.getCurrentPhaseType()}`);
        }
        // Ensure the phase instance has the processAction method
        if (typeof (currentPhaseInstance as any).processAction !== 'function') {
            throw new Error(`Phase ${game.getCurrentPhaseType()} does not have a processAction method.`);
        }

        // 6. Apply Human Action using Phase Logic
        console.log(`Applying human action via phase logic: ${payload.type}`);
        (currentPhaseInstance as any).processAction(game, humanPlayerId, payload);
        console.log("Human action processed by phase.");

        // 7. Clear pending action on the game instance
        game.clearPendingHumanAction();
        console.log("Pending human action cleared.");

        // 8. Increment Player Index **AFTER** processing the action
        const currentIndex = game.getNextPlayerIndexToAction();
        game.setNextPlayerIndexToAction(currentIndex + 1);
        console.log(`Player index incremented from ${currentIndex} to ${currentIndex + 1}.`);

        // 9. Serialize Updated State (action applied, pending cleared, index incremented)
        const stateAfterHumanAction = game.getCurrentSerializableState();
        console.log("Serialized state after human action."); // Keep log brief

        // 10. Save Updated State
        await saveGameData(gameId, stateAfterHumanAction);
        console.log("Updated game state saved.");

        // 11. Trigger Game Advancement (will run step for the *next* index)
        console.log("Triggering game advancement...");
        return await advanceGameStateAction(gameId);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error submitting human action";
        console.error("Error in submitHumanAction:", message, error);
        return { error: message };
    }
}

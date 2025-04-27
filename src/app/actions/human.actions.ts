"use server";

import type { HumanActionPayload } from "@/lib/interfaces/actions.types";
import type { FilteredGameState } from "@/lib/interfaces/gameState.types"; // Use correct path
import { advanceGameStateAction } from "./gameplay.actions";
import { loadGameData, saveGameData } from '@/lib/persistence'; // Assuming persistence functions
import { Game } from '@/lib/engine/core/Game'; // Use engine Game class
import { RoleName } from '@/lib/engine/interfaces/IRole';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';

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
        console.log("Loaded game state:", loadedState);

        // 2. Verify Pending Action
        const pending = loadedState.pendingHumanAction;
        if (!pending) {
            console.warn(`SubmitHumanAction: No pending human action for game ${gameId}. Ignoring.`);
            // Attempt to advance state anyway, in case the load was slightly stale
            // return filterGameStateForClient(loadedState); // Return current state
             return await advanceGameStateAction(gameId);
        }

        // Ensure the submitted action type is one of the allowed ones
        if (!pending.allowedActions.includes(payload.type)) {
             return { error: `Invalid action type submitted. Expected one of ${pending.allowedActions.join(', ')}, got ${payload.type}` };
        }
        console.log("Pending action verified.");

        // 3. Rehydrate game instance
        const game = Game.loadFromState(loadedState); // Use static method
        console.log("Game rehydrated.");

        // 4. Find human player
        const humanPlayerId = loadedState.humanPlayerId;
        if (!humanPlayerId) {
             throw new Error("Human player ID not found in game state.");
        }
        const humanPlayer = game.getPlayer(humanPlayerId); // Use game method
        if (!humanPlayer) {
            throw new Error(`Human player with ID ${humanPlayerId} not found in rehydrated game.`);
        }
        console.log("Human player found:", humanPlayerId);

        // 5. Clear pending action on the *rehydrated game instance*
        game.clearPendingHumanAction(); // Add this method to Game class
        console.log("Pending human action cleared in game instance.");


        // 6. Apply Human Action to Game State (using Game methods)
        console.log(`Applying human action: ${payload.type}`);
        switch (payload.type) {
            case "message":
                if (typeof payload.content === 'string') {
                    // Determine visibility based on phase/role if needed
                    const visibility = game.getCurrentPhaseType() === 'Night' && humanPlayer.role.name === RoleName.Mafia
                        ? MessageVisibility.Mafia
                        : MessageVisibility.Public;
                    game.logMessage(humanPlayerId, payload.content, visibility); // Use game method
                } else {
                     throw new Error("Invalid payload for message action: content missing or not string.");
                }
                break;
            case "vote":
                 // Vote action just records intent. DayPhase processes votes.
                 if (payload.targetPlayerId === undefined) { // Check if targetPlayerId is missing or null (null might be valid for abstain)
                      throw new Error("Invalid payload for vote action: targetPlayerId missing.");
                 }
                 game.recordHumanVote(humanPlayerId, payload.targetPlayerId); // Add this method to Game
                break;
            // Handle night actions similarly - record intent for NightPhase to process
            case "mafiaKill":
                 if (typeof payload.targetPlayerId !== 'string') throw new Error("Invalid mafiaKill payload: targetPlayerId must be a string.");
                 game.recordHumanNightAction(humanPlayerId, payload); // Add this method to Game
                 break;
            case "doctorSave":
                 // targetPlayerId can be null here
                 if (payload.targetPlayerId !== null && typeof payload.targetPlayerId !== 'string') throw new Error("Invalid doctorSave payload: targetPlayerId must be string or null.");
                 game.recordHumanNightAction(humanPlayerId, payload);
                 break;
            case "seerInvestigate":
                 // targetPlayerId can be null here (maybe? or should it always require a target?)
                  if (payload.targetPlayerId === undefined || payload.targetPlayerId === null) throw new Error("Invalid seerInvestigate payload: targetPlayerId is required.");
                 game.recordHumanNightAction(humanPlayerId, payload);
                 break;
            default:
                // Ensure type safety for exhaustiveness check
                const exhaustiveCheck: never = payload.type;
                console.warn(`Unsupported human action type: ${exhaustiveCheck}`);
                 throw new Error(`Unsupported human action type: ${exhaustiveCheck}`);

        }
        console.log("Human action applied to game state.");

        // 7. Serialize Intermediate State
        const stateWithHumanAction = game.getCurrentSerializableState(); // Get updated state from game
        console.log("Serialized intermediate state:"); // Keep log brief

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

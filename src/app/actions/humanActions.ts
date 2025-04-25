"use server";

import { gameStateManager } from "@/lib/state/gameStateManager";
import type { GameState, PendingHumanAction } from "@/lib/types/game";
import { revalidatePath } from "next/cache";
import { runGameTurnAction } from "./gameTurn"; // Assuming gameTurn action is in the same directory or adjust path
import crypto from "node:crypto";

// Define the payload types the human can submit
type HumanActionPayload =
  | { type: "chat"; content: string }
  | { type: "vote"; targetPlayerId: string }
  | { type: "nightAction"; targetPlayerId: string }; // Extend as needed for different night actions

export async function submitHumanAction(
  gameId: string,
  payload: HumanActionPayload,
) {
  console.log(`[${gameId}] Received human action:`, payload);

  const currentState = await gameStateManager.getGameState(gameId);

  // Add detailed logging right after fetching state
  console.log(`[${gameId}] Fetched state in submitHumanAction. Phase: ${currentState?.phase}, Pending Action:`, currentState?.pendingHumanAction);

  if (!currentState) {
    console.error(`[${gameId}] submitHumanAction: Game state is null or undefined after fetch!`);
    throw new Error(`Game state not found for gameId: ${gameId}`);
  }

  const humanPlayerId = currentState.humanPlayerId;
  if (!humanPlayerId) {
    throw new Error(`No human player ID found in game state for ${gameId}`);
  }

  // --- Validation ---
  if (!currentState.pendingHumanAction) {
    // Log the state again specifically in this branch
    console.warn(`[${gameId}] submitHumanAction: No pending action found in fetched state. State:`, currentState);
    console.warn(`[${gameId}] Received human action but none was pending.`);
    // Optional: Could throw an error, or just ignore and revalidate
    revalidatePath(`/game/${gameId}`);
    return; // Ignore the action if none is pending
  }

  // Validate action type against pending action type and phase
  const expectedActionType = currentState.pendingHumanAction.type;
  const currentPhase = currentState.phase;

  // Basic type match validation (can be expanded with phase checks)
  if (payload.type !== expectedActionType) {
     console.error(
       `[${gameId}] Mismatched action type. Expected ${expectedActionType}, got ${payload.type}. Pending:`, currentState.pendingHumanAction
     );
     throw new Error(
       `Invalid action type submitted. Expected ${expectedActionType}.`,
     );
  }

  // --- State Update ---
  let updatedState: GameState = { ...currentState };

  try {
    switch (payload.type) {
      case "chat": {
        // Validate phase if needed (e.g., allow chat only during Day Intro/Discussion)
        if (!["Day Introductions", "DayDiscussion"].includes(currentPhase)) {
           throw new Error(`Chat action not allowed during phase: ${currentPhase}`);
        }
        const chatMessage = {
          messageId: `msg-${crypto.randomUUID()}`,
          gameId: gameId,
          speaker: { type: "player" as const, playerId: humanPlayerId },
          speakerName: currentState.players[humanPlayerId]?.name || "Human Player",
          content: payload.content,
          timestamp: Date.now(),
          round: currentState.round,
          phase: currentState.phase,
          audience: { type: "all" as const },
        };
        updatedState = {
          ...updatedState,
          conversationLog: [...updatedState.conversationLog, chatMessage],
          turnOrderIndex: updatedState.turnOrderIndex + 1, // Advance turn index after human chat
        };
        console.log(`[${gameId}] Human chat message added.`);
        break;
      }

      case "vote": {
         if (currentPhase !== "Voting") {
             throw new Error(`Vote action not allowed during phase: ${currentPhase}`);
         }
         if (!currentState.livingPlayerIds.includes(payload.targetPlayerId)) {
             throw new Error(`Invalid vote target: ${payload.targetPlayerId} is not alive.`);
         }
         if (payload.targetPlayerId === humanPlayerId) {
             throw new Error("Cannot vote for yourself.");
         }
         const newVote = {
             voterPlayerId: humanPlayerId,
             targetPlayerId: payload.targetPlayerId,
         };
         // Add vote, potentially check if all votes are in
         updatedState = {
           ...updatedState,
           votes: [...updatedState.votes, newVote],
           // We might need logic here or in runGameTurn to check if all votes are cast
         };
         console.log(`[${gameId}] Human vote for ${payload.targetPlayerId} recorded.`);
         break;
      }

      case "nightAction": {
         if (currentPhase !== "Night") {
           throw new Error(`Night action not allowed during phase: ${currentPhase}`);
         }
         const humanRole = currentState.players[humanPlayerId]?.role;
         if (!humanRole || !["Seer", "Doctor", "Werewolf"].includes(humanRole)) {
            throw new Error(`Human player role (${humanRole}) cannot perform night action.`);
         }
         if (!currentState.livingPlayerIds.includes(payload.targetPlayerId)) {
             throw new Error(`Invalid night action target: ${payload.targetPlayerId} is not alive.`);
         }
         // TODO: Add role-specific target validation (e.g., Seer can't target self)

         let actionType: "seer_investigation" | "doctor_save" | "werewolf_kill" | null = null;
         if (humanRole === "Seer") actionType = "seer_investigation";
         else if (humanRole === "Doctor") actionType = "doctor_save";
         // Note: Werewolf kill is usually a pack decision, handle human werewolf preference differently if needed.
         // For now, assume human werewolf acts like others for preference.
         else if (humanRole === "Werewolf") actionType = "werewolf_kill"; // Or a preference type

         if (!actionType) {
            throw new Error("Could not determine night action type for human role.");
         }

         const newNightAction = {
           type: actionType,
           actingPlayerId: humanPlayerId,
           targetPlayerId: payload.targetPlayerId,
         };
         updatedState = {
           ...updatedState,
           nightActions: [...updatedState.nightActions, newNightAction],
           // Need logic to check if all night actions are submitted
         };
         console.log(`[${gameId}] Human night action (${actionType}) for ${payload.targetPlayerId} recorded.`);
         break;
      }

      default: {
        console.error("Unhandled human action payload type:", payload);
        throw new Error("Invalid human action type.");
      }
    }

    // Clear pending action and update timestamp
    updatedState = {
      ...updatedState,
      pendingHumanAction: null,
      updatedAt: Date.now(),
    };

    // Save the updated state
    await gameStateManager.updateGameState(gameId, updatedState);
    console.log(`[${gameId}] Game state updated after human action.`);

    // Revalidate path *before* potentially long-running next turn action
    revalidatePath(`/game/${gameId}`);

  } catch (error) {
    console.error(`[${gameId}] Error processing human action:`, error);
    // Revalidate path even on error to show potential issues?
    revalidatePath(`/game/${gameId}`);
    // Rethrow the error to be caught by the client if needed
    throw error;
  }
}
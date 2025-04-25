"use server";

import { gameStateManager } from "@/lib/state/gameStateManager";
import type { ChatMessage, GameState } from "@/lib/types/game";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { runGameTurnAction } from "./gameTurn";

// Action for human players to send regular chat messages (e.g., during DayDiscussion)
export async function sendChatMessageAction(
  gameId: string,
  playerId: string,
  messageContent: string,
) {
  console.log(`Received chat message from ${playerId} for game ${gameId}`);

  const currentState = await gameStateManager.getGameState(gameId);
  if (!currentState) {
    throw new Error(`Game state not found for gameId: ${gameId}`);
  }

  const sendingPlayer = currentState.players[playerId];

  // Basic validation
  if (
    !sendingPlayer ||
    sendingPlayer.status !== "alive" ||
    !sendingPlayer.isHuman
  ) {
    throw new Error("Invalid player trying to send message.");
  }

  if (currentState.pendingHumanAction?.type !== "chat") {
    throw new Error("Not the player's turn to chat.");
  }

  if (!messageContent.trim()) {
    throw new Error("Message content cannot be empty.");
  }

  // Construct the message
  const chatMessage: ChatMessage = {
    messageId: `msg-${crypto.randomUUID()}`,
    gameId: gameId,
    speaker: { type: "player", playerId: playerId },
    speakerName: sendingPlayer.name,
    content: messageContent.trim(), // Trim whitespace
    timestamp: Date.now(),
    round: currentState.round,
    phase: currentState.phase,
    audience: { type: "all" }, // Regular chat is for everyone
  };

  // Update game state
  const updatedState: GameState = {
    ...currentState,
    conversationLog: [...currentState.conversationLog, chatMessage],
    // Increment turnOrderIndex AFTER human chat during introductions/discussion
    turnOrderIndex: 
      (currentState.phase === "Day Introductions" || currentState.phase === "DayDiscussion")
      ? currentState.turnOrderIndex + 1 
      : currentState.turnOrderIndex,
    pendingHumanAction: null, // Clear the pending action
    updatedAt: Date.now(),
  };

  await gameStateManager.updateGameState(gameId, updatedState);
  console.log(
    `Chat message from ${sendingPlayer.name} added to game ${gameId}.`,
  );

  // Revalidate path AFTER state update, BEFORE triggering next turn
  revalidatePath(`/game/${gameId}`);

  return { success: true };
}

// Action specifically for human WEREWOLVES to send messages during NIGHT phase
export async function sendWerewolfChatMessageAction(
  gameId: string,
  playerId: string,
  messageContent: string,
) {
  console.log(
    `[${gameId}] Received WEREWOLF chat message from ${playerId}`,
  );

  try {
    const currentState = await gameStateManager.getGameState(gameId);
    if (!currentState) {
      throw new Error(`[${gameId}] Game state not found.`);
    }

    const sendingPlayer = currentState.players[playerId];

    // --- Validation specific to Werewolf chat ---
    if (
      !sendingPlayer ||
      sendingPlayer.status !== "alive" ||
      !sendingPlayer.isHuman ||
      sendingPlayer.role !== "Werewolf"
    ) {
      throw new Error(`[${gameId}] Invalid player attempting Werewolf chat.`);
    }

    if (currentState.phase !== "Night") {
      throw new Error(`[${gameId}] Werewolf chat is only allowed during the Night phase.`);
    }

    // Check if it's the correct point in the night phase for human werewolf input
    if (currentState.pendingHumanAction?.type !== "werewolfChat") {
      console.warn(`[${gameId}] Attempted werewolf chat outside of expected pending action.`);
      throw new Error(`[${gameId}] Not the time for human werewolf chat.`);
    }

    if (!messageContent.trim()) {
      throw new Error(`[${gameId}] Message content cannot be empty.`);
    }
    // --- End Validation ---

    // Construct the werewolf chat message
    const werewolfChatMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-wwchat`,
      gameId: gameId,
      speaker: { type: "player", playerId: playerId },
      speakerName: sendingPlayer.name,
      content: messageContent.trim(),
      timestamp: Date.now(),
      round: currentState.round,
      phase: currentState.phase, // Should be "Night"
      audience: { type: "werewolves" }, // Crucial for identifying werewolf chat
    };

    // Update game state by adding to the _internalState.werewolfChatLog
    const updatedState: GameState = {
      ...currentState,
      _internalState: {
        ...(currentState._internalState || {}),
        werewolfChatLog: [
          ...(currentState._internalState?.werewolfChatLog || []),
          werewolfChatMessage,
        ],
        // Increment the werewolf chat turn index after human speaks
        werewolfChatTurnIndex: (currentState._internalState?.werewolfChatTurnIndex ?? -1) + 1,
      },
      pendingHumanAction: null, // Clear the pending action
      updatedAt: Date.now(),
    };

    await gameStateManager.updateGameState(gameId, updatedState);
    console.log(
      `[${gameId}] Werewolf chat message from ${sendingPlayer.name} added.`,
    );

    // Revalidate path AFTER state update, BEFORE triggering next turn
    revalidatePath(`/game/${gameId}`);

    return { success: true };

  } catch (error: unknown) {
    console.error(`[${gameId}] Error processing werewolf chat action:`, error);
    // Revalidate path even on error to allow UI to potentially show error state if needed
    revalidatePath(`/game/${gameId}`);
    // Return error object with checked message
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error processing werewolf chat"
    };
  }
} 
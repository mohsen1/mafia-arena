"use server";

import { gameStateManager } from "@/lib/state/gameStateManager";
import type { ChatMessage, GameState } from "@/lib/types/game";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";

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

  // Revalidate path to update UI
  revalidatePath(`/game/${gameId}`);

  // Return success or the updated state if needed
  return { success: true };
}

// Action specifically for human WEREWOLVES to send messages during NIGHT phase
export async function sendWerewolfChatMessageAction(
  gameId: string,
  playerId: string,
  messageContent: string,
) {
  console.log(
    `Received WEREWOLF chat message from ${playerId} for game ${gameId}`,
  );

  const currentState = await gameStateManager.getGameState(gameId);
  if (!currentState) {
    throw new Error(`Game state not found for gameId: ${gameId}`);
  }

  const sendingPlayer = currentState.players[playerId];

  // --- Validation specific to Werewolf chat ---
  if (
    !sendingPlayer ||
    sendingPlayer.status !== "alive" ||
    !sendingPlayer.isHuman ||
    sendingPlayer.role !== "Werewolf"
  ) {
    throw new Error("Invalid player attempting Werewolf chat.");
  }

  if (currentState.phase !== "Night") {
    throw new Error("Werewolf chat is only allowed during the Night phase.");
  }

  // Check if it's the correct point in the night phase for human werewolf input
  // This might need refinement based on exact flow in night.ts
  if (currentState.pendingHumanAction?.type !== "werewolfChat") {
    console.warn("Attempted werewolf chat outside of expected pending action.");
    // Depending on strictness, you might throw an error or just log
     throw new Error("Not the time for human werewolf chat.");
  }

  if (!messageContent.trim()) {
    throw new Error("Message content cannot be empty.");
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
    },
    // NOTE: Do NOT increment turnOrderIndex here.
    // The night phase handler should continue its loop or actions after this.
    pendingHumanAction: null, // Clear the pending action
    updatedAt: Date.now(),
  };

  await gameStateManager.updateGameState(gameId, updatedState);
  console.log(
    `Werewolf chat message from ${sendingPlayer.name} added to game ${gameId}.`,
  );

  // Revalidate path to update UI
  revalidatePath(`/game/${gameId}`);

  return { success: true };
} 
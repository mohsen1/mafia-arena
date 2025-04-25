"use server";

import { gameStateManager } from "@/lib/state/gameStateManager";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import type { ChatMessage, GameState } from "@/lib/types/game";
import { handleDayIntroductionsPhase } from "./phases/dayIntroductions";
import { handleDayDiscussionPhase } from "./phases/dayDiscussion";
import { handleVotingPhase } from "./phases/voting";
import { handleNightPhase } from "./phases/night";
import { handleResolveNightPhase } from "./phases/resolveNight";

/**
 * Adds welcome message to new games at the start of Day Introductions
 */
async function addWelcomeMessageIfNeeded(gameState: GameState, gameId: string): Promise<GameState> {
  if (
    gameState.round === 1 &&
    gameState.phase === "Day Introductions" &&
    gameState.turnOrderIndex === 0 &&
    gameState.conversationLog.length === 0
  ) {
    const originalWelcomeMsg = `Welcome to "${
      gameState.title || "Werewolf AI"
    }"! ${gameState.livingPlayerIds.length} players have gathered. The first phase is introductions. Each player will briefly introduce themselves.`;
    
    const welcomeMessage: ChatMessage = {
      messageId: `msg-${crypto.randomUUID()}-init`,
      gameId,
      speaker: { type: "moderator" },
      speakerName: "Moderator",
      content: originalWelcomeMsg,
      timestamp: Date.now() - 1000,
      round: gameState.round,
      phase: gameState.phase,
      audience: { type: "all" },
      phraseKey: "WelcomeMessage",
      placeholders: {
        gameTitle: gameState.title || "Werewolf AI",
        playerCount: gameState.livingPlayerIds.length,
      },
    };

    const stateWithWelcome = {
      ...gameState,
      conversationLog: [...gameState.conversationLog, welcomeMessage],
      updatedAt: Date.now(),
    };
    
    await gameStateManager.updateGameState(gameId, stateWithWelcome);
    console.log(`[${gameId}] Added welcome message.`);
    return stateWithWelcome;
  }
  
  return gameState;
}

// Main action to run the next turn or step in the game
export async function runGameTurnAction(gameId: string) {
  console.log(`[${gameId}] Entering runGameTurnAction...`);

  // Fetch the latest game state
  let currentState = await gameStateManager.getGameState(gameId);
  if (!currentState) {
    throw new Error(`Game state not found for gameId: ${gameId}`);
  }

  // Check if game is already over
  if (currentState.phase === "GameOver") {
    console.log(`Game ${gameId} is already over.`);
    return;
  }

  // Add welcome message for new games
  currentState = await addWelcomeMessageIfNeeded(currentState, gameId);

  // Dispatch to the appropriate phase handler
  try {
    switch (currentState.phase) {
      case "Day Introductions":
        console.log(`[${gameId}] Calling handleDayIntroductionsPhase.`);
        await handleDayIntroductionsPhase(currentState, gameId);
        break;
        
      case "DayDiscussion":
        console.log(`[${gameId}] Calling handleDayDiscussionPhase.`);
        await handleDayDiscussionPhase(currentState, gameId);
        break;
        
      case "Voting":
        console.log(`[${gameId}] Calling handleVotingPhase.`);
        await handleVotingPhase(currentState, gameId);
        break;
        
      case "Night":
        console.log(`[${gameId}] Calling handleNightPhase.`);
        await handleNightPhase(currentState, gameId);
        break;
        
      case "ResolveNight":
        console.log(`[${gameId}] Calling handleResolveNightPhase.`);
        await handleResolveNightPhase(currentState, gameId);
        break;
        
      default:
        console.warn(
          `Unexpected game phase: ${currentState.phase}. Taking no action.`
        );
        break;
    }
  } catch (error) {
    console.error(`Error processing ${currentState.phase} phase for game ${gameId}:`, error);
    // TODO: Consider adding error recovery logic here
  }
}



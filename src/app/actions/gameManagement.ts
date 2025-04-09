'use server';

import { gameStateManager } from "@/lib/state/gameStateManager";
import { revalidatePath } from "next/cache";

/**
 * Deletes a game state file.
 * @param gameId The ID of the game to delete.
 */
export async function deleteGameAction(gameId: string): Promise<void> {
  console.log(`Attempting to delete game: ${gameId}`);
  try {
    await gameStateManager.deleteGame(gameId);
    console.log(`Game ${gameId} deleted successfully.`);
    revalidatePath("/"); // Revalidate the home page (or wherever games are listed)
  } catch (error) {
    console.error(`Failed to delete game ${gameId}:`, error);
    // Rethrow or handle as appropriate for your UI
    throw new Error(`Could not delete game ${gameId}.`);
  }
} 
'use server';

import { revalidatePath } from 'next/cache';
import { deleteGameData } from '@/lib/persistence'; // Assuming persistence function

// Removed placeholder function
// const deleteGameData = async (gameId: string): Promise<boolean> => {
//     console.log(`deleteGameData called for gameId: ${gameId}`);
//     // Placeholder implementation - return true if "deleted", false if not found/error
//     return gameId !== "fail-delete";
// };

export async function deleteGameAction(
  gameId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await deleteGameData(gameId);
    revalidatePath('/');
    revalidatePath(`/game/${gameId}`);
    return { success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error deleting game';
    console.error('Error in deleteGameAction:', message, error);
    return { success: false, error: message };
  }
}

"use server";

import { revalidatePath } from "next/cache";
// TODO: Import deleteGameData function
// import { deleteGameData } from "@/lib/db/gameData";

// Placeholder function
const deleteGameData = async (gameId: string): Promise<boolean> => {
    console.log(`deleteGameData called for gameId: ${gameId}`);
    // Placeholder implementation - return true if "deleted", false if not found/error
    return gameId !== "fail-delete";
};

export async function deleteGameAction(gameId: string): Promise<{ success: boolean; error?: string }> {
    console.log(`deleteGameAction called for gameId: ${gameId}`);
    try {
        const success = await deleteGameData(gameId);
        if (success) {
            console.log(`Game ${gameId} deleted successfully.`);
            revalidatePath('/'); // Revalidate home page or relevant game list page
            revalidatePath(`/game/${gameId}`); // Revalidate the specific game page if it exists
            return { success: true };
        } else {
            console.warn(`Game ${gameId} could not be deleted (not found or error).`);
            return { success: false, error: "Game not found or could not be deleted." };
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error deleting game";
        console.error("Error in deleteGameAction:", message, error);
        return { success: false, error: message };
    }
}

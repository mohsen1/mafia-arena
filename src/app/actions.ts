'use server'; // Mark all functions in this file as Server Actions

import { redirect } from 'next/navigation';
import { initializeNewGame } from '@/lib/game/engine';
import { gameStateManager } from '@/lib/state/gameStateManager';
import { DEFAULT_GAME_SETTINGS, calculateNumPlayers } from '@/lib/config';
import { GameSettings, GameState } from '@/lib/types/game';
import crypto from 'crypto'; // Needed for temp ID/timestamp

/**
 * Server Action to create a new Werewolf game.
 * Initializes the game state using default settings and persists it.
 * Redirects the client to the game page upon successful creation.
 * Throws an error if creation fails.
 * 
 * @param formData - Optional FormData, currently unused but expected by form actions.
 */
export async function startGameAction(formData?: FormData) {
    console.log("startGameAction triggered...");

    try {
        // 1. Determine settings
        const numPlayers = calculateNumPlayers(DEFAULT_GAME_SETTINGS.roleDistribution);
        const settings: GameSettings = {
            ...DEFAULT_GAME_SETTINGS,
            numPlayers: numPlayers,
        };

        // 2. Initialize the *full* game state using the engine
        // Need temporary ID and timestamp for initializeNewGame signature,
        // gameStateManager.createGame will overwrite them with final ones.
        const tempGameId = `temp-${crypto.randomUUID()}`;
        const tempCreatedAt = Date.now();
        const initialGameState: GameState = initializeNewGame(settings, tempGameId, tempCreatedAt);

        // 3. Create and persist the game using the manager
        // Pass the engine-initialized state (excluding the final gameId/createdAt)
        const { gameId: _, createdAt: __, ...stateToCreate } = initialGameState;
        const newGame = await gameStateManager.createGame(stateToCreate);
        const gameId = newGame.gameId; // Store the final gameId for redirection

        console.log(`Game created successfully with ID: ${gameId}`);

        // 4. Redirect if successful (must be last step in try block)
        redirect(`/game/${gameId}`);

    } catch (error) {
        // NEXT_REDIRECT is a special error thrown by redirect(), allow it to propagate
        if (typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
             throw error;
        }

        console.error("Failed to start game:", error);
        // Re-throw other errors to be handled by Next.js or an error boundary
        if (error instanceof Error) {
            throw new Error(`Failed to start game: ${error.message}`);
        } else {
            throw new Error("An unknown error occurred while starting the game.");
        }
    }
}

// Placeholder for future actions
// export async function runGameTurnAction(gameId: string): Promise<void> { ... }
// export async function getFilteredGameStateAction(gameId: string): Promise<FilteredGameState | null> { ... } 
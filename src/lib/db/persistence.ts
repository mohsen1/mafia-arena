import type { SerializableGameState } from '@/lib/interfaces/persistence.types';
import { GameService } from './game.service';

/**
 * Database-based persistence service that replaces file-based storage
 * Maintains the same interface as the original persistence.ts for backward compatibility
 */

/**
 * Loads game state from the database
 * @param gameId The ID of the game to load
 * @returns The loaded SerializableGameState or null if not found
 */
export async function loadGameData(
  gameId: string
): Promise<SerializableGameState | null> {
  try {
    return await GameService.loadGameData(gameId);
  } catch (error) {
    console.error(`Failed to load game data for ${gameId}:`, error);
    throw new Error(
      `Failed to load game data: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Saves game state to the database
 * @param gameId The ID of the game to save
 * @param gameState The game state object to save
 */
export async function saveGameData(
  gameId: string,
  gameState: SerializableGameState
): Promise<void> {
  try {
    await GameService.saveGameData(gameId, gameState);
  } catch (error) {
    console.error(`Failed to save game data for ${gameId}:`, error);
    throw new Error(
      `Failed to save game data: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Deletes a game from the database
 * @param gameId The ID of the game to delete
 */
export async function deleteGameData(gameId: string): Promise<void> {
  try {
    await GameService.deleteGameData(gameId);
  } catch (error) {
    console.error(`Failed to delete game data for ${gameId}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to delete game data: ${message}`);
  }
}

/**
 * Lists available game save IDs
 * @returns An array of game IDs
 */
export async function listSavedGames(): Promise<string[]> {
  try {
    return await GameService.listSavedGames();
  } catch (error) {
    console.error('Failed to list saved games:', error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list saved games: ${message}`);
  }
}

/**
 * Creates a new game in the database
 * @param gameState The initial game state
 * @param ownerId The user ID of the game owner
 * @param title Optional game title
 */
export async function createGameData(
  gameState: SerializableGameState,
  ownerId: string,
  title?: string
): Promise<void> {
  console.log('[createGameData] Starting database save:', {
    gameId: gameState.gameId,
    ownerId,
    phase: gameState.phase,
    playerCount: Object.keys(gameState.players).length,
    voiceModeEnabled: gameState.voiceModeEnabled,
    hasVoiceMode: 'voiceModeEnabled' in gameState,
  });

  try {
    await GameService.createGame(gameState, ownerId, title);
    console.log('[createGameData] Game saved successfully to database');
  } catch (error) {
    console.error('[createGameData] Database error:', error);

    // Check for foreign key constraint error
    if (error instanceof Error) {
      if (error.message.includes('games_owner_id_user_id_fk')) {
        throw new Error(
          `User account not found. Please ensure you are logged in with a valid account. (User ID: ${ownerId})`
        );
      }
    }

    throw error;
  }
}

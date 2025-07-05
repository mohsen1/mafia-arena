'use server';

// Use updated types and persistence functions
import type { FilteredGameState } from '@/lib/interfaces/gameState.types'; // Use gameState.types
import { loadGameData, saveGameData } from '@/lib/db/persistence'; // Assuming persistence functions
import { Game } from '@/lib/engine/core/Game'; // For loadFromState
// import { GameOverPhase } from '@/lib/engine/phases/GameOverPhase'; // No longer needed here
import { filterGameStateForClient } from '@/lib/visibilityHelper'; // Use the helper
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { GameService } from '@/lib/db/game.service';

export async function advanceGameStateAction(
  gameId: string
): Promise<FilteredGameState | { error: string }> {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: 'Authentication required' };
    }

    // Check if user owns the game
    const isOwner = await GameService.isGameOwner(gameId, session.user.id);
    if (!isOwner) {
      return { error: "You don't have permission to modify this game" };
    }

    const gameState = await loadGameData(gameId);
    if (!gameState) {
      return { error: 'Game not found' };
    }

    const game = await Game.loadFromState(gameState);
    await game.runSingleStep();

    const newState = game.getCurrentSerializableState(
      game.getPendingHumanAction()
    );
    // Preserve voiceModeEnabled from original state
    newState.voiceModeEnabled = gameState.voiceModeEnabled;
    await saveGameData(gameId, newState);

    const filteredState = filterGameStateForClient(
      newState,
      newState.humanPlayerId
    );
    return filteredState;
  } catch (error) {
    console.error('Error advancing game state:', error);
    return {
      error:
        error instanceof Error ? error.message : 'Failed to advance game state',
    };
  }
}

export async function getGameStateAction(
  gameId: string
): Promise<FilteredGameState | { error: string }> {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { error: 'Authentication required' };
    }

    // Check if user owns the game
    const isOwner = await GameService.isGameOwner(gameId, session.user.id);
    if (!isOwner) {
      return { error: "You don't have permission to view this game" };
    }

    const gameState = await loadGameData(gameId);
    if (!gameState) {
      return { error: 'Game not found' };
    }

    const filteredState = filterGameStateForClient(
      gameState,
      gameState.humanPlayerId
    );
    return filteredState;
  } catch (error) {
    console.error('Error getting game state:', error);
    return {
      error:
        error instanceof Error ? error.message : 'Failed to get game state',
    };
  }
}

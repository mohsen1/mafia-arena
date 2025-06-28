'use server';

import { Game } from '@/lib/engine/core/Game';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import { loadGameData, saveGameData } from '@/lib/db/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { GameService } from '@/lib/db/game.service';
import type { PlayerAction } from '@/lib/engine/interfaces/IAgent';

export async function submitHumanAction(
  gameId: string,
  humanActionPayload: HumanActionPayload
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

    if (!gameState.pendingHumanAction) {
      return { error: 'No pending human action found' };
    }

    const game = Game.loadFromState(gameState);
    const currentPhase = game.getCurrentPhase();

    // Convert HumanActionPayload to PlayerAction
    let playerAction: PlayerAction;

    switch (humanActionPayload.type) {
      case 'vote':
        if (!gameState.pendingHumanAction.allowedActions.includes('vote')) {
          return { error: 'Vote action not allowed' };
        }
        playerAction = {
          type: 'vote',
          targetPlayerId: humanActionPayload.targetPlayerId || null,
        };
        break;

      case 'message':
        if (!gameState.pendingHumanAction.allowedActions.includes('message')) {
          return { error: 'Message action not allowed' };
        }
        if (!humanActionPayload.content) {
          return { error: 'Message content is required' };
        }
        playerAction = {
          type: 'message',
          content: humanActionPayload.content,
        };
        break;

      case 'mafiaKill':
        if (
          !gameState.pendingHumanAction.allowedActions.includes('mafiaKill')
        ) {
          return { error: 'Mafia kill action not allowed' };
        }
        if (!humanActionPayload.targetPlayerId) {
          return { error: 'Target player ID is required for mafia kill' };
        }
        playerAction = {
          type: 'mafiaKill',
          targetPlayerId: humanActionPayload.targetPlayerId,
        };
        break;

      case 'doctorSave':
        if (
          !gameState.pendingHumanAction.allowedActions.includes('doctorSave')
        ) {
          return { error: 'Doctor save action not allowed' };
        }
        playerAction = {
          type: 'doctorSave',
          targetPlayerId: humanActionPayload.targetPlayerId || null,
        };
        break;

      case 'seerInvestigate':
        if (
          !gameState.pendingHumanAction.allowedActions.includes(
            'seerInvestigate'
          )
        ) {
          return { error: 'Seer investigate action not allowed' };
        }
        playerAction = {
          type: 'seerInvestigate',
          targetPlayerId: humanActionPayload.targetPlayerId || null,
        };
        break;

      default:
        return { error: `Unknown action type: ${humanActionPayload.type}` };
    }

    // Process the action through the current phase's processAction method
    if (
      'processAction' in currentPhase &&
      typeof currentPhase.processAction === 'function'
    ) {
      currentPhase.processAction(
        game,
        humanActionPayload.playerId,
        playerAction
      );
    } else {
      console.warn(
        `Current phase ${currentPhase.type} does not have a processAction method`
      );
      return { error: 'Cannot process action in current phase' };
    }

    // Advance to the next player
    const currentIndex = game.getNextPlayerIndexToAction();
    game.setNextPlayerIndexToAction(currentIndex + 1);

    // Clear the pending human action
    game.clearPendingHumanAction();

    const intermediateState = game.getCurrentSerializableState(
      game.getPendingHumanAction()
    );
    await saveGameData(gameId, intermediateState);

    // Continue game loop after human action
    await game.runSingleStep();

    const finalState = game.getCurrentSerializableState(
      game.getPendingHumanAction()
    );
    await saveGameData(gameId, finalState);

    const filteredState = filterGameStateForClient(
      finalState,
      finalState.humanPlayerId
    );
    return filteredState;
  } catch (error) {
    console.error('Error submitting human action:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to submit action',
    };
  }
}

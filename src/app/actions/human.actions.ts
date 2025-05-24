"use server";

import { Game } from '@/lib/engine/core/Game';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import { loadGameData, saveGameData } from '@/lib/db/persistence';
import { filterGameStateForClient } from '@/lib/visibilityHelper';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { GameService } from '@/lib/db/game.service';

export async function submitHumanAction(
    gameId: string, 
    humanActionPayload: HumanActionPayload
): Promise<FilteredGameState | { error: string }> {
    try {
        // Check authentication
        const session = await getServerSession(authOptions);
        if (!session?.user?.id) {
            return { error: "Authentication required" };
        }

        // Check if user owns the game
        const isOwner = await GameService.isGameOwner(gameId, session.user.id);
        if (!isOwner) {
            return { error: "You don't have permission to modify this game" };
        }

        const gameState = await loadGameData(gameId);
        if (!gameState) {
            return { error: "Game not found" };
        }

        if (!gameState.pendingHumanAction) {
            return { error: "No pending human action found" };
        }

        const game = Game.loadFromState(gameState);

        // Submit the human action based on type
        switch (humanActionPayload.type) {
            case 'vote':
                if (!gameState.pendingHumanAction.allowedActions.includes('vote')) {
                    return { error: "Vote action not allowed" };
                }
                game.recordHumanVote(humanActionPayload.playerId, humanActionPayload.targetPlayerId || null);
                break;

            case 'message':
                if (!gameState.pendingHumanAction.allowedActions.includes('message')) {
                    return { error: "Message action not allowed" };
                }
                if (!humanActionPayload.content) {
                    return { error: "Message content is required" };
                }
                // For message actions, we'll use the human night action method with the content
                game.recordHumanNightAction(humanActionPayload.playerId, humanActionPayload);
                break;

            case 'mafiaKill':
                if (!gameState.pendingHumanAction.allowedActions.includes('mafiaKill')) {
                    return { error: "Mafia kill action not allowed" };
                }
                game.recordHumanNightAction(humanActionPayload.playerId, humanActionPayload);
                break;

            case 'doctorSave':
                if (!gameState.pendingHumanAction.allowedActions.includes('doctorSave')) {
                    return { error: "Doctor save action not allowed" };
                }
                game.recordHumanNightAction(humanActionPayload.playerId, humanActionPayload);
                break;

            case 'seerInvestigate':
                if (!gameState.pendingHumanAction.allowedActions.includes('seerInvestigate')) {
                    return { error: "Seer investigate action not allowed" };
                }
                game.recordHumanNightAction(humanActionPayload.playerId, humanActionPayload);
                break;

            default:
                return { error: `Unknown action type: ${humanActionPayload.type}` };
        }

        game.clearPendingHumanAction();

        const intermediateState = game.getCurrentSerializableState();
        await saveGameData(gameId, intermediateState);

        // Continue game loop after human action
        await game.runGameLoop();

        const finalState = game.getCurrentSerializableState();
        await saveGameData(gameId, finalState);

        const filteredState = filterGameStateForClient(finalState, finalState.humanPlayerId);
        return filteredState;

    } catch (error) {
        console.error('Error submitting human action:', error);
        return { error: error instanceof Error ? error.message : 'Failed to submit action' };
    }
}

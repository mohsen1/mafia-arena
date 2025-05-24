"use server";

import type { HumanActionPayload } from "@/lib/interfaces/actions.types";
import type { FilteredGameState } from "@/lib/interfaces/gameState.types";
import { advanceGameStateAction } from "./gameplay.actions";
import { loadGameData, saveGameData } from '@/lib/persistence';
import { Game } from '@/lib/engine/core/Game';
import type { IGamePhase } from '@/lib/engine/interfaces/IGamePhase';
import type { PlayerAction } from '@/lib/engine/interfaces/IAgent';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';

interface ProcessablePhase extends IGamePhase {
  processAction(game: Game, playerId: PlayerId, action: PlayerAction): void;
}

function hasProcessAction(phase: IGamePhase): phase is ProcessablePhase {
  return typeof (phase as ProcessablePhase).processAction === 'function';
}

export async function submitHumanAction(
    gameId: string,
    payload: HumanActionPayload
): Promise<FilteredGameState | { error: string }> {
    try {
        const loadedState = await loadGameData(gameId);
        if (!loadedState) {
            throw new Error(`Game not found: ${gameId}`);
        }

        const pending = loadedState.pendingHumanAction;
        if (!pending) {
             return await advanceGameStateAction(gameId);
        }
         if (pending.playerId !== payload.playerId) {
             return { error: `Action submitted by wrong player. Expected ${pending.playerId}, got ${payload.playerId}` };
         }
        if (!pending.allowedActions.includes(payload.type)) {
             return { error: `Invalid action type submitted. Expected one of ${pending.allowedActions.join(', ')}, got ${payload.type}` };
        }

        const game = Game.loadFromState(loadedState);

        const humanPlayerId = pending.playerId;

        const currentPhaseInstance = game.getCurrentPhase();
        if (!currentPhaseInstance) {
            throw new Error(`Could not get phase instance for phase ${game.getCurrentPhaseType()}`);
        }
        if (!hasProcessAction(currentPhaseInstance)) {
            throw new Error(`Phase ${game.getCurrentPhaseType()} does not have a processAction method.`);
        }
        
        let playerAction: PlayerAction;
        switch (payload.type) {
            case 'message':
                playerAction = { type: 'message', content: payload.content || '' };
                break;
            case 'vote':
                playerAction = { type: 'vote', targetPlayerId: payload.targetPlayerId || null };
                break;
            case 'mafiaKill':
                playerAction = { type: 'mafiaKill', targetPlayerId: payload.targetPlayerId || '' };
                break;
            case 'doctorSave':
                playerAction = { type: 'doctorSave', targetPlayerId: payload.targetPlayerId || null };
                break;
            case 'seerInvestigate':
                playerAction = { type: 'seerInvestigate', targetPlayerId: payload.targetPlayerId || null };
                break;
            default:
                throw new Error(`Unsupported action type: ${payload.type}`);
        }
        
        currentPhaseInstance.processAction(game, humanPlayerId, playerAction);

        game.clearPendingHumanAction();

        const currentIndex = game.getNextPlayerIndexToAction();
        game.setNextPlayerIndexToAction(currentIndex + 1);

        const stateAfterHumanAction = game.getCurrentSerializableState();

        await saveGameData(gameId, stateAfterHumanAction);

        return await advanceGameStateAction(gameId);

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error submitting human action";
        console.error("Error in submitHumanAction:", message, error);
        return { error: message };
    }
}

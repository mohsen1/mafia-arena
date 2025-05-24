import { use } from 'react';
import { advanceGameStateAction } from "@/app/actions/gameplay.actions";
import { submitHumanAction } from "@/app/actions/human.actions";
import { loadGameData as loadPersistedGameData } from "@/lib/persistence";
import { filterGameStateForClient } from "@/lib/visibilityHelper";
import type { FilteredGameState } from "@/lib/interfaces/gameState.types";

const loadGameData = async (gameId: string): Promise<FilteredGameState | null> => {
    try {
        const persistedState = await loadPersistedGameData(gameId);
        if (!persistedState) {
            return null;
        }
        
        const filteredState = filterGameStateForClient(persistedState, persistedState.humanPlayerId);
        return filteredState;
    } catch (error) {
        console.error(`Error loading game ${gameId}:`, error);
        return null;
    }
};

import { notFound } from "next/navigation";
import GameClient from "./GameClient";
import type { LanguageCode } from "@/lib/i18n/settings";

interface GamePageProps {
  params: Promise<{ gameId: string; lang: LanguageCode }>;
}

export default function GamePage({ params: paramsPromise }: GamePageProps) {
  const params = use(paramsPromise);
  const { gameId, lang } = params;
  
  const initialGameState = use(loadGameData(gameId));

  if (!initialGameState) {
    notFound();
  }

  const boundAdvanceGameStateAction = advanceGameStateAction.bind(null, gameId);
  const boundSubmitHumanAction = submitHumanAction.bind(null, gameId); 

  return (
    <GameClient
      initialGameState={initialGameState}
      gameId={gameId}
      lang={lang}
      boundAdvanceGameStateAction={boundAdvanceGameStateAction}
      boundSubmitHumanAction={boundSubmitHumanAction} 
    />
  );
}

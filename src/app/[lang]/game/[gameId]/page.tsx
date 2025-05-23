// Remove old action/state manager imports
// import { runGameTurnAction } from "@/app/actions/index";
// import { submitHumanAction } from "@/app/actions/humanActions";
// import { gameStateManager } from "@/lib/state/gameStateManager";

import { use } from 'react';

// Import new actions
import { advanceGameStateAction } from "@/app/actions/gameplay.actions";
import { submitHumanAction } from "@/app/actions/human.actions";

// Import proper game loading functionality
import { loadGameData as loadPersistedGameData } from "@/lib/persistence";
import { filterGameStateForClient } from "@/lib/visibilityHelper";
import type { FilteredGameState } from "@/lib/interfaces/gameState.types";

// Proper loadGameData function that loads from persistence and filters for client
const loadGameData = async (gameId: string): Promise<FilteredGameState | null> => {
    console.log(`Loading game data for ${gameId}`);
    try {
        const persistedState = await loadPersistedGameData(gameId);
        if (!persistedState) {
            console.log(`No persisted game found for ${gameId}`);
            return null;
        }
        
        // Filter the state for client consumption
        const filteredState = filterGameStateForClient(persistedState, persistedState.humanPlayerId);
        console.log(`Successfully loaded game ${gameId} - Phase: ${filteredState.phase}, Round: ${filteredState.round}, Players: ${Object.keys(filteredState.players).length}`);
        return filteredState;
    } catch (error) {
        console.error(`Error loading game ${gameId}:`, error);
        return null;
    }
};

import { notFound } from "next/navigation";
import GameClient from "./GameClient"; // Import the client component
import type { LanguageCode } from "@/lib/i18n/settings";

// Remove i18n imports - no longer needed here
// import { getDictionary } from "@/lib/getDictionary";
// import { dir } from 'i18next';

interface GamePageProps {
  params: Promise<{ gameId: string; lang: LanguageCode }>;
}

export default function GamePage({ params: paramsPromise }: GamePageProps) {
  const params = use(paramsPromise);
  const { gameId, lang } = params;
  
  // Load state using new function - wrapping in use() since loadGameData is async
  const initialGameState = use(loadGameData(gameId));

  if (!initialGameState) {
    notFound();
  }

  // Remove dictionary loading and direction calculation
  // const dictionary = await getDictionary(lang);
  // const direction = dir(lang);

  // Bind the *new* actions here on the server
  const boundAdvanceGameStateAction = advanceGameStateAction.bind(null, gameId);
  const boundSubmitHumanAction = submitHumanAction.bind(null, gameId); 

  // Pass initial state and bound actions to GameClient
  return (
    <GameClient
      initialGameState={initialGameState} // Pass the loaded state
      gameId={gameId}
      lang={lang} // Pass lang
      // Pass the correctly bound actions
      boundAdvanceGameStateAction={boundAdvanceGameStateAction}
      boundSubmitHumanAction={boundSubmitHumanAction} 
    />
  );
}

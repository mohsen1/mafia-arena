// Remove old action/state manager imports
// import { runGameTurnAction } from "@/app/actions/index";
// import { submitHumanAction } from "@/app/actions/humanActions";
// import { gameStateManager } from "@/lib/state/gameStateManager";

// Import new actions
import { advanceGameStateAction } from "@/app/actions/gameplay.actions";
import { submitHumanAction } from "@/app/actions/human.actions";

// TODO: Create and import loadGameData function
// import { loadGameData } from "@/lib/db/gameData"; 
// Placeholder loadGameData for now
import type { FilteredGameState } from "@/lib/interfaces/gameState.types";
const loadGameData = async (gameId: string): Promise<FilteredGameState | null> => {
    console.log(`Placeholder loadGameData called for ${gameId}`);
    // Return minimal valid FilteredGameState or null
    if (gameId === "not-found") return null;
    return { 
        id: gameId, phase: 'Night', round: 1, players: [], log: [], 
        pendingHumanAction: null, createdAt: new Date().toISOString(), 
        lastUpdatedAt: new Date().toISOString(), language: 'en', themeKey: 'classic', winner: null 
    };
}

import { notFound } from "next/navigation";
import GameClient from "./GameClient"; // Import the client component
import type { LanguageCode } from "@/lib/i18n/settings";

// Remove i18n imports - no longer needed here
// import { getDictionary } from "@/lib/getDictionary";
// import { dir } from 'i18next';

interface GamePageProps {
  params: { gameId: string; lang: LanguageCode }; // Params are usually directly available, not a Promise
}

export default async function GamePage({ params }: GamePageProps) { // Adjusted params destructuring
  const { gameId, lang } = params; // Get lang as well
  // Load state using new function
  const initialGameState = await loadGameData(gameId);

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

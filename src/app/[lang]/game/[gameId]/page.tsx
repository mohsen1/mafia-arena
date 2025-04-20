import { runGameTurnAction } from "@/app/actions/index";
import { submitHumanAction } from "@/app/actions/humanActions"; // Import the new action
import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import GameClient from "./GameClient"; // Import the client component
import type { LanguageCode } from "@/lib/i18n/settings";

// Remove i18n imports - no longer needed here
// import { getDictionary } from "@/lib/getDictionary";
// import { dir } from 'i18next';

interface GamePageProps {
  params: Promise<{ gameId: string; lang: LanguageCode }>;
}

export default async function GamePage({ params: paramsPromise }: GamePageProps) {
  const { gameId } = await paramsPromise; // Await the params promise
  const gameState = await gameStateManager.getGameState(gameId);

  if (!gameState) {
    notFound();
  }

  // Remove dictionary loading and direction calculation
  // const dictionary = await getDictionary(lang);
  // const direction = dir(lang);

  // Bind the actions here on the server
  const boundRunGameTurnAction = runGameTurnAction.bind(null, gameId);
  const boundSubmitHumanAction = submitHumanAction.bind(null, gameId); // Bind the human action

  // Pass only necessary props to GameClient
  return (
    <GameClient
      initialGameState={gameState}
      gameId={gameId}
      // Remove lang and direction props
      boundRunGameTurnAction={boundRunGameTurnAction}
      boundSubmitHumanAction={boundSubmitHumanAction} // Pass the bound human action
    />
  );
}

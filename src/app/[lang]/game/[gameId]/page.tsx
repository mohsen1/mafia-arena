import { runGameTurnAction } from "@/app/actions/index";
import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import GameClient from "./GameClient"; // Import the client component

// Remove i18n imports - no longer needed here
// import { getDictionary } from "@/lib/getDictionary";
// import { dir } from 'i18next';
import type { LanguageCode } from "@/lib/i18n/settings";

interface GamePageProps {
  params: Promise<{ gameId: string; lang: LanguageCode }>;
}

export default async function GamePage({ params: paramsPromise }: GamePageProps) {
  const { gameId } = await paramsPromise; // Await the params promise
  const gameState = await gameStateManager.getFilteredGameState(gameId);

  if (!gameState) {
    notFound();
  }

  // Remove dictionary loading and direction calculation
  // const dictionary = await getDictionary(lang);
  // const direction = dir(lang);

  // Bind the action here on the server
  const boundRunGameTurnAction = runGameTurnAction.bind(null, gameId);

  // Pass only necessary props to GameClient
  return (
    <GameClient
      initialGameState={gameState}
      gameId={gameId}
      // Remove lang and direction props
      boundRunGameTurnAction={boundRunGameTurnAction}
    />
  );
}

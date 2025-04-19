import { runGameTurnAction } from "@/app/actions/index";
import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import GameClient from "./GameClient"; // Import the client component

// Remove i18n imports - no longer needed here
// import { getDictionary } from "@/lib/getDictionary";
// import { dir } from 'i18next';
import type { LanguageCode } from "@/lib/i18n/settings";

interface GamePageProps {
  params: { gameId: string; lang: LanguageCode }; // Keep lang for potential non-i18n use
}

export default async function GamePage({ params }: GamePageProps) {
  const { gameId, lang } = params; // Keep lang extraction for now
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

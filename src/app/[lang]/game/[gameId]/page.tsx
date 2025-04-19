import { runGameTurnAction } from "@/app/actions/index";
import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import GameClient from "./GameClient"; // Import the client component
import type { Locale } from "@/app/[lang]/dictionaries"; // Import Locale

interface GamePageProps {
  params: Promise<{ gameId: string; lang: Locale }>; // Add lang to params
}

export default async function GamePage({ params }: GamePageProps) {
  // No need to await params directly
  const { gameId, lang } = await params; // Extract lang
  const gameState = await gameStateManager.getFilteredGameState(gameId);

  if (!gameState) {
    notFound();
  }

  // Bind the action here on the server
  const boundRunGameTurnAction = runGameTurnAction.bind(null, gameId);

  return (
    <GameClient
      initialGameState={gameState}
      gameId={gameId}
      boundRunGameTurnAction={boundRunGameTurnAction}
    />
  );
}

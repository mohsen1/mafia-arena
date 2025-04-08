import { runGameTurnAction } from "@/app/actions";
import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import GameClient from "./GameClient"; // Import the client component

interface GamePageProps {
    params: { // Params are sync in app router
        gameId: string;
    };
}

export default async function GamePage({ params }: GamePageProps) {
    // No need to await params directly
    const { gameId } = params;
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


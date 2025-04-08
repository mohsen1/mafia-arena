import { runGameTurnAction } from "@/app/actions"; // Import the new action
import { ConversationLog } from "@/components/ConversationLog";
import { GameHeader } from "@/components/GameHeader";
import { GameSidebar } from "@/components/GameSidebar";
import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";

// Define props expected by the page component
interface GamePageProps {
    params: {
        gameId: string;
    };
}

// The main server component for the game page
export default async function GamePage({ params }: GamePageProps) {
    // Params must be awaited in async RSCs according to Next.js best practices/errors
    const awaitedParams = await params;
    const { gameId } = awaitedParams;
    const gameState = await gameStateManager.getFilteredGameState(gameId);

    if (!gameState) {
        notFound();
    }

    const { title, description, phase, round, players, conversationLog, winner } = gameState;
    const runTurnForThisGame = runGameTurnAction.bind(null, gameId);

    return (
        // Main container: Use CSS Grid
        <div className="grid grid-cols-[280px_1fr] h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            {/* Left Column (Sidebar): Player List */}
            <GameSidebar players={players} phase={phase} />

            {/* Right Column: Game Info & Conversation */}
            <main className="flex flex-col h-screen overflow-hidden">
                {/* Top Row: Game Info & Actions */}
                <GameHeader 
                    title={title || "Werewolf Game"}
                    description={description}
                    phase={phase}
                    round={round}
                    winner={winner}
                    onRunTurn={runTurnForThisGame}
                />

                {/* Bottom Row: Conversation Log */}
                <ConversationLog conversationLog={conversationLog} players={players} />
            </main>
        </div>
    );
} 


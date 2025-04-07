import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import { Player, FilteredGameState, ChatMessage } from "@/lib/types/game";
import { runGameTurnAction } from "@/app/actions"; // Import the new action
import { PlayerCard } from "@/components/PlayerCard"; // Import PlayerCard
import { MessageBubble } from "@/components/MessageBubble"; // Import MessageBubble

// Define props expected by the page component
interface GamePageProps {
    params: {
        gameId: string;
    };
}

// The main server component for the game page
export default async function GamePage({ params }: GamePageProps) {
    // Params await removed as it's generally not needed and caused confusion
    const { gameId } = params;
    const gameState = await gameStateManager.getFilteredGameState(gameId);

    if (!gameState) {
        notFound();
    }

    const { gameId: stateGameId, title, description, phase, round, players, conversationLog, winner } = gameState;
    const runTurnForThisGame = runGameTurnAction.bind(null, gameId);

    return (
        // Main container: Use CSS Grid
        <div className="grid grid-cols-[280px_1fr] h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            
            {/* Left Column (Sidebar): Player List */}
            {/* Width is controlled by grid-cols definition above */}
            <aside className="h-full overflow-y-auto p-4 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md flex flex-col">
                <a className="text-lg text-gray-500 dark:text-gray-400 mb-2 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200 w-full text-center block items-center gap-2" href="/">
                    <span className="text-xl">🏠</span> Home
                </a>
                <h2 className="text-xl font-semibold mb-4 text-center sticky top-0 bg-white dark:bg-gray-800 py-2 flex-shrink-0">Players</h2>
                <div className="grid grid-cols-1 gap-3 flex-grow overflow-y-auto pr-1"> {/* Allow grid inside to scroll */}
                    {Object.values(players).map(player => (
                        <PlayerCard key={player.id} player={player} />
                    ))}
                </div>
            </aside>

            {/* Right Column: Game Info & Conversation */}
            {/* This column spans the second track (1fr) */}
            <main className="flex flex-col h-screen overflow-hidden"> {/* Prevent this column from causing page scroll */}
                {/* Top Row: Game Info & Actions */}
                <header className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow flex justify-between items-center flex-shrink-0 gap-4">
                    {/* Game Info Group */}    
                    <div className="flex-grow">
                        <h1 className="text-2xl font-bold mb-1 truncate">{title || "Werewolf Game"}</h1>
                        {description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 italic">{description}</p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Round: <span className="font-semibold">{round}</span> | 
                            Phase: <span className="font-semibold capitalize">{phase}</span>
                        </p>
                        {/* Winner Status */}
                        <div className="mt-1">
                            {winner && (
                                <span className="text-lg font-bold text-green-600 dark:text-green-400">Winner: {winner}!</span>
                            )}
                            {phase === 'GameOver' && !winner && (
                                <span className="text-lg font-bold text-red-600 dark:text-red-400">Game Over</span>
                            )}
                        </div>
                    </div>
                     {/* Action Button Form */}    
                     <form action={runTurnForThisGame} className="flex-shrink-0">
                         <button 
                             type="submit" 
                             className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                             disabled={phase === 'GameOver'}
                         >
                             {phase === 'DayIntroductions' ? 'Next Introduction' : 
                              phase === 'Night' ? 'Process Night' : 
                              'Run Next Turn'} 
                         </button>
                     </form>
                </header>

                {/* Bottom Row: Conversation Log */}    
                <section className="flex-grow p-4 overflow-hidden flex flex-col">
                    <h2 className="text-xl font-semibold mb-3 flex-shrink-0">Conversation Log</h2>
                     {/* Outer container enables scrolling */}
                    <div className="flex-grow overflow-y-auto bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg shadow-inner">
                        {/* Inner container reverses flex order */} 
                        <div className="flex flex-col-reverse gap-3">
                            {conversationLog.length > 0 ? (
                                conversationLog.map((message) => (
                                     <MessageBubble key={message.messageId} message={message} players={players} />
                                ))
                            ) : (
                                <p className="text-gray-500 dark:text-gray-400 italic text-center py-4">The conversation log is empty.</p>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
} 
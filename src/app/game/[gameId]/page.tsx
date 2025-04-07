import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import { Player, FilteredGameState, ChatMessage } from "@/lib/types/game";
import { runGameTurnAction } from "@/app/actions"; // Import the new action
import Image from 'next/image'; // Import Next.js Image component

// Define props expected by the page component
interface GamePageProps {
    params: {
        gameId: string;
    };
}

// Player Card Component with Dark Mode
function PlayerCard({ player }: { player: FilteredGameState['players'][string] }) {
    return (
        <div className={`p-3 flex flex-col items-center transition-colors duration-200 ${player.status === 'dead' ? 'bg-gray-300 dark:bg-gray-700 opacity-60' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
            {player.imageUrl ? (
                <Image 
                    src={player.imageUrl} 
                    alt={`Image of ${player.name}`}
                    width={64} // Slightly smaller
                    height={64}
                    className="rounded-full mb-2 object-cover border-2 border-gray-300 dark:border-gray-600"
                />
            ) : (
                <div className="w-16 h-16 rounded-full bg-gray-300 dark:bg-gray-600 mb-2 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs">No Image</div>
            )}
            <h3 className="text-md font-semibold text-center text-gray-800 dark:text-gray-100">{player.name}</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">Status: <span className="font-medium">{player.status}</span></p>
        </div>
    );
}

// Message Component with Dark Mode
function MessageBubble({ message, players }: { message: Omit<ChatMessage, 'audience'> & { speakerName: string }, players: FilteredGameState['players'] }) {
    const speakerPlayer = message.speaker.type === 'player' 
        ? players[message.speaker.playerId] 
        : null;
    const speakerImageUrl = speakerPlayer?.imageUrl;
    const isModerator = message.speaker.type === 'moderator';

    return (
        <div className={`flex items-start gap-3 p-2 rounded-lg transition-colors duration-200 ${isModerator ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 text-sm italic' : 'bg-white dark:bg-gray-700'}`}>
            {/* Speaker Image */}
            <div className="flex-shrink-0 mt-1">
                {speakerImageUrl ? (
                    <Image 
                        src={speakerImageUrl}
                        alt={`Image of ${message.speakerName}`}
                        width={32} 
                        height={32}
                        className="rounded-full object-cover border border-gray-300 dark:border-gray-600"
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 text-[10px] font-bold">
                        {isModerator ? 'Mod' : message.speakerName?.substring(0, 1) || 'P'}
                    </div>
                )}
            </div>
            {/* Message Content */}
            <div className="flex-grow">
                <span className={`font-semibold text-gray-900 dark:text-gray-50 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>{message.speakerName}: </span>
                <span className={`text-gray-800 dark:text-gray-200 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>{message.content}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 block text-right opacity-75">R{message.round} {message.phase}</span>
            </div>
        </div>
    );
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
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            {/* Left Column: Player List */}    
            <aside className="w-1/4 lg:w-1/5 h-full overflow-y-auto p-4 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md">
                <a className="text-lg text-gray-500 dark:text-gray-400 mb-2 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200 w-full text-center block items-center gap-2" href="/">
                    <span className="text-xl">🏠</span> Home
                </a>
                 <div className="grid grid-cols-1 gap-3">
                     {Object.values(players).map(player => (
                         <PlayerCard key={player.id} player={player} />
                     ))}
                 </div>
             </aside>

            {/* Right Column: Game Info & Conversation */}
            <main className="flex-grow flex flex-col h-screen">
                {/* Top Row: Game Info & Actions */}
                <header className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow flex justify-between items-center flex-shrink-0">
                    <div>
                        <h1 className="text-2xl font-bold mb-1">{title || "Werewolf Game"}</h1>
                        {description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2 italic">{description}</p>
                        )}
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            Round: <span className="font-semibold">{round}</span> | 
                            Phase: <span className="font-semibold">{phase}</span>
                        </p>
                        {winner && (
                            <p className="text-lg font-bold text-green-600 dark:text-green-400">Winner: {winner}!</p>
                        )}
                         {phase === 'GameOver' && !winner && (
                             <p className="text-lg font-bold text-red-600 dark:text-red-400">Game Over</p>
                         )}
                    </div>
                     {/* Action Button Form */}    
                     <form action={runTurnForThisGame}>
                         <button 
                             type="submit" 
                             className="px-4 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed transition duration-150 ease-in-out"
                             disabled={phase === 'GameOver'}
                         >
                             {phase === 'DayIntroductions' ? 'Next Introduction' : 
                              phase === 'Night' ? 'Process Night' : // Example for night
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
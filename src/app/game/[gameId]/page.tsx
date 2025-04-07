import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import { Player, FilteredGameState } from "@/lib/types/game";
import { runGameTurnAction } from "@/app/actions"; // Import the new action
import Image from 'next/image'; // Import Next.js Image component

// Define props expected by the page component
interface GamePageProps {
    params: {
        gameId: string;
    };
}

// Update PlayerCard props to expect the Player type from FilteredGameState
// Which includes imageUrl but omits role
function PlayerCard({ player }: { player: FilteredGameState['players'][string] }) {
    return (
        <div className={`p-4 border rounded-lg shadow flex flex-col items-center ${player.status === 'dead' ? 'bg-gray-400 opacity-60' : 'bg-white'}`}>
            {player.imageUrl ? (
                <Image 
                    src={player.imageUrl} 
                    alt={`Image of ${player.name}`}
                    width={80} // Adjust size as needed
                    height={80}
                    className="rounded-full mb-2 object-cover" // Style the image
                />
            ) : (
                <div className="w-20 h-20 rounded-full bg-gray-300 mb-2 flex items-center justify-center text-gray-500 text-xs">No Image</div> // Placeholder
            )}
            <h3 className="text-lg font-semibold text-center">{player.name}</h3>
            <p className="text-sm text-gray-600">Status: <span className="font-medium">{player.status}</span></p>
            {/* Persona is usually long, maybe show on hover or in a modal later */} 
            {/* <p className="text-xs mt-1 text-gray-500 truncate">{player.persona}</p> */}
        </div>
    );
}

// The main server component for the game page
export default async function GamePage({ params }: GamePageProps) {
    // Explicitly await params if needed, though usually not required
    await params; // Explicitly await params as suggested by the error
    const { gameId } = params; // Access gameId after await
    const gameState = await gameStateManager.getFilteredGameState(gameId);

    // Handle game not found
    if (!gameState) {
        notFound(); // Renders the Next.js 404 page
    }

    const { phase, round, players, conversationLog, winner } = gameState;

    // Form action needs to be bound with the gameId
    const runTurnForThisGame = runGameTurnAction.bind(null, gameId);

    return (
        <main className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-4 text-center">Werewolf Game</h1>
            <div className="text-center mb-6 text-gray-600">
                <p>Game ID: <span className="font-mono bg-gray-100 px-2 py-1 rounded">{gameId}</span></p>
                <p>Round: <span className="font-semibold">{round}</span> | Phase: <span className="font-semibold">{phase}</span></p>
                {winner && (
                    <p className="text-xl font-bold mt-2 text-green-600">Winner: {winner}!</p>
                )}
                 {phase === 'GameOver' && !winner && (
                     <p className="text-xl font-bold mt-2 text-red-600">Game Over (Winner not determined?)</p>
                 )}
            </div>

            {/* Player List Section */}
            <section className="mb-8">
                <h2 className="text-2xl font-semibold mb-3">Players ({Object.keys(players).length})</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Object.values(players).map(player => (
                        <PlayerCard key={player.id} player={player} />
                    ))}
                </div>
            </section>

            {/* Conversation Log Section (Basic) */}
            <section>
                <h2 className="text-2xl font-semibold mb-3">Conversation Log</h2>
                <div className="bg-gray-50 p-4 rounded-lg shadow h-96 overflow-y-auto space-y-4">
                    {conversationLog.length > 0 ? (
                        conversationLog.map((message, index) => {
                            // Find the speaker's player data to get the image URL
                            const speakerPlayer = message.speaker.type === 'player' 
                                ? players[message.speaker.playerId] 
                                : null;
                            const speakerImageUrl = speakerPlayer?.imageUrl;
                            
                            return (
                                <div key={message.messageId || index} className={`flex items-start gap-3 p-2 rounded ${message.speaker.type === 'moderator' ? 'bg-blue-100 text-blue-900 text-sm italic' : 'bg-white'}`}>
                                    {/* Speaker Image */}
                                    {speakerImageUrl ? (
                                        <Image 
                                            src={speakerImageUrl}
                                            alt={`Image of ${message.speakerName}`}
                                            width={40} // Smaller image for log
                                            height={40}
                                            className="rounded-full mt-1 object-cover flex-shrink-0"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0 mt-1 flex items-center justify-center text-gray-500 text-xs">
                                            {message.speaker.type === 'moderator' ? 'Mod' : 'N/A'}
                                        </div> // Placeholder
                                    )}
                                    {/* Message Content */}
                                    <div className="flex-grow">
                                        <span className="font-semibold">{message.speakerName}: </span>
                                        <span>{message.content}</span>
                                        <span className="text-xs text-gray-500 block text-right">R{message.round} {message.phase}</span>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-gray-500 italic">The conversation log is empty.</p>
                    )}
                </div>
            </section>

            {/* Action Buttons */}
            <section className="mt-8 flex justify-center">
                 {/* Add a form to trigger the next turn/action */}
                 <form action={runTurnForThisGame}>
                     <button 
                         type="submit" 
                         className="px-5 py-2 bg-green-600 text-white rounded shadow hover:bg-green-700 disabled:bg-gray-400"
                         // Disable button if game is over
                         disabled={phase === 'GameOver'}
                     >
                         {phase === 'DayIntroductions' ? 'Next Introduction' : 'Run Next Turn (WIP)'}
                     </button>
                 </form>
            </section>
        </main>
    );
} 
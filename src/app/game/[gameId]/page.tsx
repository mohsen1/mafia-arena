import { gameStateManager } from "@/lib/state/gameStateManager";
import { notFound } from "next/navigation";
import { Player } from "@/lib/types/game";

// Define props expected by the page component
interface GamePageProps {
    params: {
        gameId: string;
    };
}

// Basic component to display a single player's info
function PlayerCard({ player }: { player: Omit<Player, 'role'> }) {
    return (
        <div className={`p-4 border rounded-lg shadow ${player.status === 'dead' ? 'bg-gray-400 opacity-60' : 'bg-white'}`}>
            <h3 className="text-lg font-semibold">{player.name}</h3>
            <p className="text-sm text-gray-600">Status: <span className="font-medium">{player.status}</span></p>
            {/* Persona is usually long, maybe show on hover or in a modal later */} 
            {/* <p className="text-xs mt-1 text-gray-500 truncate">{player.persona}</p> */}
        </div>
    );
}

// The main server component for the game page
export default async function GamePage({ params }: GamePageProps) {
    const { gameId } = params;
    const gameState = await gameStateManager.getFilteredGameState(gameId);

    // Handle game not found
    if (!gameState) {
        notFound(); // Renders the Next.js 404 page
    }

    const { phase, round, players, conversationLog, winner } = gameState;

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
                <div className="bg-gray-50 p-4 rounded-lg shadow h-96 overflow-y-auto space-y-3">
                    {conversationLog.length > 0 ? (
                        conversationLog.map((message, index) => (
                            <div key={message.messageId || index} className={`p-2 rounded ${message.speaker.type === 'moderator' ? 'bg-blue-100 text-blue-900 text-sm italic' : 'bg-white'}`}>
                                <span className="font-semibold">{message.speakerName}: </span>
                                <span>{message.content}</span>
                                <span className="text-xs text-gray-500 block text-right">R{message.round} {message.phase}</span>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500 italic">The conversation log is empty.</p>
                    )}
                </div>
            </section>

            {/* TODO: Add action buttons? (e.g., manually advance turn/phase for testing) */}
        </main>
    );
} 
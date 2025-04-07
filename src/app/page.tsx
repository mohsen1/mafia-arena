import Link from 'next/link';
import { gameStateManager } from '@/lib/state/gameStateManager';
import { startGameAction, deleteGameAction } from '@/app/actions'; // Import the server action
import { FilteredGameState } from '@/lib/types/game'; // Import type

// Component for displaying a single game card in the list
function GameCard({ game }: { game: FilteredGameState }) {
    // Bind the delete action to this specific gameId
    const deleteThisGame = deleteGameAction.bind(null, game.gameId);

    return (
        <li className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700 flex justify-between items-start gap-4">
            <div className="flex-grow">
                <h3 className="text-lg font-semibold mb-1 text-blue-700 dark:text-blue-400">
                    <Link href={`/game/${game.gameId}`} className="hover:underline">
                        {game.title || `Game ${game.gameId.substring(0, 8)}...`}
                    </Link>
                </h3>
                {game.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-2">{game.description}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-500">
                    Phase: <span className="font-medium">{game.phase}</span> | 
                    Round: <span className="font-medium">{game.round}</span>
                </p>
            </div>
            {/* Delete Button Form */}    
            <form action={deleteThisGame} className="flex-shrink-0">
                 <button 
                     type="submit" 
                     className="px-3 py-1 bg-red-600 text-white text-xs rounded shadow hover:bg-red-700 disabled:bg-gray-400 transition duration-150 ease-in-out"
                     // Optional: Add confirmation later
                 >
                     Delete
                 </button>
             </form>
        </li>
    );
}

export default async function Home() {
    // Fetch game IDs first
    const gameIds = await gameStateManager.listGameIds();

    // Fetch full (filtered) state for each game to display details
    // This could be slow with many games; consider pagination or fetching less data later
    const gameStatesPromises = gameIds.map(id => gameStateManager.getFilteredGameState(id));
    const gameStatesResults = await Promise.all(gameStatesPromises);
    // Filter out any null results (e.g., file existed but failed to load/parse)
    const existingGames = gameStatesResults.filter((state): state is FilteredGameState => state !== null);

    return (
        <main className="container mx-auto p-4 flex flex-col items-center space-y-8 min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <h1 className="text-4xl font-bold mt-8 mb-6 text-center">Werewolf AI</h1>

            {/* Form to start a new game */}
            <form action={startGameAction} className="mb-8">
                <button 
                    type="submit" 
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition duration-150 ease-in-out text-lg font-semibold"
                >
                    Start New Game
                </button>
            </form>

            {/* List existing games */}
            <div className="w-full max-w-2xl mb-8">
                <h2 className="text-2xl font-semibold mb-4 text-center">Existing Games</h2>
                {existingGames.length > 0 ? (
                    <ul className="space-y-3">
                        {existingGames.map((game) => (
                           <GameCard key={game.gameId} game={game} />
                        ))}
                    </ul>
                ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400 italic">No existing games found. Start a new one!</p>
                )}
            </div>
        </main>
    );
}

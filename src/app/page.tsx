import Link from 'next/link';
import { gameStateManager } from '@/lib/state/gameStateManager';
import { deleteGameAction } from '@/app/actions';   
import { FilteredGameState } from '@/lib/types/game';
import StartGameForm from '@/components/StartGameForm'; 
import { getGroqModels } from '@/lib/groq/api';
import { Button } from '@/components/ui/button';

// Component for displaying a single game card in the list
function GameCard({ game }: { game: FilteredGameState }) {
    // Bind the delete action to this specific gameId
    const deleteThisGame = deleteGameAction.bind(null, game.gameId);

    return (
        <li className="flex justify-between items-start gap-4">
            <div className="flex-grow">
                <h3 className="text-lg font-semibold mb-1">
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
                 <Button
                     type="submit" 
                     variant="outline"
                     size="sm"
                     // Optional: Add confirmation later
                 >
                     Delete
                 </Button>
             </form>
        </li>
    );
}

export default async function Home() {
    // Fetch the list of models server-side
    const availableModels = await getGroqModels(); 

    // Fetch game IDs first
    const gameIds = await gameStateManager.listGameIds();

    // Fetch full (filtered) state for each game to display details
    // This could be slow with many games; consider pagination or fetching less data later
    const gameStatesPromises = gameIds.map(id => gameStateManager.getFilteredGameState(id));
    const gameStatesResults = await Promise.all(gameStatesPromises);
    // Filter out any null results (e.g., file existed but failed to load/parse)
    const existingGames = gameStatesResults.filter((state): state is FilteredGameState => state !== null);

    return (
        <main className=" mx-auto p-4 flex flex-col items-center space-y-8 min-h-screen">
            <h1 className="text-4xl font-bold mt-8 mb-6 text-center">Werewolf AI</h1>

            {/* Pass the fetched models to the form */}
            <StartGameForm availableModels={availableModels} />

            {/* List existing games */}
            {existingGames.length > 0 && (
            <div className="w-full max-w-2xl mb-8">
                <h2 className="text-2xl font-semibold mb-4 text-center">Existing Games</h2>
                
                    <ul className="space-y-3">
                        {existingGames.map((game) => (
                           <GameCard key={game.gameId} game={game} />
                        ))}
                    </ul>
                </div>
            )}
        </main>
    );
}

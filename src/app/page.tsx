import Link from 'next/link';
import { gameStateManager } from '@/lib/state/gameStateManager';
import { startGameAction } from '@/app/actions'; // Import the server action

export default async function Home() {
  // Fetch the list of existing games on the server
  const gameIds = await gameStateManager.listGameIds();

  return (
    <main className="container mx-auto p-4 flex flex-col items-center space-y-8">
      <h1 className="text-4xl font-bold mb-6">Werewolf AI</h1>

      {/* Form to start a new game */}
      <form action={startGameAction} className="mb-8">
        <button 
          type="submit" 
          className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition duration-150 ease-in-out"
        >
          Start New Game (Using Defaults)
        </button>
      </form>

      {/* List existing games */}
      <div className="w-full max-w-md">
        <h2 className="text-2xl font-semibold mb-4 text-center">Existing Games</h2>
        {gameIds.length > 0 ? (
          <ul className="space-y-2">
            {gameIds.map((gameId) => (
              <li key={gameId} className="bg-gray-100 p-3 rounded shadow">
                <Link 
                  href={`/game/${gameId}`}
                  className="text-blue-700 hover:underline"
                >
                  View Game: {gameId}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-500">No existing games found. Start a new one!</p>
        )}
      </div>
    </main>
  );
}

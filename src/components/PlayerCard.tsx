import Image from 'next/image';
import { FilteredGameState } from "@/lib/types/game";

// Player Card Component with Dark Mode
export function PlayerCard({ player }: { player: FilteredGameState['players'][string] }) {
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
            <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">{player.status}</p>
        </div>
    );
} 
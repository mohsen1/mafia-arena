import Image from 'next/image';
import { FilteredGameState } from "@/lib/types/game";
import { Role } from '@/lib/types/game'; // Assuming Role type exists

// Player Card Component with Dark Mode
export function PlayerCard({ player, role }: { player: FilteredGameState['players'][string]; role?: Role }) {
    return (
        <div className={`p-2 flex items-center transition-colors duration-200 ${player.status === 'dead' ? 'opacity-25' : ''}`}>
            {player.imageUrl ? (
                <Image
                    src={player.imageUrl}
                    alt={`Image of ${player.name}`}
                    width={48} // Smaller size
                    height={48}
                    className="rounded-full mr-3 object-cover border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" // Added flex-shrink-0
                />
            ) : (
                <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 mr-3 flex items-center justify-center text-gray-500 dark:text-gray-400 text-xs flex-shrink-0">No Image</div> // Added flex-shrink-0
            )}
            <div className="flex-grow"> {/* Added flex-grow to take remaining space */}
                    <h3 className="text-md font-semibold text-gray-800 dark:text-gray-100 truncate">{player.name}</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 capitalize">{player.status}{role ? ` • ${role}` : ''}</p>
            </div>
        </div>
    );
} 
import { PlayerCard } from "@/components/PlayerCard";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import { Home } from "lucide-react";

export function GameSidebar() { // Remove props
    const { gameState } = useGameContext(); // Use context

    if (!gameState) return null; // Handle loading state
    const { players, phase } = gameState;

    return (
        <aside className="h-full overflow-y-auto p-4 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-md flex flex-col">
            <a className="text-lg text-gray-500 dark:text-gray-400 mb-2 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-200 w-full flex items-center gap-2" href="/">
                <Home className="h-5 w-5 flex-shrink-0" />
                Werewolf AI
            </a>
            <div className="grid grid-cols-1 gap-3 overflow-y-auto pr-1">
                {Object.values(players).map(player => (
                    <PlayerCard 
                        key={player.id} 
                        player={player} 
                        role={phase === 'GameOver' ? player.role : undefined}
                    />
                ))}
            </div>
        </aside>
    );
} 
import { PlayerCard } from "@/components/PlayerCard";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import { Home } from "lucide-react";

export function GameSidebar() {
    const { gameState, t } = useGameContext(); 

    if (!gameState) return null;

    // Remove playerPerspective for now, as requestingPlayerId isn't available
    const { players, livingPlayerIds, deadPlayerIds } = gameState;

    const livingPlayers = livingPlayerIds.map(id => players[id]);
    const deadPlayers = deadPlayerIds.map(id => players[id]);

    return (
        <aside className="bg-gray-100 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-screen">
            <h2 className="text-lg font-semibold p-3 border-b border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                {t('PlayersLabel', 'Players')} ({livingPlayerIds.length})
            </h2>
            <div className="flex-grow p-2 overflow-y-auto">
                <div className="space-y-1">
                    {livingPlayers.map(player => (
                        <PlayerCard
                            key={player.id}
                            player={player}
                            // Don't pass role for living players for now
                            // role={...}
                        />
                    ))}
                     {deadPlayers.length > 0 && (
                         <>
                            <hr className="my-2 border-gray-300 dark:border-gray-600" />
                             {deadPlayers.map(player => (
                                 <PlayerCard
                                     key={player.id}
                                     player={player}
                                     // Show role for dead players (as before)
                                     role={player.role} 
                                 />
                             ))}
                         </>
                     )}
                </div>
            </div>
        </aside>
    );
} 
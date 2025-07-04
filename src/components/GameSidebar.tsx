'use client'; // Ensure this is a client component

import { PlayerCard } from '@/components/PlayerCard';
import { useGameContext } from '@/context/GameContext'; // Import context hook
// import type { Player } from "@/lib/types/game"; // OLD IMPORT
import type { FilteredPlayer } from '@/lib/interfaces/client.types'; // NEW IMPORT
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer'; // Import PlayerId

// Import from react-i18next
import { useTranslation } from 'react-i18next';
import { GameHeader } from './GameHeader';
import { GameTimer } from './GameTimer';
import { QuickActionsPanel } from './QuickActionsPanel';
import { RoleTipsPanel } from './RoleTipsPanel';

export function GameSidebar() {
  const { gameState } = useGameContext();
  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  // Handle null gameState
  if (!gameState) {
    return null; // Or return a loading state/placeholder
  }

  const { players, livingPlayerIds, deadPlayerIds } = gameState;

  // Handle possibly undefined ID lists and players record
  const livingPlayers = (livingPlayerIds ?? []) // Default to empty array if undefined
    .map((id: PlayerId) => players?.[id]) // Use optional chaining for players
    .filter((p): p is FilteredPlayer => !!p); // Use FilteredPlayer

  // Calculate dead players
  const deadPlayers = (deadPlayerIds ?? []) // Default to empty array if undefined
    .map((id: PlayerId) => players?.[id]) // Use optional chaining for players
    .filter((p): p is FilteredPlayer => !!p); // Use FilteredPlayer
  if (!players) return null;

  // Group living players by role alignment (Town vs Mafia)
  const groupPlayersByAlignment = (players: FilteredPlayer[]) => {
    const townRoles = ['Villager', 'Seer', 'Doctor'];
    const mafiaRoles = ['Mafia'];

    // Only group by roles if the game is over or if we can see all roles
    const canSeeRoles = gameState.phase === 'GameOver';

    if (!canSeeRoles) {
      // During active game, don't group by alignment
      return { townPlayers: [], mafiaPlayers: [], otherPlayers: players };
    }

    const townPlayers = players.filter(
      (p) => p.roleName && townRoles.includes(p.roleName)
    );
    const mafiaPlayers = players.filter(
      (p) => p.roleName && mafiaRoles.includes(p.roleName)
    );
    const otherPlayers = players.filter(
      (p) =>
        !p.roleName ||
        (!townRoles.includes(p.roleName) && !mafiaRoles.includes(p.roleName))
    );

    return { townPlayers, mafiaPlayers, otherPlayers };
  };

  const { townPlayers, mafiaPlayers, otherPlayers } =
    groupPlayersByAlignment(livingPlayers);

  return (
    <aside className="flex flex-col h-full bg-card border-e">
      <GameHeader />

      <div className="flex-grow p-3 overflow-y-auto">
        {/* Game Timer */}
        {gameState && gameState.phase !== 'GameOver' && (
          <div className="mb-4">
            <GameTimer />
          </div>
        )}

        {/* Quick Actions */}
        {gameState && (
          <div className="mb-4">
            <QuickActionsPanel gameState={gameState} />
          </div>
        )}

        {/* Role Tips */}
        {gameState && (
          <div className="mb-4">
            <RoleTipsPanel gameState={gameState} />
          </div>
        )}
        <div className="space-y-4">
          {/* Town Players Section */}
          {townPlayers.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground px-1 py-0.5 mb-2">
                {t('RoleGroupTown', 'Town Players')} ({townPlayers.length})
              </h3>
              <div className="space-y-1.5">
                {townPlayers.map((player: FilteredPlayer) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
            </div>
          )}

          {/* Mafia Players Section */}
          {mafiaPlayers.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground px-1 py-0.5 mb-2">
                {t('RoleGroupMafia', 'Mafia Players')} ({mafiaPlayers.length})
              </h3>
              <div className="space-y-1.5">
                {mafiaPlayers.map((player: FilteredPlayer) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
            </div>
          )}

          {/* Other Players Section (for any custom roles) */}
          {otherPlayers.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-muted-foreground px-1 py-0.5 mb-2">
                {t('LivingPlayersTitle', 'Living Players')} (
                {otherPlayers.length})
              </h3>
              <div className="space-y-1.5">
                {otherPlayers.map((player: FilteredPlayer) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
            </div>
          )}

          {/* Fallback: Show all living players if no role grouping */}
          {townPlayers.length === 0 &&
            mafiaPlayers.length === 0 &&
            otherPlayers.length === 0 &&
            livingPlayers.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-muted-foreground px-1 py-0.5 mb-2">
                  {t('LivingPlayersTitle', 'Living Players')} (
                  {livingPlayers.length})
                </h3>
                <div className="space-y-1.5">
                  {livingPlayers.map((player: FilteredPlayer) => (
                    <PlayerCard key={player.id} player={player} />
                  ))}
                </div>
              </div>
            )}

          {/* Dead Players Section */}
          {deadPlayers.length > 0 && (
            <>
              <hr className="my-3 border-muted" /> {/* Add a divider */}
              <div>
                <h3 className="text-xs font-medium text-muted-foreground px-1 py-0.5 mb-2">
                  {t('DeadPlayersTitle', 'Dead Players')} ({deadPlayers.length})
                </h3>
                <div className="space-y-1.5 opacity-75">
                  {deadPlayers.map((player: FilteredPlayer) => (
                    <PlayerCard key={player.id} player={player} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

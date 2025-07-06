'use client'; // Ensure this is a client component

import { PlayerCard } from '@/components/PlayerCard';
import { useGameContext } from '@/context/GameContext'; // Import context hook
// import type { Player } from "@/lib/types/game"; // OLD IMPORT
import type { FilteredPlayer } from '@/lib/interfaces/client.types'; // NEW IMPORT
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer'; // Import PlayerId

// Import from react-i18next
import { useTranslation } from 'react-i18next';
import GameController from './GameController';
import { QuickActionsPanel } from './QuickActionsPanel';
import { RoleTipsPanel } from './RoleTipsPanel';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, Users, Lightbulb, Zap, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function GameSidebar() {
  const { gameState } = useGameContext();
  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  // Collapsible states - Quick actions collapsed by default
  const [gameControlsOpen, setGameControlsOpen] = useState(true);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [roleTipsOpen, setRoleTipsOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(true);

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
    <aside className="flex flex-col h-full bg-background/50 border-e border-border/50 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Game Controls - Always visible when game is active */}
        {gameState && gameState.phase !== 'GameOver' && (
          <Collapsible
            open={gameControlsOpen}
            onOpenChange={setGameControlsOpen}
          >
            <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/50 transition-colors border-b border-border/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Settings className="h-4 w-4" />
                {t('GameControls', 'Game Controls')}
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  gameControlsOpen && 'rotate-180'
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-0">
                <GameController />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Quick Actions - Collapsible */}
        {gameState && (
          <Collapsible
            open={quickActionsOpen}
            onOpenChange={setQuickActionsOpen}
          >
            <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/50 transition-colors border-b border-border/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4" />
                {t('QuickActions', 'Quick Actions')}
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  quickActionsOpen && 'rotate-180'
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-0 bg-background/50">
                <QuickActionsPanel gameState={gameState} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Role Tips - Collapsible */}
        {gameState && (
          <Collapsible open={roleTipsOpen} onOpenChange={setRoleTipsOpen}>
            <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/50 transition-colors border-b border-border/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Lightbulb className="h-4 w-4" />
                {t('RoleTips', 'Role Tips')}
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform',
                  roleTipsOpen && 'rotate-180'
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="p-3 pt-0">
                <RoleTipsPanel gameState={gameState} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Players List - Collapsible */}
        <Collapsible open={playersOpen} onOpenChange={setPlayersOpen}>
          <CollapsibleTrigger className="w-full p-3 flex items-center justify-between hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              {t('Players', 'Players')} ({livingPlayers.length})
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                playersOpen && 'rotate-180'
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 space-y-3">
              {/* Town Players Section */}
              {townPlayers.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    {t('RoleGroupTown', 'Town Players')} ({townPlayers.length})
                  </h3>
                  <div className="space-y-1">
                    {townPlayers.map((player: FilteredPlayer) => (
                      <PlayerCard key={player.id} player={player} />
                    ))}
                  </div>
                </div>
              )}

              {/* Mafia Players Section */}
              {mafiaPlayers.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    {t('RoleGroupMafia', 'Mafia Players')} (
                    {mafiaPlayers.length})
                  </h3>
                  <div className="space-y-1">
                    {mafiaPlayers.map((player: FilteredPlayer) => (
                      <PlayerCard key={player.id} player={player} />
                    ))}
                  </div>
                </div>
              )}

              {/* Other Players Section (for any custom roles) */}
              {otherPlayers.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground mb-2">
                    {t('LivingPlayersTitle', 'Living Players')} (
                    {otherPlayers.length})
                  </h3>
                  <div className="space-y-1">
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
                    <h3 className="text-xs font-medium text-muted-foreground mb-2">
                      {t('LivingPlayersTitle', 'Living Players')} (
                      {livingPlayers.length})
                    </h3>
                    <div className="space-y-1">
                      {livingPlayers.map((player: FilteredPlayer) => (
                        <PlayerCard key={player.id} player={player} />
                      ))}
                    </div>
                  </div>
                )}

              {/* Dead Players Section */}
              {deadPlayers.length > 0 && (
                <>
                  <div className="border-t border-border/50 pt-3">
                    <h3 className="text-xs font-medium text-muted-foreground mb-2">
                      {t('DeadPlayersTitle', 'Dead Players')} (
                      {deadPlayers.length})
                    </h3>
                    <div className="space-y-1 opacity-60">
                      {deadPlayers.map((player: FilteredPlayer) => (
                        <PlayerCard key={player.id} player={player} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </aside>
  );
}

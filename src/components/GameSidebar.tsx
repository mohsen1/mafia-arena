'use client'; // Ensure this is a client component

import Image from 'next/image';
import { PlayerCard } from '@/components/PlayerCard';
import { useGameContext } from '@/context/GameContext'; // Import context hook
// import type { Player } from "@/lib/types/game"; // OLD IMPORT
import type { FilteredPlayer } from '@/lib/interfaces/client.types'; // NEW IMPORT
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer'; // Import PlayerId

import Link from 'next/link';
// Import from react-i18next
import { useTranslation } from 'react-i18next';
import { useParams } from 'next/navigation';
import { GameHeader } from './GameHeader';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, Shield, Sword, Eye, Heart, Activity } from 'lucide-react';

export function GameSidebar() {
  const { gameState } = useGameContext();
  const { lang } = useParams();
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

  // Calculate game statistics
  const totalPlayers = Object.keys(players).length;
  const alivePlayers = livingPlayers.length;
  const deadPlayersCount = deadPlayers.length;
  const survivalRate =
    totalPlayers > 0 ? (alivePlayers / totalPlayers) * 100 : 0;

  // Count roles in living players
  const roleCount = livingPlayers.reduce(
    (acc, player) => {
      const role = player.roleName || 'Unknown';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Villager':
        return <Users className="h-3 w-3" />;
      case 'Mafia':
        return <Sword className="h-3 w-3" />;
      case 'Seer':
        return <Eye className="h-3 w-3" />;
      case 'Doctor':
        return <Heart className="h-3 w-3" />;
      default:
        return <Shield className="h-3 w-3" />;
    }
  };

  return (
    <aside className="flex flex-col h-screen">
      <h2 className="text-lg font-semibold p-3 ">
        <Link
          href={`/${lang}`}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          aria-label={t('Werewolf AI')}
        >
          <Image
            src="/images/logo.png"
            alt="Werewolf AI Logo"
            width={32}
            height={32}
            className="rounded-lg"
          />
          <span className="font-bold text-lg">{t('Werewolf AI')}</span>
        </Link>
      </h2>
      <GameHeader />

      {/* Game Statistics Section */}
      <div className="px-3 py-2 border-t border-border/50">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t('SurvivalRate', 'Survival Rate')}
            </span>
            <span className="font-medium">{Math.round(survivalRate)}%</span>
          </div>
          <Progress value={survivalRate} className="h-1.5" />

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-green-500" />
              <span className="text-xs">
                {alivePlayers} {t('Alive', 'Alive')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3 w-3 text-red-500" />
              <span className="text-xs">
                {deadPlayersCount} {t('Dead', 'Dead')}
              </span>
            </div>
          </div>

          {/* Role distribution */}
          {gameState.phase === 'GameOver' && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(roleCount).map(([role, count]) => (
                <Badge
                  key={role}
                  variant="secondary"
                  className="text-xs px-1.5 py-0.5 flex items-center gap-1"
                >
                  {getRoleIcon(role)}
                  <span>
                    {count} {t(role, role)}
                  </span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-grow p-2 overflow-y-auto">
        <div className="space-y-3">
          {/* Town Players Section */}
          {townPlayers.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-muted-foreground px-1 py-0.5">
                  {t('RoleGroupTown', 'Town Players')}
                </h3>
                <Badge variant="outline" className="text-xs">
                  {townPlayers.length}
                </Badge>
              </div>
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
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-muted-foreground px-1 py-0.5">
                  {t('RoleGroupMafia', 'Mafia Players')}
                </h3>
                <Badge variant="destructive" className="text-xs">
                  {mafiaPlayers.length}
                </Badge>
              </div>
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
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-muted-foreground px-1 py-0.5">
                  {t('LivingPlayersTitle', 'Living Players')}
                </h3>
                <Badge variant="outline" className="text-xs">
                  {otherPlayers.length}
                </Badge>
              </div>
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
                <h3 className="text-sm font-medium text-muted-foreground px-1 py-0.5 mb-1">
                  {t('LivingPlayersTitle', 'Living Players')}
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
              <hr className="my-2 border-muted" /> {/* Add a divider */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-muted-foreground px-1 py-0.5">
                    {t('DeadPlayersTitle', 'Dead Players')}
                  </h3>
                  <Badge variant="secondary" className="text-xs opacity-60">
                    {deadPlayers.length}
                  </Badge>
                </div>
                <div className="space-y-1 opacity-75">
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

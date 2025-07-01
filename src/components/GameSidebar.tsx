'use client'; // Ensure this is a client component

import Image from 'next/image';
import { PlayerCard } from '@/components/PlayerCard';
import { PlayerStatsPanel } from '@/components/PlayerStatsPanel';
import { useGameContext } from '@/context/GameContext'; // Import context hook
// import type { Player } from "@/lib/types/game"; // OLD IMPORT
import type { FilteredPlayer } from '@/lib/interfaces/client.types'; // NEW IMPORT
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer'; // Import PlayerId

import Link from 'next/link';
// Import from react-i18next
import { useTranslation } from 'react-i18next';
import { useParams } from 'next/navigation';
import { GameHeader } from './GameHeader';

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

  return (
    <aside className="flex flex-col h-screen">
      <h2 className="text-lg font-semibold p-3 ">
        <Link
          href={`/${lang}`}
          className="flex items-center gap-2"
          aria-label={t('Werewolves AI')}
        >
          {/* Display total player count */}
          <span className="flex items-center gap-2">
            <Image
              src={'/images/logo.png'}
              alt="Werewolves AI Logo"
              className="w-9 h-9"
              width={36}
              height={36}
            />
            {t('Werewolves AI')}
          </span>
        </Link>
      </h2>
      <GameHeader />
      <div className="flex-grow p-2 overflow-y-auto">
        <div className="space-y-1">
          {/* Map over all players */}
          {livingPlayers.map((player: FilteredPlayer) => (
            <PlayerCard key={player.id} player={player} />
          ))}
          {/* Remove separate rendering for living/dead players */}
          {/* Render dead players if any exist */}
          {deadPlayers.length > 0 && (
            <>
              <hr className="my-2 border-muted" /> {/* Add a divider */}
              <h3 className="text-sm font-medium text-muted-foreground px-1 py-0.5">
                {/* Use translation key */}
                {t('DeadPlayersTitle', 'Dead Players')}
              </h3>
              {deadPlayers.map((player: FilteredPlayer) => (
                <PlayerCard key={player.id} player={player} />
              ))}
            </>
          )}
        </div>

        {/* Add Player Statistics Panel */}
        <div className="mt-4">
          <PlayerStatsPanel gameState={gameState} />
        </div>
      </div>
    </aside>
  );
}

'use client'; // Ensure this is a client component

import Image from "next/image";
import { PlayerCard } from "@/components/PlayerCard";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import type { Player } from "@/lib/types/game"; // Import Player type

import Link from "next/link";
// Import from react-i18next
import { useTranslation } from "react-i18next"; 

export function GameSidebar() {
  const { gameState } = useGameContext();

  // Use standard hook
  const { t } = useTranslation('translation'); // Keep namespace for now

  // Handle null gameState
  if (!gameState) {
    return null; // Or return a loading state/placeholder
  }

  const { players, livingPlayerIds, deadPlayerIds } = gameState;

  const livingPlayers = livingPlayerIds
    .map((id: string) => players[id]) // Add type for id
    .filter((p): p is Player => !!p); // Type guard already ensures p is Player

  // Calculate dead players
  const deadPlayers = deadPlayerIds
    .map((id: string) => players[id])
    .filter((p): p is Player => !!p);
  if (!players) return null;

  return (
    <aside className="flex flex-col h-screen">
      <h2 className="text-lg font-semibold p-3 ">
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label={t("Werewolves AI")}
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
            {t("Werewolves AI")}
          </span>
        </Link>
      </h2>
      <div className="flex-grow p-2 overflow-y-auto">
        <div className="space-y-1">
          {/* Map over all players */}
          {livingPlayers.map((player: Player) => (
            <PlayerCard key={player.id} player={player} />
          ))}
          {/* Remove separate rendering for living/dead players */}
          {/* Render dead players if any exist */}
          {deadPlayers.length > 0 && (
            <>
              <hr className="my-2 border-muted" /> {/* Add a divider */}
              <h3 className="text-sm font-medium text-muted-foreground px-1 py-0.5">
                {t("Dead Players")}
              </h3>
              {deadPlayers.map((player: Player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

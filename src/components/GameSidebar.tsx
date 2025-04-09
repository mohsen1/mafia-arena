import { PlayerCard } from "@/components/PlayerCard";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import type { Player } from "@/lib/types/game"; // Import Player type
import { HouseIcon } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";

export function GameSidebar() {
  const {
    gameState, // Destructure gameState instead of individual properties
    // players,
    // livingPlayerIds,
    // deadPlayerIds,
    // language,
  } = useGameContext(); // Use context instead of props

  const { t } = useTranslation(gameState?.language); // Use gameState?.language

  // Handle null gameState
  if (!gameState) {
    return null; // Or return a loading state/placeholder
  }

  const { players, livingPlayerIds } = gameState;

  // const livingPlayers = players.filter((p) => livingPlayerIds.includes(p.id));
  // const deadPlayerIds = Object.values(players)
  //   .filter((p) => p.status === "dead")
  //   .map((p) => p.id);
  const livingPlayers = livingPlayerIds
    .map((id: string) => players[id]) // Add type for id
    .filter((p): p is Player => !!p); // Type guard already ensures p is Player
  // const deadPlayers = Object.values(players).filter((p) => p.status === 'dead'); // Removed unused variable
  // const deadPlayers = deadPlayerIds.map(id => players[id]).filter((p): p is Player => !!p); // Use deadPlayerIds from context if available

  // const werewolfPlayers = livingPlayers.filter((p) => p.role === 'Werewolf'); // Removed unused variable

  // Check players object exists (already handled by gameState check, but good practice)
  if (!players) return null;

  return (
    <aside className="flex flex-col h-screen">
      <h2 className="text-lg font-semibold p-3 ">
        <Link
          href="/"
          className="flex items-center gap-2"
          aria-label={t("Werewolves AI", "Werewolves AI")}
        >
          {/* Display total player count */}
          <span className="flex items-center gap-2">
            <HouseIcon className="w-9 h-9" />
            {t("Werewolves AI", "Werewolves AI")}
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
        </div>
      </div>
    </aside>
  );
}

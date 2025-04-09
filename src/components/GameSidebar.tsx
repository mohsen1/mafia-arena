import { PlayerCard } from "@/components/PlayerCard";
import { useGameContext } from "@/context/GameContext"; // Import context hook
import { HouseIcon } from "lucide-react";
import Link from "next/link";

export function GameSidebar() {
  const { gameState, t } = useGameContext();

  if (!gameState) return null;

  // Get all players and dead player IDs
  const { players, deadPlayerIds } = gameState;
  const allPlayers = Object.values(players); // Get array of all player objects

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
          {allPlayers.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              status={player.status}
            />
          ))}
          {/* Remove separate rendering for living/dead players */}
        </div>
      </div>
    </aside>
  );
}

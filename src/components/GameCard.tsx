"use client"; // Make this a client component to use the hook

import Link from "next/link";
import type { FilteredGameState } from "@/lib/types/game";
import { deleteGameAction } from "@/app/actions/index";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useTranslation } from 'react-i18next'; // Import the hook

// Define props - only needs the game object now
interface GameCardProps {
  game: FilteredGameState;
}

export default function GameCard({ game }: GameCardProps) {
  const deleteThisGame = deleteGameAction.bind(null, game.gameId);
  const { t } = useTranslation(); // Use the hook

  return (
    <li className="flex justify-between items-start gap-4">
      <div className="flex-grow">
        <h3 className="text-lg font-semibold mb-1">
          <Link href={`/${game.gameId}`} className="hover:underline">
            {game.title || t("DefaultGameTitle", "Untitled Game")}
          </Link>
        </h3>
        {game.description && (
          <p className="text-sm text-muted-foreground italic mb-2">
            {game.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t("GamePhaseLabel", "Phase")}:{" "}
          <span className="font-medium capitalize">
            {t(`GamePhase${game.phase}`, game.phase)}
          </span>{" "}
          | {t("RoundLabel", "Round")}:{" "}
          <span className="font-medium">{game.round}</span> |
          {t("PlayersLabel", "Players")}:{" "}
          <span className="font-medium">
            {Object.keys(game.players).length}
          </span>{" "}
          | {t("CreatedLabel", "Created")}:{" "}
          <span className="font-medium">
            {format(new Date(game.createdAt), "PPpp")}
          </span>
        </p>
      </div>
      <form action={deleteThisGame} className="flex-shrink-0">
        <Button type="submit" variant="outline" size="sm">
          {t("DeleteButton", "Delete")}
        </Button>
      </form>
    </li>
  );
} 
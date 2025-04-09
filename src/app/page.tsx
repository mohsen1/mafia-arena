import Link from "next/link";
import type { FilteredGameState } from "@/lib/types/game";
import { getGroqModels } from "@/lib/groq/api";
import { deleteGameAction } from "@/app/actions/index";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { createTranslation } from "./i18n";
import nextI18nConfig from '../../next-i18next.config.js';
// import GameCard from "@/components/GameCard";
import StartGameForm from "@/components/StartGameForm";

interface PageProps {
  params: { lang?: string };
}
// Pass translations object to GameCard instead of t function
function GameCard({
  game,
  translations,
}: {
  game: FilteredGameState;
  translations: Record<string, string>;
}) {
  const t = (key: string, fallback: string) => translations[key] || fallback;
  const deleteThisGame = deleteGameAction.bind(null, game.gameId);

  return (
    <li className="flex justify-between items-start gap-4">
      <div className="flex-grow">
        <h3 className="text-lg font-semibold mb-1">
          <Link href={`/game/${game.gameId}`} className="hover:underline">
            {game.title ||
              t("DefaultGameTitle", `Game ${game.gameId.substring(0, 8)}...`)}
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
          |{t("RoundLabel", "Round")}:{" "}
          <span className="font-medium">{game.round}</span> |
          {t("PlayersLabel", "Players")}:{" "}
          <span className="font-medium">
            {Object.keys(game.players).length}
          </span>{" "}
          |{t("CreatedLabel", "Created")}:{" "}
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

// Define a standard PageProps type structure


export default async function Home({ params }: PageProps) {
  const lang = params?.lang || nextI18nConfig.i18n.defaultLocale;
  const { t } = await createTranslation(lang, 'translation');

  const availableModels = await getGroqModels();
  const existingGames: FilteredGameState[] = []; // Placeholder

  const werewolfAITitle = t("WerewolfAITitle", "Werewolf AI");
  const existingGamesHeading = t("ExistingGamesTitle", "Existing Games");

  return (
    <main className=" mx-auto p-4 flex flex-col items-center space-y-8 min-h-screen">
      <h1 className="text-4xl font-bold mt-8 mb-6 text-center">
        {werewolfAITitle}
      </h1>

      <StartGameForm availableModels={availableModels} />

      {existingGames.length > 0 && (
        <div className="w-full mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">
            {existingGamesHeading}
          </h2>
          <ul className="space-y-3">
            {existingGames.map((game) => (
              <GameCard key={game.gameId} game={game} />
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

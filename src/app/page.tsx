import Link from "next/link";
import { gameStateManager } from "@/lib/state/gameStateManager";
import {
  deleteGameAction,
  getOrGenerateTranslationsAction,
} from "@/app/actions/index";
import type { FilteredGameState } from "@/lib/types/game";
import StartGameForm from "@/components/StartGameForm";
import { getGroqModels } from "@/lib/groq/api";
import { Button } from "@/components/ui/button";
import { headers } from "next/headers";
import type { LanguageCode } from "@/lib/translation/languages";
import { availableLanguageCodes } from "@/lib/translation/languages";
import { format } from "date-fns";

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
interface PageProps {
  params: { [key: string]: string };
  searchParams: { [key: string]: string | string[] | undefined };
}

// Use the defined PageProps type for the Home component
export default async function Home({ searchParams }: PageProps) {
  // --- Language/Translation Setup ---
  const headersList = await headers();
  const acceptLanguage = headersList.get("accept-language");

  // Prioritize lang query param, then header, then default
  const langFromParam = (await searchParams)?.lang;
  const potentialLangCodeFromHeader = acceptLanguage
    ?.split(",")[0]
    .split(";")[0]
    .split("-")[0];
  const potentialLangCode =
    typeof langFromParam === "string"
      ? langFromParam
      : potentialLangCodeFromHeader || "en";

  // Validate the potential language code using the *availableLanguageCodes*
  const validatedLangCode = availableLanguageCodes.includes(
    potentialLangCode as LanguageCode,
  )
    ? (potentialLangCode as LanguageCode)
    : "en"; // Default to 'en' if not supported

  let translations: Record<string, string> = {};
  let isSourceLanguage = validatedLangCode === "en"; // Determine if we loaded English initially

  try {
    translations = await getOrGenerateTranslationsAction(validatedLangCode);
    console.log(
      `[Home Page] Rendering for lang: ${validatedLangCode}. Translation keys:`,
      Object.keys(translations).length,
    );
  } catch (error) {
    console.error(
      `[Home Page] Failed to load translations for ${validatedLangCode}:`,
      error,
    );
    if (validatedLangCode !== "en") {
      try {
        translations = await getOrGenerateTranslationsAction("en");
        isSourceLanguage = true; // Set to true as we fell back to English
        console.log("[Home Page] Loaded fallback English translations.");
      } catch (fallbackError) {
        console.error(
          "[Home Page] Failed to load fallback English translations:",
          fallbackError,
        );
        isSourceLanguage = false; // Explicitly set to false if fallback fails
      }
    }
  }
  // --- End Language Setup ---

  const availableModels = await getGroqModels();
  const gameIds = await gameStateManager.listGameIds();
  const gameStatesPromises = gameIds.map((id) =>
    gameStateManager.getFilteredGameState(id),
  );
  const gameStatesResults = await Promise.all(gameStatesPromises);
  const existingGames = gameStatesResults.filter(
    (state): state is FilteredGameState => state !== null,
  );

  const werewolfAITitle = translations.WerewolfAITitle || "Werewolf AI";
  const existingGamesHeading =
    translations.ExistingGamesHeading || "Existing Games";

  return (
    <main className=" mx-auto p-4 flex flex-col items-center space-y-8 min-h-screen">
      <h1 className="text-4xl font-bold mt-8 mb-6 text-center">
        {werewolfAITitle}
      </h1>

      <StartGameForm
        availableModels={availableModels}
        translations={translations}
        isSourceLanguage={isSourceLanguage}
      />

      {existingGames.length > 0 && (
        <div className="w-full mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">
            {existingGamesHeading}
          </h2>

          <ul className="space-y-3">
            {existingGames.map((game) => (
              <GameCard
                key={game.gameId}
                game={game}
                translations={translations}
              />
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

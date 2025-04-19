"use client"; // Make this a Client Component

import { useState, useEffect, use } from 'react'; // Import hooks
// import Link from "next/link"; // Removed unused Link import
import type { FilteredGameState } from "@/lib/types/game";
// import { getGroqModels } from "@/lib/groq/api";
// import { deleteGameAction } from "@/app/actions/index"; // Server Actions need care in Client Components
// import { Button } from "@/components/ui/button"; // Removed unused Button import
// import { format } from "date-fns"; // Removed unused format import
import StartGameForm from "@/components/StartGameForm";
import GameCard from "@/components/GameCard";

// Import i18n hook
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from "@/lib/i18n/settings"; // Use type import for LanguageCode

// Remove unused server i18n imports and TFunction

// Define PageProps
interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

export default function Home({ params: paramsPromise }: PageProps) {
  // Unwrap params using React.use()
  const params = use(paramsPromise) as { lang: LanguageCode };
  const { lang } = params;
  // Use the hook for translations
  const { t } = useTranslation();

  // State for server-fetched data
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [existingGames, /* setExistingGames */ ] = useState<FilteredGameState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // Add error state

  // Fetch data on the client from the API route
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null); // Clear previous errors

        // Fetch models from the API endpoint
        const response = await fetch('/api/models');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})); // Try to parse error, default to empty obj
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setAvailableModels(data.models || []); // Set models from response

        // TODO: Fetch existing games (replace placeholder)
        // const games = await fetchExistingGames();
        // setExistingGames(games);

      } catch (err) {
        console.error("Failed to fetch initial data:", err);
        setError(err instanceof Error ? err.message : "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []); // Empty dependency array ensures this runs once on mount

  // Use t directly for page-level translations
  const werewolfAITitle = t("WerewolfAITitle", "Werewolf AI");
  const existingGamesHeading = t("ExistingGamesTitle", "Existing Games");

  // Handle loading and error states
  if (loading) {
      return <div className="p-4 text-center">{t('Loading', 'Loading...')}</div>;
  }
  if (error) {
      return <div className="p-4 text-center text-destructive">{t('ErrorLoadingData', 'Error loading data')}: {error}</div>;
  }

  return (
    <main className=" mx-auto p-4 flex flex-col items-center space-y-8 min-h-screen">
      <h1 className="text-4xl font-bold mt-8 mb-6 text-center">
        {werewolfAITitle}
      </h1>

      {/* Pass necessary props to StartGameForm */}
      <StartGameForm availableModels={availableModels} lang={lang} />

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
      {/* TODO: Add a message if existingGames is empty after loading */}
    </main>
  );
}

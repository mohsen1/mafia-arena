import Link from 'next/link';
import { gameStateManager } from '@/lib/state/gameStateManager';
import { deleteGameAction, getOrGenerateTranslationsAction } from '@/app/actions';   
import { FilteredGameState } from '@/lib/types/game';
import StartGameForm from '@/components/StartGameForm';
import { getGroqModels } from '@/lib/groq/api';
import { Button } from '@/components/ui/button';
import { headers } from 'next/headers';
import { LanguageCode, supportedLanguagesMap } from '@/lib/translation/languages';

// Pass translations object to GameCard instead of t function
function GameCard({ game, translations }: { game: FilteredGameState, translations: Record<string, string> }) {
    // Simple lookup function within GameCard
    const t = (key: string, fallback: string) => translations[key] || fallback;
    const deleteThisGame = deleteGameAction.bind(null, game.gameId);

    return (
        <li className="flex justify-between items-start gap-4">
            <div className="flex-grow">
                <h3 className="text-lg font-semibold mb-1">
                    <Link href={`/game/${game.gameId}`} className="hover:underline">
                        {game.title || t('DefaultGameTitle', `Game ${game.gameId.substring(0, 8)}...`)}
                    </Link>
                </h3>
                {game.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-2">{game.description}</p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-500">
                    {t('GamePhaseLabel', 'Phase')}: <span className="font-medium capitalize">{t(`GamePhase${game.phase}`, game.phase)}</span> | 
                    {t('RoundLabel', 'Round')}: <span className="font-medium">{game.round}</span>
                </p>
            </div>
            <form action={deleteThisGame} className="flex-shrink-0">
                 <Button
                     type="submit" 
                     variant="outline"
                     size="sm"
                 >
                     {t('DeleteButton', 'Delete')}
                 </Button>
             </form>
        </li>
    );
}

// Define a standard PageProps type structure
interface PageProps {
    params: Promise<  { [key: string]: string }>;
    searchParams: Promise< { [key: string]: string | string[] | undefined }>
}

// Use the defined PageProps type for the Home component
export default async function Home({ searchParams }: PageProps) {
    // --- Language/Translation Setup --- 
    const headersList = await headers();
    const acceptLanguage = headersList.get('accept-language');
    
    // Prioritize lang query param, then header, then default
    const langFromParam = (await searchParams)?.lang;
    const potentialLangCodeFromHeader = acceptLanguage?.split(',')[0].split(';')[0].split('-')[0];
    const potentialLangCode = typeof langFromParam === 'string' ? langFromParam : (potentialLangCodeFromHeader || 'en');
    
    // Validate the potential language code using the keys of the map
    const validatedLangCode: LanguageCode = Object.keys(supportedLanguagesMap).includes(potentialLangCode)
        ? potentialLangCode as LanguageCode 
        : 'en'; // Default to 'en' if not supported
    
    let translations: Record<string, string> = {};
    try {
        // Use the validated code
        translations = await getOrGenerateTranslationsAction(validatedLangCode);
        console.log(`[Home Page] Loaded translations for: ${validatedLangCode}`); // Log loaded language
    } catch (error) {
        // Log error with the *validated* code used
        console.error(`[Home Page] Failed to load translations for ${validatedLangCode}:`, error);
        // Fallback logic remains the same, trying 'en'
        if (validatedLangCode !== 'en') { 
            try {
                 translations = await getOrGenerateTranslationsAction('en');
                 console.log(`[Home Page] Loaded fallback English translations.`);
            } catch (fallbackError) {
                 console.error(`[Home Page] Failed to load fallback English translations:`, fallbackError);
            }
        }
    }
    // --- End Language Setup --- 

    const availableModels = await getGroqModels(); 
    const gameIds = await gameStateManager.listGameIds();
    const gameStatesPromises = gameIds.map(id => gameStateManager.getFilteredGameState(id));
    const gameStatesResults = await Promise.all(gameStatesPromises);
    const existingGames = gameStatesResults.filter((state): state is FilteredGameState => state !== null);

    // Use translations directly for server component text
    const werewolfAITitle = translations['WerewolfAITitle'] || 'Werewolf AI';
    const existingGamesHeading = translations['ExistingGamesHeading'] || 'Existing Games';

    return (
        <main className=" mx-auto p-4 flex flex-col items-center space-y-8 min-h-screen">
            <h1 className="text-4xl font-bold mt-8 mb-6 text-center">{werewolfAITitle}</h1>

            {/* Pass translations object */}
            <StartGameForm availableModels={availableModels} translations={translations} />

            {existingGames.length > 0 && (
            <div className="w-full max-w-2xl mb-8">
                <h2 className="text-2xl font-semibold mb-4 text-center">{existingGamesHeading}</h2>
                
                    <ul className="space-y-3">
                        {existingGames.map((game) => (
                           <GameCard key={game.gameId} game={game} translations={translations} />
                        ))}
                    </ul>
                </div>
            )}
        </main>
    );
}

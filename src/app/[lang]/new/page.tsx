"use client"; // Make this a Client Component

import { useState, use, useEffect } from 'react'; // Import hooks
import { useSession } from 'next-auth/react';
// import Link from "next/link"; // Removed unused Link import
import type { FilteredGameState } from "@/lib/interfaces/client.types";
// import { getGroqModels } from "@/lib/groq/api";
// import { deleteGameAction } from "@/app/actions/index"; // Server Actions need care in Client Components
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LogIn, Loader2 } from "lucide-react";
// import { format } from "date-fns"; // Removed unused format import
import StartGameForm from "@/components/StartGameForm";
import GameCard from "@/components/GameCard";
import { Header } from "@/components/Header";

// Import i18n hook
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from "@/lib/i18n/settings"; // Use type import for LanguageCode

// Remove unused server i18n imports and TFunction

// Define PageProps
interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

function AuthProtectedContent({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();
  const [existingGames, /* setExistingGames */] = useState<FilteredGameState[]>([]);

  const werewolfAITitle = t("WerewolfAITitle", "Werewolf AI");
  const existingGamesHeading = t("ExistingGamesTitle", "Existing Games");

  return (
    <main className="mx-auto p-4 flex flex-col items-center space-y-8 min-h-screen">
      <h1 className="text-4xl font-bold mt-8 mb-6 text-center">
        {werewolfAITitle}
      </h1>

      <StartGameForm lang={lang} />

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

function UnauthenticatedView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();
  
  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />
      
      <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh] space-y-8">
        <div className="text-center max-w-2xl">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto mb-6 bg-primary/10 rounded-full flex items-center justify-center">
              <LogIn className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-foreground">
              {t('auth.authenticationRequired')}
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              {t('auth.authRequiredDescription')}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg">
              <Link href={`/${lang}/auth/signin`}>
                <LogIn className="w-5 h-5 me-2" />
                {t('auth.signInToContinue')}
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={`/${lang}`}>
                {t('common.backToHome')}
              </Link>
            </Button>
          </div>
          
          <div className="mt-12 p-6 bg-card/50 rounded-lg border">
            <h3 className="text-lg font-semibold mb-3 text-foreground">{t('auth.whySignIn')}</h3>
            <ul className="text-sm text-muted-foreground space-y-2 text-left">
              <li>• {t('auth.whySignInBenefits.0')}</li>
              <li>• {t('auth.whySignInBenefits.1')}</li>
              <li>• {t('auth.whySignInBenefits.2')}</li>
              <li>• {t('auth.whySignInBenefits.3')}</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

function LoadingView({ lang }: { lang: LanguageCode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />
      
      <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">Loading...</p>
        </div>
      </main>
    </div>
  );
}

export default function NewGamePage({ params: paramsPromise }: PageProps) {
  const params = use(paramsPromise) as { lang: LanguageCode };
  const { lang } = params;
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      // Don't redirect immediately, show the unauthenticated view instead
      return;
    }
  }, [status]);

  if (status === 'loading') {
    return <LoadingView lang={lang} />;
  }

  if (status === 'unauthenticated' || !session) {
    return <UnauthenticatedView lang={lang} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />
      <AuthProtectedContent lang={lang} />
    </div>
  );
}

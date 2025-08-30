'use client'; // Make this a Client Component

import { useState, use, useEffect } from 'react'; // Import hooks
import { useSession } from 'next-auth/react';
// import Link from "next/link"; // Removed unused Link import
import type { FilteredGameState } from '@/lib/interfaces/client.types';
// import { getGroqModels } from "@/lib/groq/api";
// import { deleteGameAction } from "@/app/actions/index"; // Server Actions need care in Client Components
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  LogIn,
  Loader2,
  Sparkles,
  Gamepad2,
  ArrowLeft,
  HelpCircle,
} from 'lucide-react';
// import { format } from "date-fns"; // Removed unused format import
import SimpleStartGameForm from '@/components/SimpleStartGameForm';
import GameCard from '@/components/GameCard';
import { ServerHeader } from '@/components/ServerHeader';
import { Footer } from '@/components/Footer';
import {
  GamePresetSelector,
  type GamePreset,
} from '@/components/GamePresetSelector';
import { motion, AnimatePresence } from 'framer-motion';
import { InteractiveTutorial } from '@/components/InteractiveTutorial';

// Import i18n hook
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from '@/lib/i18n/settings'; // Use type import for LanguageCode

// Remove unused server i18n imports and TFunction

// Define PageProps
interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

function AuthProtectedContent({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [existingGames /* setExistingGames */] = useState<FilteredGameState[]>(
    []
  );
  const [currentStep, setCurrentStep] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState<GamePreset | null>(null);
  const [showTutorial, setShowTutorial] = useState(false);

  const werewolfAITitle = t('WerewolfAITitle', 'Werewolf AI');
  const existingGamesHeading = t('ExistingGamesTitle', 'Existing Games');

  const handlePresetSelect = (preset: GamePreset) => {
    setSelectedPreset(preset);
    setCurrentStep('custom');
  };

  const handleBack = () => {
    setCurrentStep('preset');
    setSelectedPreset(null);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 flex flex-col items-center space-y-8 min-h-screen">
      {showTutorial && (
        <InteractiveTutorial onComplete={() => setShowTutorial(false)} />
      )}
      {/* Hero Section */}
      <div className="text-center space-y-4 max-w-2xl">
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
            <Gamepad2 className="w-12 h-12 text-primary relative z-10" />
          </div>
        </div>

        <h1 className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          {werewolfAITitle}
        </h1>

        <Button
          variant="outline"
          onClick={() => setShowTutorial(true)}
          className="mt-4"
          size="sm"
        >
          <HelpCircle className="w-4 h-4 mr-2" />
          {t('tutorial.showTutorial')}
        </Button>
      </div>

      {/* Game Creation Card */}
      <div className="w-full max-w-4xl">
        <AnimatePresence mode="wait">
          {currentStep === 'preset' ? (
            <motion.div
              key="preset"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <GamePresetSelector onSelect={handlePresetSelect} />
            </motion.div>
          ) : (
            <motion.div
              key="custom"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="mb-4"
              >
                <ArrowLeft className="w-4 h-4 me-2" />
                {t('common.back', 'Back to presets')}
              </Button>

              <div className="bg-card/50 backdrop-blur border rounded-2xl p-6 shadow-xl">
                <SimpleStartGameForm
                  lang={lang}
                  user={session?.user}
                  preset={selectedPreset}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Existing Games Section */}
      {existingGames.length > 0 && (
        <div className="w-full max-w-4xl space-y-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-primary" />
            <h2 className="text-3xl font-semibold">{existingGamesHeading}</h2>
          </div>

          <div className="grid gap-4">
            {existingGames.map((game) => (
              <GameCard key={game.gameId} game={game} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function UnauthenticatedView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <ServerHeader currentLang={lang} />

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
              <Link href={`/${lang}`}>{t('common.backToHome')}</Link>
            </Button>
          </div>

          <div className="mt-12 p-6 bg-card/50 rounded-lg border">
            <h3 className="text-lg font-semibold mb-3 text-foreground">
              {t('auth.whySignIn')}
            </h3>
            <ul className="text-sm text-muted-foreground space-y-2 text-left">
              <li>• {t('auth.whySignInBenefits.0')}</li>
              <li>• {t('auth.whySignInBenefits.1')}</li>
              <li>• {t('auth.whySignInBenefits.2')}</li>
              <li>• {t('auth.whySignInBenefits.3')}</li>
            </ul>
          </div>
        </div>
      </main>
      <Footer currentLang={lang} />
    </div>
  );
}

function LoadingView({ lang }: { lang: LanguageCode }) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <ServerHeader currentLang={lang} />

      <main className="mx-auto p-4 flex flex-col items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">{t('common.loading')}</p>
        </div>
      </main>
      <Footer currentLang={lang} />
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
      <ServerHeader currentLang={lang} />
      <AuthProtectedContent lang={lang} />
      <Footer currentLang={lang} />
    </div>
  );
}

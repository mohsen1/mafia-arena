'use client';

import { use } from 'react';
import { Header } from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import type { LanguageCode } from '@/lib/i18n/settings';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Moon, Sun, Shield, Eye, Heart, Gamepad2 } from 'lucide-react';

interface PageProps {
  params: Promise<{ lang: LanguageCode }>;
}

export default function HelpPage({ params: paramsPromise }: PageProps) {
  const params = use(paramsPromise);
  const { lang } = params;
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="max-w-4xl mx-auto p-4 space-y-8">
        <div className="mt-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link href={`/${lang}`}>
              <ArrowLeft className="w-4 h-4 me-2" />
              {t('common.backToHome', 'Back to Home')}
            </Link>
          </Button>
          
          <h1 className="text-4xl font-bold text-foreground mb-2">
            {t('help.title', 'How to Play Werewolf AI')}
          </h1>
          <p className="text-muted-foreground">
            {t('help.subtitle', 'Learn the rules and strategies for playing Werewolf with AI characters')}
          </p>
        </div>

        {/* Game Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5" />
              {t('help.overview.title', 'Game Overview')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              {t('help.overview.description', 
                'Werewolf AI is a social deduction game where you play alongside intelligent AI characters. The game is divided into two teams: the Villagers and the Mafia (Werewolves). The Villagers must identify and eliminate all Mafia members, while the Mafia tries to eliminate Villagers without being discovered.'
              )}
            </p>
            <div className="bg-secondary/30 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">{t('help.overview.objective', 'Objective')}</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>{t('help.overview.villagerWin', 'Villagers win by eliminating all Mafia members')}</li>
                <li>{t('help.overview.mafiaWin', 'Mafia wins when they equal or outnumber the Villagers')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t('help.roles.title', 'Character Roles')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Villager */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />
                {t('help.roles.villager.name', 'Villager')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('help.roles.villager.description', 
                  'Regular townspeople with no special abilities. They must use deduction and observation to identify the Mafia members during day discussions.'
                )}
              </p>
            </div>

            {/* Mafia */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Moon className="w-4 h-4" />
                {t('help.roles.mafia.name', 'Mafia')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('help.roles.mafia.description', 
                  'Evil players who know each other\'s identities. They secretly eliminate one Villager each night and must blend in during day discussions to avoid detection.'
                )}
              </p>
            </div>

            {/* Seer */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Eye className="w-4 h-4" />
                {t('help.roles.seer.name', 'Seer')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('help.roles.seer.description', 
                  'A special Villager who can investigate one player each night to learn if they are Mafia or not. Must share information carefully to avoid becoming a target.'
                )}
              </p>
            </div>

            {/* Doctor */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Heart className="w-4 h-4" />
                {t('help.roles.doctor.name', 'Doctor')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t('help.roles.doctor.description', 
                  'A special Villager who can protect one player each night from Mafia elimination. Cannot protect the same player two nights in a row.'
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Game Phases */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5" />
              {t('help.phases.title', 'Game Phases')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Day Phase */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Sun className="w-4 h-4" />
                {t('help.phases.day.name', 'Day Phase')}
              </h4>
              <p className="text-sm text-muted-foreground mb-2">
                {t('help.phases.day.description', 
                  'All players discuss and debate to identify suspicious behavior. The phase ends with a vote to eliminate a suspected Mafia member.'
                )}
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 ms-4">
                <li>{t('help.phases.day.discussion', 'Players share observations and suspicions')}</li>
                <li>{t('help.phases.day.accusation', 'Players can accuse others of being Mafia')}</li>
                <li>{t('help.phases.day.voting', 'All alive players vote to eliminate one player')}</li>
                <li>{t('help.phases.day.elimination', 'The player with the most votes is eliminated')}</li>
              </ul>
            </div>

            {/* Night Phase */}
            <div className="space-y-2">
              <h4 className="font-semibold flex items-center gap-2">
                <Moon className="w-4 h-4" />
                {t('help.phases.night.name', 'Night Phase')}
              </h4>
              <p className="text-sm text-muted-foreground mb-2">
                {t('help.phases.night.description', 
                  'Special roles perform their actions in secret. The Mafia chooses a victim, while the Seer investigates and the Doctor protects.'
                )}
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 ms-4">
                <li>{t('help.phases.night.mafia', 'Mafia members choose a Villager to eliminate')}</li>
                <li>{t('help.phases.night.seer', 'Seer investigates one player\'s alignment')}</li>
                <li>{t('help.phases.night.doctor', 'Doctor chooses one player to protect')}</li>
                <li>{t('help.phases.night.reveal', 'Night results are revealed at dawn')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Playing with AI */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              {t('help.ai.title', 'Playing with AI Characters')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              {t('help.ai.description', 
                'Each AI character has a unique personality and playing style. They will engage in discussions, make accusations, and vote based on their observations and role.'
              )}
            </p>
            
            <div className="space-y-3">
              <h4 className="font-semibold">{t('help.ai.features.title', 'AI Features')}</h4>
              <ul className="list-disc list-inside text-sm space-y-1 ms-4">
                <li>{t('help.ai.features.personality', 'Unique personalities with period-appropriate names and backgrounds')}</li>
                <li>{t('help.ai.features.memory', 'Remember previous discussions and player actions')}</li>
                <li>{t('help.ai.features.strategy', 'Strategic thinking based on their role and game state')}</li>
                <li>{t('help.ai.features.deduction', 'Logical deduction to identify suspicious behavior')}</li>
                <li>{t('help.ai.features.deception', 'Mafia AI will lie and create false alibis')}</li>
              </ul>
            </div>

            <div className="bg-secondary/30 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">{t('help.ai.tips.title', 'Tips for Playing with AI')}</h4>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>{t('help.ai.tips.observe', 'Pay attention to AI voting patterns and accusations')}</li>
                <li>{t('help.ai.tips.engage', 'Engage in discussions to gather information')}</li>
                <li>{t('help.ai.tips.trust', 'Build trust with Villager AI to form alliances')}</li>
                <li>{t('help.ai.tips.suspicious', 'Watch for inconsistencies in AI stories')}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Getting Started */}
        <Card>
          <CardHeader>
            <CardTitle>{t('help.start.title', 'Getting Started')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-2">
              <li>{t('help.start.step1', 'Click "Play Now" or "Start New Game" from the home page')}</li>
              <li>{t('help.start.step2', 'Choose the number of players (4-10 recommended)')}</li>
              <li>{t('help.start.step3', 'Select whether you want to join as a human player')}</li>
              <li>{t('help.start.step4', 'Configure AI providers if you have API keys')}</li>
              <li>{t('help.start.step5', 'Click "Start Game" and enjoy!')}</li>
            </ol>
            
            <div className="pt-4">
              <Button asChild size="lg">
                <Link href={`/${lang}/new`}>
                  <Gamepad2 className="w-4 h-4 me-2" />
                  {t('help.start.playNow', 'Play Now')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
} 
'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BookOpen,
  Users,
  Shield,
  Target,
  MessageCircle,
  Trophy,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/common/Header';
import { Footer } from '@/components/common/Footer';
import { useParams } from 'next/navigation';
import type { LanguageCode } from '@/lib/i18n/settings';

interface HelpSection {
  icon: React.ReactNode;
  titleKey: string;
  descriptionKey: string;
  contentKeys: string[];
}

export function HelpPageContent() {
  const { t } = useTranslation();
  const params = useParams();
  const lang = params.lang as LanguageCode;

  const helpSections: HelpSection[] = [
    {
      icon: <BookOpen className="w-5 h-5" />,
      titleKey: 'help.gettingStarted.title',
      descriptionKey: 'help.gettingStarted.description',
      contentKeys: [
        'help.gettingStarted.content1',
        'help.gettingStarted.content2',
        'help.gettingStarted.content3',
        'help.gettingStarted.content4',
      ],
    },
    {
      icon: <Users className="w-5 h-5" />,
      titleKey: 'help.rolesTeams.title',
      descriptionKey: 'help.rolesTeams.description',
      contentKeys: [
        'help.rolesTeams.villager',
        'help.rolesTeams.werewolf',
        'help.rolesTeams.doctor',
        'help.rolesTeams.seer',
        'help.rolesTeams.winConditions',
      ],
    },
    {
      icon: <Shield className="w-5 h-5" />,
      titleKey: 'help.gamePhases.title',
      descriptionKey: 'help.gamePhases.description',
      contentKeys: [
        'help.gamePhases.day',
        'help.gamePhases.voting',
        'help.gamePhases.night',
        'help.gamePhases.nightActions',
        'help.gamePhases.alternation',
      ],
    },
    {
      icon: <Target className="w-5 h-5" />,
      titleKey: 'help.winConditions.title',
      descriptionKey: 'help.winConditions.description',
      contentKeys: [
        'help.winConditions.townVictory',
        'help.winConditions.werewolfVictory',
        'help.winConditions.balance',
        'help.winConditions.strategy',
      ],
    },
    {
      icon: <MessageCircle className="w-5 h-5" />,
      titleKey: 'help.communication.title',
      descriptionKey: 'help.communication.description',
      contentKeys: [
        'help.communication.publicChat',
        'help.communication.werewolfChat',
        'help.communication.votingRules',
        'help.communication.timing',
        'help.communication.aiBehavior',
      ],
    },
    {
      icon: <Trophy className="w-5 h-5" />,
      titleKey: 'help.tips.title',
      descriptionKey: 'help.tips.description',
      contentKeys: [
        'help.tips.asTown',
        'help.tips.asWerewolf',
        'help.tips.votingAnalysis',
        'help.tips.psychology',
        'help.tips.powerRoles',
        'help.tips.general',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header currentLang={lang} />

      <main className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4">{t('help.title')}</h1>
          <p className="text-lg text-muted-foreground">{t('help.subtitle')}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {helpSections.map((section, index) => (
            <Card key={index} className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {section.icon}
                  {t(section.titleKey)}
                </CardTitle>
                <CardDescription>{t(section.descriptionKey)}</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <ul className="space-y-2">
                    {section.contentKeys.map((contentKey, itemIndex) => (
                      <li key={itemIndex} className="text-sm leading-relaxed">
                        {t(contentKey)}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>{t('help.readyToPlay.title')}</CardTitle>
            <CardDescription>
              {t('help.readyToPlay.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4">{t('help.readyToPlay.content')}</p>
            <div className="flex gap-4">
              <Link
                href={`/${lang}/new`}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                {t('help.readyToPlay.startNewGame')}
              </Link>
              <Link
                href={`/${lang}/games`}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              >
                {t('help.readyToPlay.viewMyGames')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>

      <Footer currentLang={lang} />
    </div>
  );
}

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

interface HelpSection {
  icon: React.ReactNode;
  title: string;
  description: string;
  content: string[];
}

export function HelpPageContent() {
  const helpSections: HelpSection[] = [
    {
      icon: <BookOpen className="w-5 h-5" />,
      title: 'Getting Started',
      description: 'Learn the basics of Werewolf AI',
      content: [
        'Werewolf AI is a social deduction game where you play alongside intelligent AI characters, each with unique personalities.',
        'The game pits an informed minority (Werewolves) against an uninformed majority (Villagers).',
        'Games typically last 15-30 minutes and require strategic thinking, deduction, and social skills.',
        'You can play as either a human player or observe AI-only games to learn strategies.',
      ],
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: 'Roles & Teams',
      description: 'Understanding the different roles in the game',
      content: [
        '👥 VILLAGER: Basic town member with no special abilities. Must use deduction and voting to find werewolves.',
        "🐺 WEREWOLF (MAFIA): Secret team that eliminates villagers at night. Know each other's identities.",
        '💊 DOCTOR: Can protect one player each night from elimination (cannot protect the same player twice in a row).',
        '🔮 SEER: Can investigate one player each night to discover if they are a werewolf or not.',
        'Town Team wins by eliminating all werewolves. Werewolf Team wins when they equal or outnumber the town.',
      ],
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: 'Game Phases',
      description: 'How the game progresses through different phases',
      content: [
        '🌅 DAY PHASE: All living players discuss who might be werewolves. Everyone can see the chat.',
        '🗳️ VOTING: Players vote to eliminate someone they suspect. Majority vote wins. Ties result in no elimination.',
        '🌙 NIGHT PHASE: Town sleeps. Werewolves secretly choose a victim to eliminate.',
        "🛡️ NIGHT ACTIONS: Doctor chooses someone to protect. Seer investigates a player's role.",
        'The game alternates between Day and Night until one team achieves victory.',
      ],
    },
    {
      icon: <Target className="w-5 h-5" />,
      title: 'Win Conditions',
      description: 'How each team achieves victory',
      content: [
        '🏘️ TOWN VICTORY: All werewolves have been eliminated through voting.',
        '🐺 WEREWOLF VICTORY: Werewolves equal or outnumber the remaining town members.',
        '⚖️ BALANCE: The game is carefully balanced - town has numbers and special roles, werewolves have information and coordination.',
        '🎯 STRATEGY: Town must work together to identify suspicious behavior. Werewolves must blend in while eliminating key targets.',
      ],
    },
    {
      icon: <MessageCircle className="w-5 h-5" />,
      title: 'Communication & Voting',
      description: 'How to interact and make decisions',
      content: [
        '💬 PUBLIC CHAT: During day phase, all players can discuss openly. Dead players cannot communicate.',
        '🐺 WEREWOLF CHAT: Werewolves have private chat during night phase to coordinate their actions.',
        '🗳️ VOTING RULES: Each player gets one vote. You can change your vote until voting ends.',
        '⏱️ TIMING: Each phase has a time limit. AI players will act within realistic time frames.',
        '🤖 AI BEHAVIOR: Each AI has unique personality traits affecting how they communicate and vote.',
      ],
    },
    {
      icon: <Trophy className="w-5 h-5" />,
      title: 'Tips & Strategies',
      description: 'Improve your gameplay with these tips',
      content: [
        '🔍 AS TOWN: Watch for voting patterns, defensive behavior, and players who avoid contributing to discussions.',
        '🎭 AS WEREWOLF: Act like a villager, contribute to discussions, and occasionally vote against your teammates to avoid suspicion.',
        '📊 VOTING ANALYSIS: Pay attention to who votes together and who avoids voting for certain players.',
        '🧠 PSYCHOLOGY: AI players have consistent personalities - learn their patterns to better predict their behavior.',
        '⚡ POWER ROLES: Doctor and Seer should be subtle about their roles to avoid becoming werewolf targets.',
        '💡 GENERAL TIP: The best players balance logical deduction with reading social cues and behavioral patterns.',
      ],
    },
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-4">How to Play Werewolf AI</h1>
        <p className="text-lg text-muted-foreground">
          Master the art of deduction and deception in this social strategy game
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {helpSections.map((section, index) => (
          <Card key={index} className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {section.icon}
                {section.title}
              </CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-48">
                <ul className="space-y-2">
                  {section.content.map((item, itemIndex) => (
                    <li key={itemIndex} className="text-sm leading-relaxed">
                      {item}
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
          <CardTitle>Ready to Play?</CardTitle>
          <CardDescription>
            Start your journey in Werewolf AI and test your deduction skills
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            Now that you understand the basics, you&apos;re ready to create or join a game. 
            Remember, each AI player has a unique personality that influences their decisions 
            and communication style. Good luck!
          </p>
          <div className="flex gap-4">
            <Link href="/new" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Start New Game
            </Link>
            <Link href="/games" className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
              View My Games
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

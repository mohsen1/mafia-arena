'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  Star,
  Award,
  Target,
  Shield,
  Eye,
  Heart,
  Zap,
  Crown,
  Users,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface GameAchievementsProps {
  gameState: FilteredGameState;
  className?: string;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: 'gameplay' | 'social' | 'strategy' | 'special';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  progress?: number;
  maxProgress?: number;
  unlocked: boolean;
  unlockedAt?: Date;
}

const ACHIEVEMENT_DEFINITIONS: Omit<
  Achievement,
  'unlocked' | 'unlockedAt' | 'progress'
>[] = [
  // Gameplay Achievements
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Be the first to cast a vote',
    icon: <Target className="w-4 h-4" />,
    category: 'gameplay',
    rarity: 'common',
  },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Survive until the end of the game',
    icon: <Shield className="w-4 h-4" />,
    category: 'gameplay',
    rarity: 'common',
  },
  {
    id: 'detective',
    name: 'Detective',
    description: 'Successfully identify a Mafia member as Seer',
    icon: <Eye className="w-4 h-4" />,
    category: 'strategy',
    rarity: 'rare',
  },
  {
    id: 'guardian_angel',
    name: 'Guardian Angel',
    description: 'Save someone from elimination as Doctor',
    icon: <Heart className="w-4 h-4" />,
    category: 'strategy',
    rarity: 'rare',
  },
  {
    id: 'mastermind',
    name: 'Mastermind',
    description: 'Win as Mafia without losing any members',
    icon: <Crown className="w-4 h-4" />,
    category: 'strategy',
    rarity: 'legendary',
  },
  {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Send 20+ messages in a single game',
    icon: <MessageSquare className="w-4 h-4" />,
    category: 'social',
    rarity: 'common',
    maxProgress: 20,
  },
  {
    id: 'consensus_builder',
    name: 'Consensus Builder',
    description: 'Have 3+ players vote the same as you',
    icon: <Users className="w-4 h-4" />,
    category: 'social',
    rarity: 'rare',
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    description: 'Win a game in under 5 rounds',
    icon: <Zap className="w-4 h-4" />,
    category: 'special',
    rarity: 'epic',
  },
  {
    id: 'underdog',
    name: 'Underdog',
    description: 'Win as the last Town member against 2 Mafia',
    icon: <Award className="w-4 h-4" />,
    category: 'special',
    rarity: 'legendary',
  },
];

export function GameAchievements({
  gameState,
  className,
}: GameAchievementsProps) {
  const { t } = useTranslation();
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [previousUnlocked, setPreviousUnlocked] = useState<Set<string>>(
    new Set()
  );

  // Check achievements based on game state
  const achievements = useMemo((): Achievement[] => {
    const humanPlayer = gameState.humanPlayerId
      ? gameState.players[gameState.humanPlayerId]
      : null;

    if (!humanPlayer) return [];

    return ACHIEVEMENT_DEFINITIONS.map((def) => {
      let unlocked = false;
      let progress = 0;

      switch (def.id) {
        case 'first_blood':
          // Check if human was first to vote in any round
          const firstVote = gameState.log.find((msg) =>
            msg.content.includes('votes for')
          );
          unlocked = firstVote?.senderId === gameState.humanPlayerId;
          break;

        case 'survivor':
          unlocked =
            gameState.phase === 'GameOver' && humanPlayer.status === 'Alive';
          break;

        case 'detective':
          if (humanPlayer.role === 'Seer') {
            // Check if player investigated a mafia member
            const investigations = gameState.log.filter(
              (msg) =>
                msg.senderId === 'system' &&
                msg.recipientId === gameState.humanPlayerId &&
                msg.content.includes('investigation reveals')
            );
            unlocked = investigations.some((msg) =>
              msg.content.includes('Mafia')
            );
          }
          break;

        case 'guardian_angel':
          if (humanPlayer.role === 'Doctor') {
            // Check if player saved someone
            unlocked = gameState.log.some((msg) =>
              msg.content.includes('was saved by the Doctor')
            );
          }
          break;

        case 'mastermind':
          if (humanPlayer.role === 'Mafia' && gameState.phase === 'GameOver') {
            const mafiaPlayers = Object.values(gameState.players).filter(
              (p) => p.isMafia
            );
            const allAlive = mafiaPlayers.every((p) => p.status === 'Alive');
            const mafiaWon = gameState.log.some((msg) =>
              msg.content.includes('Mafia wins')
            );
            unlocked = mafiaWon && allAlive;
          }
          break;

        case 'social_butterfly':
          const messageCount = gameState.log.filter(
            (msg) =>
              msg.senderId === gameState.humanPlayerId && msg.type === 'chat'
          ).length;
          progress = Math.min(messageCount, def.maxProgress || 20);
          unlocked = messageCount >= 20;
          break;

        case 'consensus_builder':
          // Check voting patterns
          const humanVotes = gameState.log.filter(
            (msg) =>
              msg.senderId === gameState.humanPlayerId &&
              msg.content.includes('votes for')
          );
          if (humanVotes.length > 0) {
            const lastVote = humanVotes[humanVotes.length - 1];
            const target = lastVote.content.match(/votes for (.+)$/)?.[1];
            if (target) {
              const sameVotes = gameState.log.filter(
                (msg) =>
                  msg.round === lastVote.round &&
                  msg.content.includes(`votes for ${target}`)
              ).length;
              unlocked = sameVotes >= 4; // Including human's vote
            }
          }
          break;

        case 'speed_demon':
          if (
            gameState.phase === 'GameOver' &&
            humanPlayer.status === 'Alive'
          ) {
            unlocked = gameState.round <= 5;
          }
          break;

        case 'underdog':
          if (
            gameState.phase === 'GameOver' &&
            humanPlayer.status === 'Alive' &&
            !humanPlayer.isMafia
          ) {
            const finalLog = gameState.log.slice(-20);
            const underworldScenario = finalLog.some((msg) =>
              msg.content.includes('1 Town vs 2 Mafia')
            );
            const townWon = gameState.log.some((msg) =>
              msg.content.includes('Town wins')
            );
            unlocked = underworldScenario && townWon;
          }
          break;
      }

      return {
        ...def,
        unlocked,
        progress,
        unlockedAt: unlocked ? new Date() : undefined,
      };
    });
  }, [gameState]);

  // Detect newly unlocked achievements
  useEffect(() => {
    const currentUnlocked = new Set(
      achievements.filter((a) => a.unlocked).map((a) => a.id)
    );

    const newlyUnlocked = Array.from(currentUnlocked).filter(
      (id) => !previousUnlocked.has(id)
    );

    if (newlyUnlocked.length > 0) {
      setNewAchievements(newlyUnlocked);
      setPreviousUnlocked(currentUnlocked);

      // Show toast notifications
      newlyUnlocked.forEach((id) => {
        const achievement = achievements.find((a) => a.id === id);
        if (achievement) {
          toast.success(achievement.name, {
            description: t('AchievementUnlocked', 'Achievement Unlocked!'),
            duration: 5000,
          });
        }
      });
    }
  }, [achievements, previousUnlocked, t]);

  // Group achievements by category
  const achievementsByCategory = useMemo(() => {
    const grouped = achievements.reduce(
      (acc, achievement) => {
        if (!acc[achievement.category]) {
          acc[achievement.category] = [];
        }
        acc[achievement.category].push(achievement);
        return acc;
      },
      {} as Record<string, Achievement[]>
    );

    return grouped;
  }, [achievements]);

  const getRarityColor = (rarity: Achievement['rarity']) => {
    switch (rarity) {
      case 'common':
        return 'text-gray-500';
      case 'rare':
        return 'text-blue-500';
      case 'epic':
        return 'text-purple-500';
      case 'legendary':
        return 'text-orange-500';
    }
  };

  const getRarityBg = (rarity: Achievement['rarity']) => {
    switch (rarity) {
      case 'common':
        return 'bg-gray-500/10';
      case 'rare':
        return 'bg-blue-500/10';
      case 'epic':
        return 'bg-purple-500/10';
      case 'legendary':
        return 'bg-orange-500/10';
    }
  };

  const totalAchievements = achievements.length;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const completionPercentage =
    totalAchievements > 0 ? (unlockedCount / totalAchievements) * 100 : 0;

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            {t('Achievements', 'Achievements')}
          </span>
          <Badge variant="outline" className="text-xs">
            {unlockedCount}/{totalAchievements}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-3">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t('CompletionProgress', 'Completion Progress')}
            </span>
            <span className="font-medium">
              {Math.round(completionPercentage)}%
            </span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
        </div>

        {/* Achievement Categories */}
        <TooltipProvider>
          <div className="space-y-3">
            {Object.entries(achievementsByCategory).map(
              ([category, categoryAchievements]) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground capitalize">
                    {t(`Category.${category}`, category)}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {categoryAchievements.map((achievement) => (
                      <Tooltip key={achievement.id}>
                        <TooltipTrigger asChild>
                          <motion.div
                            className={cn(
                              'relative p-2 rounded-lg border cursor-pointer',
                              'transition-all duration-200',
                              achievement.unlocked
                                ? getRarityBg(achievement.rarity)
                                : 'bg-muted/30 opacity-60',
                              newAchievements.includes(achievement.id) &&
                                'ring-2 ring-primary'
                            )}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <AnimatePresence>
                              {newAchievements.includes(achievement.id) && (
                                <motion.div
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0, opacity: 0 }}
                                  className="absolute -top-1 -right-1"
                                >
                                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  achievement.unlocked
                                    ? getRarityColor(achievement.rarity)
                                    : 'text-muted-foreground'
                                )}
                              >
                                {achievement.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">
                                  {achievement.name}
                                </p>
                                {achievement.maxProgress && (
                                  <div className="mt-1">
                                    <Progress
                                      value={
                                        ((achievement.progress || 0) /
                                          achievement.maxProgress) *
                                        100
                                      }
                                      className="h-1"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="space-y-1">
                            <p className="font-semibold">{achievement.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {achievement.description}
                            </p>
                            <div className="flex items-center gap-2 text-xs">
                              <Badge
                                variant="secondary"
                                className={cn(
                                  'text-xs',
                                  getRarityColor(achievement.rarity)
                                )}
                              >
                                {t(
                                  `Rarity.${achievement.rarity}`,
                                  achievement.rarity
                                )}
                              </Badge>
                              {achievement.unlocked && (
                                <span className="text-green-500">
                                  ✓ {t('Unlocked')}
                                </span>
                              )}
                            </div>
                            {achievement.maxProgress && (
                              <p className="text-xs">
                                {t('Progress')}: {achievement.progress || 0}/
                                {achievement.maxProgress}
                              </p>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

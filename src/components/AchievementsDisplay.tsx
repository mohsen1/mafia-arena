'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Trophy,
  Star,
  Lock,
  TrendingUp,
  Award,
  Users,
  Target,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type {
  Achievement,
  AchievementProgress,
  UserAchievements,
} from '@/lib/achievements';
import {
  ACHIEVEMENTS,
  getAchievementById,
  getAchievementsByCategory,
  calculateTotalPoints,
} from '@/lib/achievements';

interface AchievementsDisplayProps {
  userAchievements: UserAchievements;
  className?: string;
}

export function AchievementsDisplay({
  userAchievements,
  className,
}: AchievementsDisplayProps) {
  const { t } = useTranslation();
  const [selectedCategory, setSelectedCategory] = useState<
    Achievement['category'] | 'all'
  >('all');
  const [showHidden, setShowHidden] = useState(false);

  const achievementMap = new Map(
    userAchievements.achievements.map((a) => [a.achievementId, a])
  );

  const filteredAchievements =
    selectedCategory === 'all'
      ? ACHIEVEMENTS
      : getAchievementsByCategory(selectedCategory as Achievement['category']);

  const displayAchievements = filteredAchievements.filter((achievement) => {
    if (achievement.hidden && !showHidden) {
      const progress = achievementMap.get(achievement.id);
      return progress && progress.unlockedAt;
    }
    return true;
  });

  const totalPossiblePoints = ACHIEVEMENTS.reduce(
    (sum, a) => sum + a.points,
    0
  );
  const earnedPoints = calculateTotalPoints(userAchievements.achievements);
  const completionPercentage = Math.round(
    (earnedPoints / totalPossiblePoints) * 100
  );

  const categoryIcons = {
    gameplay: <Target className="w-4 h-4" />,
    social: <Users className="w-4 h-4" />,
    milestone: <TrendingUp className="w-4 h-4" />,
    special: <Sparkles className="w-4 h-4" />,
  };

  const categoryStats = {
    gameplay: { unlocked: 0, total: 0 },
    social: { unlocked: 0, total: 0 },
    milestone: { unlocked: 0, total: 0 },
    special: { unlocked: 0, total: 0 },
  };

  ACHIEVEMENTS.forEach((achievement) => {
    categoryStats[achievement.category].total++;
    const progress = achievementMap.get(achievement.id);
    if (progress?.unlockedAt) {
      categoryStats[achievement.category].unlocked++;
    }
  });

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            {t('achievements.title', 'Achievements')}
          </span>
          <Badge variant="secondary" className="text-lg px-3 py-1">
            {earnedPoints} / {totalPossiblePoints} {t('achievements.points', 'points')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{t('achievements.overallProgress', 'Overall Progress')}</span>
            <span>{completionPercentage}%</span>
          </div>
          <Progress value={completionPercentage} className="h-3" />
        </div>

        {/* Category Tabs */}
        <Tabs
          value={selectedCategory}
          onValueChange={(value: string) =>
            setSelectedCategory(value as Achievement['category'] | 'all')
          }
        >
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="all" className="text-xs">
              <Award className="w-3 h-3 me-1" />
              {t('achievements.all', 'All')}
            </TabsTrigger>
            <TabsTrigger value="gameplay" className="text-xs">
              {categoryIcons.gameplay}
              <span className="ms-1">
                {categoryStats.gameplay.unlocked}/{categoryStats.gameplay.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="social" className="text-xs">
              {categoryIcons.social}
              <span className="ms-1">
                {categoryStats.social.unlocked}/{categoryStats.social.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="milestone" className="text-xs">
              {categoryIcons.milestone}
              <span className="ms-1">
                {categoryStats.milestone.unlocked}/{categoryStats.milestone.total}
              </span>
            </TabsTrigger>
            <TabsTrigger value="special" className="text-xs">
              {categoryIcons.special}
              <span className="ms-1">
                {categoryStats.special.unlocked}/{categoryStats.special.total}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedCategory} className="mt-4">
            <div className="grid gap-3 max-h-[400px] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {displayAchievements.map((achievement) => {
                  const progress = achievementMap.get(achievement.id);
                  const isUnlocked = progress?.unlockedAt !== undefined;
                  const isHidden = achievement.hidden && !isUnlocked;

                  return (
                    <motion.div
                      key={achievement.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      layout
                    >
                      <Card
                        className={cn(
                          'transition-all',
                          isUnlocked
                            ? 'bg-primary/5 border-primary/20'
                            : 'bg-muted/30',
                          isHidden && 'opacity-60'
                        )}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Icon */}
                            <div
                              className={cn(
                                'text-3xl flex-shrink-0 transition-all',
                                isUnlocked
                                  ? 'opacity-100 scale-110'
                                  : 'opacity-50 grayscale'
                              )}
                            >
                              {isHidden ? '❓' : achievement.icon}
                            </div>

                            {/* Content */}
                            <div className="flex-1 space-y-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4
                                    className={cn(
                                      'font-medium',
                                      isHidden && 'text-muted-foreground'
                                    )}
                                  >
                                    {isHidden
                                      ? t('achievements.hidden', 'Hidden Achievement')
                                      : achievement.name}
                                  </h4>
                                  {!isHidden && (
                                    <p className="text-sm text-muted-foreground">
                                      {achievement.description}
                                    </p>
                                  )}
                                </div>
                                <Badge
                                  variant={isUnlocked ? 'default' : 'outline'}
                                  className="ms-2"
                                >
                                  {achievement.points} pts
                                </Badge>
                              </div>

                              {/* Progress Bar */}
                              {progress && !isUnlocked && progress.maxProgress > 1 && (
                                <div className="space-y-1">
                                  <Progress
                                    value={(progress.progress / progress.maxProgress) * 100}
                                    className="h-2"
                                  />
                                  <p className="text-xs text-muted-foreground text-end">
                                    {progress.progress} / {progress.maxProgress}
                                  </p>
                                </div>
                              )}

                              {/* Unlock Date */}
                              {isUnlocked && progress?.unlockedAt && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Star className="w-3 h-3" />
                                  {t('achievements.unlockedOn', 'Unlocked on')}{' '}
                                  {new Date(progress.unlockedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>

                            {/* Lock Icon for Locked Achievements */}
                            {!isUnlocked && !isHidden && (
                              <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </TabsContent>
        </Tabs>

        {/* Show Hidden Toggle */}
        <div className="flex items-center justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHidden(!showHidden)}
            className="text-xs"
          >
            {showHidden
              ? t('achievements.hideSecret', 'Hide Secret Achievements')
              : t('achievements.showSecret', 'Show Secret Achievements')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
} 
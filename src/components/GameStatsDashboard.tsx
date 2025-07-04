'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Trophy,
  Target,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  Zap,
  Shield,
  Sword,
  Eye,
  Heart,
  Star,
  Award,
  Calendar,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { GameListItem } from '@/app/actions/games';

interface GameStatsDashboardProps {
  games: GameListItem[];
  className?: string;
}

interface RoleStats {
  role: string;
  gamesPlayed: number;
  wins: number;
  winRate: number;
}

interface GameStats {
  totalGames: number;
  completedGames: number;
  activeGames: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  favoriteRole: string | null;
  averageGameDuration: number;
  longestStreak: number;
  currentStreak: number;
  roleStats: RoleStats[];
  recentPerformance: number[];
}

function calculateGameStats(games: GameListItem[]): GameStats {
  const completedGames = games.filter((g) => g.status === 'completed');
  const activeGames = games.filter((g) => g.status === 'active');

  // Calculate wins/losses
  let totalWins = 0;
  let totalLosses = 0;
  const roleStatsMap = new Map<string, { played: number; won: number }>();

  completedGames.forEach((game) => {
    const winCondition = game.winCondition as { outcome?: string } | null;
    const outcome = winCondition?.outcome;

    // Assuming the player played as Town most of the time
    const playerWon = outcome?.includes('Town');

    if (playerWon) {
      totalWins++;
    } else {
      totalLosses++;
    }

    // Track role stats (would need actual player role data)
    // For now, using placeholder data
    const role = 'Villager'; // This would come from actual game data
    const stats = roleStatsMap.get(role) || { played: 0, won: 0 };
    stats.played++;
    if (playerWon) stats.won++;
    roleStatsMap.set(role, stats);
  });

  // Calculate role statistics
  const roleStats: RoleStats[] = Array.from(roleStatsMap.entries()).map(
    ([role, stats]) => ({
      role,
      gamesPlayed: stats.played,
      wins: stats.won,
      winRate: stats.played > 0 ? (stats.won / stats.played) * 100 : 0,
    })
  );

  // Find favorite role
  const favoriteRole =
    roleStats.reduce(
      (fav, curr) => (curr.gamesPlayed > (fav?.gamesPlayed || 0) ? curr : fav),
      null as RoleStats | null
    )?.role || null;

  // Calculate average game duration (placeholder)
  const averageGameDuration = 25; // minutes

  // Calculate streaks (placeholder)
  const longestStreak = 5;
  const currentStreak = 2;

  // Recent performance (last 10 games)
  const recentPerformance = completedGames.slice(-10).map((game) => {
    const winCondition = game.winCondition as { outcome?: string } | null;
    return winCondition?.outcome?.includes('Town') ? 1 : 0;
  });

  return {
    totalGames: games.length,
    completedGames: completedGames.length,
    activeGames: activeGames.length,
    totalWins,
    totalLosses,
    winRate:
      completedGames.length > 0 ? (totalWins / completedGames.length) * 100 : 0,
    favoriteRole,
    averageGameDuration,
    longestStreak,
    currentStreak,
    roleStats,
    recentPerformance,
  };
}

export function GameStatsDashboard({
  games,
  className,
}: GameStatsDashboardProps) {
  const { t } = useTranslation();
  const stats = useMemo(() => calculateGameStats(games), [games]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Villager':
        return <Users className="h-4 w-4" />;
      case 'Mafia':
      case 'Werewolf':
        return <Sword className="h-4 w-4" />;
      case 'Seer':
        return <Eye className="h-4 w-4" />;
      case 'Doctor':
        return <Heart className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const statCards = [
    {
      title: t('stats.totalGames', 'Total Games'),
      value: stats.totalGames,
      icon: Trophy,
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    },
    {
      title: t('stats.winRate', 'Win Rate'),
      value: `${Math.round(stats.winRate)}%`,
      icon: stats.winRate >= 50 ? TrendingUp : TrendingDown,
      color:
        stats.winRate >= 50
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400',
      bgColor:
        stats.winRate >= 50
          ? 'bg-green-100 dark:bg-green-900/20'
          : 'bg-red-100 dark:bg-red-900/20',
    },
    {
      title: t('stats.currentStreak', 'Current Streak'),
      value: stats.currentStreak,
      icon: Zap,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    },
    {
      title: t('stats.avgDuration', 'Avg. Duration'),
      value: `${stats.averageGameDuration}m`,
      icon: Clock,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    },
  ];

  return (
    <div className={cn('space-y-6', className)}>
      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className={cn('p-3 rounded-full', stat.bgColor)}>
                    <stat.icon className={cn('h-6 w-6', stat.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Performance Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t('stats.recentPerformance', 'Recent Performance')}
          </CardTitle>
          <CardDescription>
            {t('stats.last10Games', 'Your results from the last 10 games')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-32">
            {stats.recentPerformance.length === 0 ? (
              <p className="text-muted-foreground text-center w-full">
                {t('stats.noGamesYet', 'No completed games yet')}
              </p>
            ) : (
              stats.recentPerformance.map((result, index) => (
                <motion.div
                  key={index}
                  initial={{ height: 0 }}
                  animate={{ height: '100%' }}
                  transition={{ delay: index * 0.05 }}
                  className="flex-1 flex flex-col justify-end"
                >
                  <div
                    className={cn(
                      'rounded-t transition-all hover:opacity-80',
                      result === 1
                        ? 'bg-green-500 dark:bg-green-600'
                        : 'bg-red-500 dark:bg-red-600'
                    )}
                    style={{ height: result === 1 ? '100%' : '40%' }}
                  />
                </motion.div>
              ))
            )}
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{t('stats.older', 'Older')}</span>
            <span>{t('stats.newer', 'Newer')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Role Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            {t('stats.rolePerformance', 'Role Performance')}
          </CardTitle>
          <CardDescription>
            {t('stats.performanceByRole', 'Your win rate with different roles')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.roleStats.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t('stats.noRoleData', 'No role data available yet')}
            </p>
          ) : (
            <div className="space-y-4">
              {stats.roleStats.map((roleStat) => (
                <div key={roleStat.role} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getRoleIcon(roleStat.role)}
                      <span className="font-medium">{roleStat.role}</span>
                      {roleStat.role === stats.favoriteRole && (
                        <Badge variant="secondary" className="text-xs">
                          <Star className="h-3 w-3 mr-1" />
                          {t('stats.favorite', 'Favorite')}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {roleStat.wins}/{roleStat.gamesPlayed}{' '}
                      {t('stats.wins', 'wins')}
                    </div>
                  </div>
                  <Progress
                    value={roleStat.winRate}
                    className="h-2"
                    aria-label={`${roleStat.role} win rate: ${Math.round(roleStat.winRate)}%`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('stats.gameActivity', 'Game Activity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {t('stats.activeGames', 'Active Games')}
                </span>
                <Badge variant="default">{stats.activeGames}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {t('stats.completedGames', 'Completed Games')}
                </span>
                <Badge variant="secondary">{stats.completedGames}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {t('stats.longestStreak', 'Longest Win Streak')}
                </span>
                <Badge variant="outline">{stats.longestStreak}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              {t('stats.achievements', 'Achievements')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-4">
              {t('stats.comingSoon', 'Achievement system coming soon!')}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

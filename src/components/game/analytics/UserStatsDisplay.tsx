'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Trophy,
  Target,
  TrendingUp,
  Clock,
  Users,
  Shield,
  Eye,
  Heart,
  Sword,
  Award,
  Flame,
} from 'lucide-react';
import {
  getUserStatistics,
  getRecentGameStatistics,
} from '@/app/actions/statistics.actions';
import type { UserStatsSummary, GameStatistics } from '@/lib/db/schema';
import { useTranslation } from 'react-i18next';

export function UserStatsDisplay() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<UserStatsSummary | null>(null);
  const [recentGames, setRecentGames] = useState<GameStatistics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [statsResult, recentResult] = await Promise.all([
          getUserStatistics(),
          getRecentGameStatistics(5),
        ]);

        if (statsResult.success && statsResult.data) {
          setStats(statsResult.data);
        } else if (statsResult.error) {
          setError(statsResult.error);
        }

        if (recentResult.success && recentResult.data) {
          setRecentGames(recentResult.data);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load statistics'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            {t(
              'profile.noStatsYet',
              'No statistics yet. Play some games to see your stats!'
            )}
          </p>
        </CardContent>
      </Card>
    );
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'Villager':
        return <Users className="w-4 h-4" />;
      case 'Mafia':
        return <Sword className="w-4 h-4" />;
      case 'Seer':
        return <Eye className="w-4 h-4" />;
      case 'Doctor':
        return <Heart className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.totalGames', 'Total Games')}
            </CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalGames}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalWins} {t('stats.wins', 'wins')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.winRate', 'Win Rate')}
            </CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.winRate}%</div>
            <Progress value={stats.winRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.currentStreak', 'Current Streak')}
            </CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.currentWinStreak}</div>
            <p className="text-xs text-muted-foreground">
              {t('stats.longestStreak', 'Longest')}: {stats.longestWinStreak}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('stats.avgGameTime', 'Avg Game Time')}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(stats.averageGameDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('stats.totalTime', 'Total')}:{' '}
              {formatDuration(stats.totalPlayTime)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Role Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t('stats.rolePerformance', 'Role Performance')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Villager */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  <span className="font-medium">
                    {t('roles.villager', 'Villager')}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {stats.winsAsVillager}/{stats.gamesAsVillager}{' '}
                  {t('stats.wins', 'wins')}
                </div>
              </div>
              <Progress
                value={
                  stats.gamesAsVillager > 0
                    ? (stats.winsAsVillager / stats.gamesAsVillager) * 100
                    : 0
                }
                className="h-2"
              />
            </div>

            {/* Mafia */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sword className="w-4 h-4 text-red-500" />
                  <span className="font-medium">
                    {t('roles.mafia', 'Mafia')}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {stats.winsAsMafia}/{stats.gamesAsMafia}{' '}
                  {t('stats.wins', 'wins')}
                </div>
              </div>
              <Progress
                value={
                  stats.gamesAsMafia > 0
                    ? (stats.winsAsMafia / stats.gamesAsMafia) * 100
                    : 0
                }
                className="h-2"
              />
            </div>

            {/* Seer */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-500" />
                  <span className="font-medium">{t('roles.seer', 'Seer')}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {stats.winsAsSeer}/{stats.gamesAsSeer}{' '}
                  {t('stats.wins', 'wins')}
                </div>
              </div>
              <Progress
                value={
                  stats.gamesAsSeer > 0
                    ? (stats.winsAsSeer / stats.gamesAsSeer) * 100
                    : 0
                }
                className="h-2"
              />
            </div>

            {/* Doctor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-green-500" />
                  <span className="font-medium">
                    {t('roles.doctor', 'Doctor')}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {stats.winsAsDoctor}/{stats.gamesAsDoctor}{' '}
                  {t('stats.wins', 'wins')}
                </div>
              </div>
              <Progress
                value={
                  stats.gamesAsDoctor > 0
                    ? (stats.winsAsDoctor / stats.gamesAsDoctor) * 100
                    : 0
                }
                className="h-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Social Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            {t('stats.socialMetrics', 'Social Metrics')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {stats.averageTrustScore}%
              </div>
              <p className="text-sm text-muted-foreground">
                {t('stats.trustScore', 'Trust Score')}
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {stats.averageInfluenceScore}%
              </div>
              <p className="text-sm text-muted-foreground">
                {t('stats.influenceScore', 'Influence Score')}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-2">
                {getRoleIcon(stats.favoriteRole || 'Villager')}
                <span className="text-2xl font-bold">
                  {stats.favoriteRole || 'None'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('stats.favoriteRole', 'Favorite Role')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Games */}
      {recentGames.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('stats.recentPerformance', 'Recent Performance')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentGames.map((game) => (
                <div
                  key={game.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-secondary/20"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        game.won ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="text-sm">
                      {t('stats.round', 'Round')} {game.roundsPlayed}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={game.survived ? 'default' : 'secondary'}>
                      {game.survived
                        ? t('stats.survived', 'Survived')
                        : t('stats.eliminated', 'Eliminated')}
                    </Badge>
                    <Badge variant={game.won ? 'default' : 'secondary'}>
                      {game.won
                        ? t('stats.victory', 'Victory')
                        : t('stats.defeat', 'Defeat')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

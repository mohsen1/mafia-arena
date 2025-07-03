'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Users,
  Target,
  Clock,
  TrendingUp,
  Shield,
  Skull,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameListItem } from '@/app/actions/games';

interface GameStatisticsProps {
  games: GameListItem[];
}

export function GameStatistics({ games }: GameStatisticsProps) {
  const { t } = useTranslation();

  // Calculate basic statistics
  const totalGames = games.length;
  const completedGames = games.filter((g) => g.status === 'completed').length;
  const activeGames = games.filter(
    (g) => g.status === 'active' && g.round > 0
  ).length;
  const waitingGames = games.filter(
    (g) => g.status === 'active' && g.round === 0
  ).length;

  // Calculate wins
  const townWins = games.filter((g) => {
    if (g.status !== 'completed' || !g.winCondition) return false;
    const outcome = (g.winCondition as { outcome?: string })?.outcome;
    return (
      outcome === 'Town Victory' ||
      outcome === 'Town Wins' ||
      outcome === 'Town'
    );
  }).length;

  const mafiaWins = games.filter((g) => {
    if (g.status !== 'completed' || !g.winCondition) return false;
    const outcome = (g.winCondition as { outcome?: string })?.outcome;
    return (
      outcome === 'Mafia Victory' ||
      outcome === 'Mafia Wins' ||
      outcome === 'Mafia'
    );
  }).length;

  // Calculate win rates
  const townWinRate =
    completedGames > 0 ? Math.round((townWins / completedGames) * 100) : 0;
  const mafiaWinRate =
    completedGames > 0 ? Math.round((mafiaWins / completedGames) * 100) : 0;

  // Combine into stats object
  const stats = {
    totalGames,
    completedGames,
    activeGames,
    waitingGames,
    townWins,
    mafiaWins,
    winRate: {
      town: townWinRate,
      mafia: mafiaWinRate,
    },
    averageGameLength: 0,
    favoriteTheme: '',
    totalPlayers: 0,
  };

  // Calculate average game length (rounds)
  const completedGamesWithRounds = games.filter(
    (g) => g.status === 'completed' && g.round > 0
  );
  if (completedGamesWithRounds.length > 0) {
    const totalRounds = completedGamesWithRounds.reduce(
      (sum, g) => sum + g.round,
      0
    );
    stats.averageGameLength = Math.round(
      totalRounds / completedGamesWithRounds.length
    );
  }

  // Find favorite theme
  const themeCounts = games.reduce(
    (acc, game) => {
      acc[game.themeKey] = (acc[game.themeKey] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const favoriteThemeEntry = Object.entries(themeCounts).sort(
    ([, a], [, b]) => b - a
  )[0];
  if (favoriteThemeEntry) {
    stats.favoriteTheme = favoriteThemeEntry[0];
  }

  // Calculate total unique players
  stats.totalPlayers = games.reduce((sum, g) => sum + g.playerCount, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Game Progress Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('games.gameProgress', 'Game Progress')}
          </CardTitle>
          <Trophy className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalGames}</div>
          <p className="text-xs text-muted-foreground">
            {t('games.totalGamesPlayed', 'Total games played')}
          </p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span>{t('games.completed', 'Completed')}</span>
              <span className="font-medium">{stats.completedGames}</span>
            </div>
            <Progress
              value={(stats.completedGames / stats.totalGames) * 100 || 0}
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Win Rate Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('games.winRates', 'Win Rates')}
          </CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {t('TownPlayersTitle', 'Town')}
                </span>
                <span className="text-sm font-medium">
                  {stats.winRate.town}%
                </span>
              </div>
              <Progress value={stats.winRate.town} className="h-2" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm flex items-center gap-1">
                  <Skull className="h-3 w-3" />
                  {t('MafiaPlayersTitle', 'Mafia')}
                </span>
                <span className="text-sm font-medium">
                  {stats.winRate.mafia}%
                </span>
              </div>
              <Progress
                value={stats.winRate.mafia}
                className="h-2 bg-destructive/20"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game Stats Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('games.gameStats', 'Game Stats')}
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t('games.avgLength', 'Avg. Length')}
              </span>
              <span className="text-sm font-medium">
                {stats.averageGameLength} {t('games.rounds', 'rounds')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {t('games.totalPlayers', 'Total Players')}
              </span>
              <span className="text-sm font-medium">{stats.totalPlayers}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Favorite Theme Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            {t('games.favoriteTheme', 'Favorite Theme')}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {themeCounts[stats.favoriteTheme] || 0}{' '}
            {t('games.gamesWord', 'games')}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-lg font-semibold">
            {stats.favoriteTheme
              ? t(`themes.${stats.favoriteTheme}.name`, stats.favoriteTheme)
              : t('games.noFavorite', 'No favorite yet')}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('games.mostPlayedTheme', 'Your most played theme')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

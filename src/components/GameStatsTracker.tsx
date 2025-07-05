'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  MessageSquare,
  Vote,
  Skull,
  Shield,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface GameStatsTrackerProps {
  gameState: FilteredGameState;
  className?: string;
}

interface GameStat {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
  description?: string;
}

export function GameStatsTracker({
  gameState,
  className,
}: GameStatsTrackerProps) {
  const { t } = useTranslation();

  // Count messages per phase
  const messagesThisRound = gameState.log.filter(
    (msg) => msg.round === gameState.round && msg.type === 'chat'
  ).length;

  // Calculate various game statistics
  const stats = useMemo(() => {
    const totalPlayers = Object.keys(gameState.players).length;
    const alivePlayers = gameState.livingPlayerIds?.length || 0;
    const deadPlayers = gameState.deadPlayerIds?.length || 0;
    const survivalRate =
      totalPlayers > 0 ? (alivePlayers / totalPlayers) * 100 : 0;

    // Count votes in current round
    const votesThisRound = gameState.log.filter(
      (msg) =>
        msg.round === gameState.round && msg.content.includes('votes for')
    ).length;

    // Calculate game pace (messages per round)
    const avgMessagesPerRound =
      gameState.round > 0
        ? Math.round(
            gameState.log.filter((m) => m.type === 'chat').length /
              gameState.round
          )
        : 0;

    // Detect if mafia is winning (only show if game is over or player can see mafia)
    const canSeeMafiaInfo =
      gameState.phase === 'GameOver' ||
      (gameState.humanPlayerId &&
        gameState.players[gameState.humanPlayerId]?.isMafia);

    const mafiaCount = canSeeMafiaInfo
      ? Object.values(gameState.players).filter(
          (p) => p.isMafia && p.status === 'Alive'
        ).length
      : null;
    const townCount = mafiaCount !== null ? alivePlayers - mafiaCount : null;
    const mafiaWinning =
      mafiaCount !== null && townCount !== null
        ? mafiaCount >= townCount
        : null;

    const gameStats: GameStat[] = [
      {
        label: t('Stats.SurvivalRate', 'Survival Rate'),
        value: `${Math.round(survivalRate)}%`,
        icon: <Shield className="w-4 h-4" />,
        trend: survivalRate > 50 ? 'up' : 'down',
        color: survivalRate > 50 ? 'text-green-500' : 'text-red-500',
        description: t(
          'Stats.SurvivalDesc',
          '{{alive}} of {{total}} players alive',
          {
            alive: alivePlayers,
            total: totalPlayers,
          }
        ),
      },
      {
        label: t('Stats.GameActivity', 'Game Activity'),
        value: messagesThisRound,
        icon: <MessageSquare className="w-4 h-4" />,
        trend: messagesThisRound > avgMessagesPerRound ? 'up' : 'down',
        color: 'text-blue-500',
        description: t('Stats.MessagesThisRound', 'Messages this round'),
      },
      {
        label: t('Stats.VotingParticipation', 'Voting'),
        value: `${votesThisRound}/${alivePlayers}`,
        icon: <Vote className="w-4 h-4" />,
        trend: votesThisRound === alivePlayers ? 'up' : 'neutral',
        color: 'text-orange-500',
        description: t('Stats.VotesDesc', 'Votes cast this round'),
      },
      ...(canSeeMafiaInfo && mafiaCount !== null && townCount !== null
        ? [
            {
              label: t('Stats.GameBalance', 'Balance'),
              value: mafiaWinning
                ? t('MafiaLeading', 'Mafia')
                : t('TownLeading', 'Town'),
              icon: <Activity className="w-4 h-4" />,
              trend: (mafiaWinning ? 'down' : 'up') as 'up' | 'down',
              color: mafiaWinning ? 'text-red-500' : 'text-green-500',
              description: t(
                'Stats.BalanceDesc',
                '{{town}} town vs {{mafia}} mafia',
                {
                  town: townCount,
                  mafia: mafiaCount,
                }
              ),
            },
          ]
        : []),
    ];

    return gameStats;
  }, [gameState, t]);

  // Calculate game progress
  const gameProgress = useMemo(() => {
    const totalPlayers = Object.keys(gameState.players).length;
    const deadPlayers = gameState.deadPlayerIds?.length || 0;

    // Game is closer to ending as more players die
    const progressPercentage =
      (deadPlayers / Math.max(totalPlayers - 1, 1)) * 100;

    return Math.min(progressPercentage, 100);
  }, [gameState]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          {t('GameStats', 'Game Statistics')}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {t('Round', 'Round')} {gameState.round}
        </Badge>
      </div>
      <div className="space-y-4">
        {/* Game Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {t('GameProgress', 'Game Progress')}
            </span>
            <span className="font-medium">{Math.round(gameProgress)}%</span>
          </div>
          <Progress value={gameProgress} className="h-2" />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              <div className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-start justify-between mb-1">
                  <div className={cn('p-1 rounded', stat.color)}>
                    {stat.icon}
                  </div>
                  {stat.trend && (
                    <div
                      className={cn('text-xs', {
                        'text-green-500': stat.trend === 'up',
                        'text-red-500': stat.trend === 'down',
                        'text-muted-foreground': stat.trend === 'neutral',
                      })}
                    >
                      {stat.trend === 'up' && (
                        <TrendingUp className="w-3 h-3" />
                      )}
                      {stat.trend === 'down' && (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {stat.trend === 'neutral' && (
                        <Activity className="w-3 h-3" />
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-lg font-bold">{stat.value}</p>
                  {stat.description && (
                    <p className="text-xs text-muted-foreground">
                      {stat.description}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quick Insights */}
        {gameState.round > 2 && (
          <div className="pt-3 border-t">
            <p className="text-xs font-medium mb-2">
              {t('QuickInsights', 'Quick Insights')}
            </p>
            <div className="space-y-1">
              {gameProgress > 60 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Skull className="w-3 h-3" />
                  <span>
                    {t('GameNearingEnd', 'Game is nearing its conclusion')}
                  </span>
                </div>
              )}
              {messagesThisRound > 10 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MessageSquare className="w-3 h-3" />
                  <span>
                    {t('HighActivity', 'High discussion activity this round')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

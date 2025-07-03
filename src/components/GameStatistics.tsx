'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Heart,
  Skull,
  TrendingUp,
  Activity,
  Timer,
  Trophy,
  Target,
  Shield,
  Sword,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { useTranslation } from 'react-i18next';

interface GameStatisticsProps {
  gameState: FilteredGameState;
  className?: string;
}

interface RoleGroup {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  players: Array<{
    id: string;
    name: string;
    status: 'Alive' | 'Dead';
  }>;
}

export function GameStatistics({ gameState, className }: GameStatisticsProps) {
  const { t } = useTranslation();

  // Calculate statistics
  const stats = useMemo(() => {
    const totalPlayers = Object.keys(gameState.players).length;
    const alivePlayers = gameState.livingPlayerIds?.length || 0;
    const deadPlayers = totalPlayers - alivePlayers;
    const survivalRate =
      totalPlayers > 0 ? (alivePlayers / totalPlayers) * 100 : 0;

    // Group players by role
    const townPlayers: RoleGroup['players'] = [];
    const mafiaPlayers: RoleGroup['players'] = [];
    const unknownPlayers: RoleGroup['players'] = [];

    Object.values(gameState.players).forEach((player) => {
      const playerInfo = {
        id: player.id,
        name: player.name,
        status: player.status,
      };

      if (player.role) {
        if (player.role === 'Mafia') {
          mafiaPlayers.push(playerInfo);
        } else {
          townPlayers.push(playerInfo);
        }
      } else {
        unknownPlayers.push(playerInfo);
      }
    });

    return {
      totalPlayers,
      alivePlayers,
      deadPlayers,
      survivalRate,
      townPlayers,
      mafiaPlayers,
      unknownPlayers,
      round: gameState.round || 1,
      phase: gameState.phase,
    };
  }, [gameState]);

  const roleGroups: RoleGroup[] = [
    {
      name: t('RoleGroupTown', 'Town'),
      icon: Shield,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20',
      players: stats.townPlayers,
    },
    {
      name: t('RoleGroupMafia', 'Mafia'),
      icon: Sword,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-100 dark:bg-red-900/20',
      players: stats.mafiaPlayers,
    },
  ];

  if (stats.unknownPlayers.length > 0) {
    roleGroups.push({
      name: t('Unknown', 'Unknown'),
      icon: Target,
      color: 'text-gray-600 dark:text-gray-400',
      bgColor: 'bg-gray-100 dark:bg-gray-900/20',
      players: stats.unknownPlayers,
    });
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          {t('GameStatistics', 'Game Statistics')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Survival Rate */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {t('SurvivalRate', 'Survival Rate')}
            </span>
            <span className="font-bold">{Math.round(stats.survivalRate)}%</span>
          </div>
          <Progress
            value={stats.survivalRate}
            className="h-2"
            aria-label={t(
              'SurvivalRateProgress',
              'Survival rate: {{percent}}%',
              {
                percent: Math.round(stats.survivalRate),
              }
            )}
          />
        </motion.div>

        {/* Player Counts */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="p-3 rounded-lg bg-secondary/20"
          >
            <Users className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-lg font-bold">{stats.totalPlayers}</div>
            <div className="text-xs text-muted-foreground">
              {t('Total', 'Total')}
            </div>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="p-3 rounded-lg bg-green-100 dark:bg-green-900/20"
          >
            <Heart className="h-4 w-4 mx-auto mb-1 text-green-600 dark:text-green-400" />
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              {stats.alivePlayers}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Alive', 'Alive')}
            </div>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="p-3 rounded-lg bg-red-100 dark:bg-red-900/20"
          >
            <Skull className="h-4 w-4 mx-auto mb-1 text-red-600 dark:text-red-400" />
            <div className="text-lg font-bold text-red-600 dark:text-red-400">
              {stats.deadPlayers}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Dead', 'Dead')}
            </div>
          </motion.div>
        </div>

        {/* Game Progress */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('Round', 'Round')} {stats.round}
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {t(`gamePhases.${stats.phase}`, stats.phase)}
          </Badge>
        </div>

        {/* Role Distribution */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium flex items-center gap-1">
            <Trophy className="h-3 w-3" />
            {t('RoleDistribution', 'Role Distribution')}
          </h4>
          {roleGroups.map((group) => {
            const Icon = group.icon;
            const aliveCount = group.players.filter(
              (p) => p.status === 'Alive'
            ).length;
            const percentage =
              stats.totalPlayers > 0
                ? (group.players.length / stats.totalPlayers) * 100
                : 0;

            return (
              <motion.div
                key={group.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn('p-2 rounded-lg transition-all', group.bgColor)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Icon className={cn('h-4 w-4', group.color)} />
                    <span className="font-medium text-sm">{group.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {group.players.length}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {aliveCount} {t('alive', 'alive')}
                  </span>
                </div>
                <Progress
                  value={percentage}
                  className="h-1.5"
                  aria-label={t('RolePercentage', '{{role}}: {{percent}}%', {
                    role: group.name,
                    percent: Math.round(percentage),
                  })}
                />
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

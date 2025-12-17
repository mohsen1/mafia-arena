'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  MessageSquare,
  Vote,
  Clock,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  FilteredGameState,
  FilteredPlayer,
} from '@/lib/interfaces/gameState.types';

interface PlayerActivityIndicatorProps {
  player: FilteredPlayer;
  gameState: FilteredGameState;
  className?: string;
}

type ActivityLevel = 'high' | 'medium' | 'low' | 'inactive';

interface ActivityMetrics {
  messageCount: number;
  voteCount: number;
  lastActiveRound: number;
  activityLevel: ActivityLevel;
  isQuiet: boolean;
  isSuspicious: boolean;
}

export function PlayerActivityIndicator({
  player,
  gameState,
  className,
}: PlayerActivityIndicatorProps) {
  const { t } = useTranslation();

  const metrics = useMemo((): ActivityMetrics => {
    // Count messages from this player
    const messageCount = gameState.log.filter(
      (msg) => msg.senderId === player.id && msg.type === 'chat'
    ).length;

    // Count votes from this player
    const voteCount = gameState.log.filter(
      (msg) => msg.senderId === player.id && msg.content.includes('votes for')
    ).length;

    // Find last active round
    const playerMessages = gameState.log.filter(
      (msg) => msg.senderId === player.id
    );
    const lastActiveRound =
      playerMessages.length > 0
        ? Math.max(...playerMessages.map((m) => m.round))
        : 0;

    // Calculate activity level
    const avgMessagesPerPlayer =
      gameState.log.filter((m) => m.type === 'chat').length /
      Object.keys(gameState.players).length;

    let activityLevel: ActivityLevel;
    if (messageCount === 0) {
      activityLevel = 'inactive';
    } else if (messageCount < avgMessagesPerPlayer * 0.5) {
      activityLevel = 'low';
    } else if (messageCount < avgMessagesPerPlayer * 1.5) {
      activityLevel = 'medium';
    } else {
      activityLevel = 'high';
    }

    // Detect suspicious patterns
    const isQuiet = messageCount < 3 && gameState.round > 2;
    const isSuspicious =
      isQuiet &&
      player.status === 'Alive' &&
      lastActiveRound < gameState.round - 1;

    return {
      messageCount,
      voteCount,
      lastActiveRound,
      activityLevel,
      isQuiet,
      isSuspicious,
    };
  }, [player, gameState]);

  const getActivityColor = (level: ActivityLevel) => {
    switch (level) {
      case 'high':
        return 'text-green-500';
      case 'medium':
        return 'text-blue-500';
      case 'low':
        return 'text-yellow-500';
      case 'inactive':
        return 'text-red-500';
    }
  };

  const getActivityIcon = (level: ActivityLevel) => {
    switch (level) {
      case 'high':
        return <Zap className="w-3 h-3" />;
      case 'medium':
        return <MessageSquare className="w-3 h-3" />;
      case 'low':
        return <Clock className="w-3 h-3" />;
      case 'inactive':
        return <AlertCircle className="w-3 h-3" />;
    }
  };

  if (player.status === 'Dead') {
    return null;
  }

  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-1', className)}>
        {/* Activity Level Indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded-full',
                'bg-background border',
                getActivityColor(metrics.activityLevel)
              )}
            >
              {getActivityIcon(metrics.activityLevel)}
              <span className="text-xs font-medium">
                {metrics.messageCount}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-semibold">
                {t('ActivityLevel', 'Activity Level')}:{' '}
                {t(`Activity.${metrics.activityLevel}`, metrics.activityLevel)}
              </p>
              <p className="text-xs">
                {t('MessagesCount', '{{count}} messages', {
                  count: metrics.messageCount,
                })}
              </p>
              <p className="text-xs">
                {t('VotesCount', '{{count}} votes', {
                  count: metrics.voteCount,
                })}
              </p>
              {metrics.lastActiveRound > 0 && (
                <p className="text-xs">
                  {t('LastActive', 'Last active: Round {{round}}', {
                    round: metrics.lastActiveRound,
                  })}
                </p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Special Badges */}
        {metrics.isSuspicious && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="destructive" className="text-xs px-1 py-0">
                <AlertCircle className="w-3 h-3" />
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {t('SuspiciouslyQuiet', 'Suspiciously quiet player')}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {metrics.activityLevel === 'high' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="text-xs px-1 py-0">
                <TrendingUp className="w-3 h-3" />
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {t('VeryActive', 'Very active participant')}
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Vote participation */}
        {gameState.round > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-0.5">
                <Vote className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {metrics.voteCount}/{gameState.round}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {t(
                  'VoteParticipation',
                  'Voted in {{count}} of {{total}} rounds',
                  {
                    count: metrics.voteCount,
                    total: gameState.round,
                  }
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  ChevronRight,
  ChevronDown,
  PlayCircle,
  PauseCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface GameReplayAnalyzerProps {
  gameState: FilteredGameState;
  className?: string;
}

interface PlayerAnalytics {
  playerId: string;
  playerName: string;
  role?: string;
  messageCount: number;
  averageMessageLength: number;
  survivalRounds: number;
  influenceScore: number;
  activityScore: number;
  keyMoments: Array<{
    round: number;
    type: 'message' | 'action';
    description: string;
  }>;
}

interface GameAnalytics {
  totalRounds: number;
  totalMessages: number;
  averageMessagesPerRound: number;
  mostActivePlayer: string;
  leastActivePlayer: string;
  phaseDistribution: {
    day: number;
    night: number;
  };
  winningTeam: string | null;
  gameDuration: number; // in minutes
  criticalTurningPoints: Array<{
    round: number;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
}

interface TimelineEvent {
  round: number;
  phase: string;
  type: 'message' | 'action' | 'phase_change';
  playerId?: string;
  playerName?: string;
  description: string;
  timestamp?: Date;
  importance: 'high' | 'medium' | 'low';
}

export function GameReplayAnalyzer({
  gameState,
  className,
}: GameReplayAnalyzerProps) {
  const { t } = useTranslation();
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['overview'])
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentEventIndex, setCurrentEventIndex] = useState(0);

  // Calculate player analytics
  const playerAnalytics = useMemo(() => {
    const analytics: Record<string, PlayerAnalytics> = {};

    Object.entries(gameState.players).forEach(([playerId, player]) => {
      const messages = gameState.log.filter(
        (msg) => msg.senderId === playerId && (msg.type === 'chat' || !msg.type)
      );

      analytics[playerId] = {
        playerId,
        playerName: player.name,
        role: player.role,
        messageCount: messages.length,
        averageMessageLength:
          messages.length > 0
            ? messages.reduce(
                (sum, msg) => sum + (msg.content?.length || 0),
                0
              ) / messages.length
            : 0,
        survivalRounds:
          player.status === 'Alive' ? gameState.round : gameState.round, // Simple fallback since we don't have elimination tracking
        influenceScore: messages.length * 2,
        activityScore: messages.length,
        keyMoments: [],
      };
    });

    return analytics;
  }, [gameState]);

  // Calculate game analytics
  const gameAnalytics = useMemo((): GameAnalytics => {
    const messages = gameState.log.filter(
      (msg) => msg.type === 'chat' || !msg.type
    );

    return {
      totalRounds: gameState.round,
      totalMessages: messages.length,
      averageMessagesPerRound: messages.length / Math.max(gameState.round, 1),
      mostActivePlayer:
        Object.values(playerAnalytics).sort(
          (a, b) => b.activityScore - a.activityScore
        )[0]?.playerName || '',
      leastActivePlayer:
        Object.values(playerAnalytics).sort(
          (a, b) => a.activityScore - b.activityScore
        )[0]?.playerName || '',
      phaseDistribution: {
        day: gameState.log.filter((msg) => msg.phase === 'Day').length,
        night: gameState.log.filter((msg) => msg.phase === 'Night').length,
      },
      winningTeam: gameState.winner || null,
      gameDuration: 0, // Would need timestamp data
      criticalTurningPoints: [],
    };
  }, [gameState, playerAnalytics]);

  // Build timeline events
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    gameState.log.forEach((msg, index) => {
      let event: TimelineEvent | null = null;

      if (msg.type === 'chat' || !msg.type) {
        if (msg.content && msg.content.length > 100) {
          event = {
            round: msg.round || 0,
            phase: msg.phase,
            type: 'message',
            playerId: msg.senderId || undefined,
            playerName: msg.senderId
              ? gameState.players[msg.senderId]?.name
              : 'System',
            description: `${gameState.players[msg.senderId || '']?.name || 'System'} made a significant statement`,
            importance: 'medium' as const,
            timestamp: new Date(msg.timestamp),
          };
        }
      } else if (msg.type === 'system') {
        event = {
          round: msg.round || 0,
          phase: msg.phase,
          type: 'action',
          description: msg.content,
          importance: 'high' as const,
          timestamp: new Date(msg.timestamp),
        };
      }

      if (event) {
        events.push(event);
      }
    });

    return events.sort((a, b) => a.round - b.round);
  }, [gameState]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  const getPlayerInfluenceRank = (playerId: string) => {
    const sorted = Object.values(playerAnalytics).sort(
      (a, b) => b.influenceScore - a.influenceScore
    );
    return sorted.findIndex((p) => p.playerId === playerId) + 1;
  };

  const getActivityLevel = (score: number) => {
    const maxScore = Math.max(
      ...Object.values(playerAnalytics).map((p) => p.activityScore),
      1
    );
    const percentage = (score / maxScore) * 100;

    if (percentage >= 75)
      return { level: 'Very Active', color: 'text-green-500' };
    if (percentage >= 50) return { level: 'Active', color: 'text-blue-500' };
    if (percentage >= 25)
      return { level: 'Moderate', color: 'text-yellow-500' };
    return { level: 'Quiet', color: 'text-red-500' };
  };

  // Auto-play timeline
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentEventIndex((prev) => {
        if (prev >= timelineEvents.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [isPlaying, timelineEvents.length]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            {t('GameReplayAnalyzer', 'Game Replay Analyzer')}
          </span>
          <Badge variant="outline" className="text-xs">
            {gameAnalytics.totalRounds} {t('Rounds', 'Rounds')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid grid-cols-4 w-full h-auto">
            <TabsTrigger value="overview" className="text-xs">
              {t('Overview', 'Overview')}
            </TabsTrigger>
            <TabsTrigger value="players" className="text-xs">
              {t('Players', 'Players')}
            </TabsTrigger>
            <TabsTrigger value="timeline" className="text-xs">
              {t('Timeline', 'Timeline')}
            </TabsTrigger>
            <TabsTrigger value="insights" className="text-xs">
              {t('Insights', 'Insights')}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t('TotalMessages', 'Total Messages')}
                </p>
                <p className="text-lg font-bold">
                  {gameAnalytics.totalMessages}
                </p>
                <p className="text-xs text-muted-foreground">
                  {gameAnalytics.averageMessagesPerRound.toFixed(1)}{' '}
                  {t('PerRound', 'per round')}
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {t('Winner', 'Winner')}
                </p>
                <p className="text-lg font-bold">
                  {gameAnalytics.winningTeam || t('InProgress', 'In Progress')}
                </p>
                <Badge
                  variant={
                    gameAnalytics.winningTeam === 'Town'
                      ? 'default'
                      : 'destructive'
                  }
                  className="text-xs"
                >
                  {gameAnalytics.winningTeam === 'Town'
                    ? t('TownVictory', 'Town Victory')
                    : gameAnalytics.winningTeam === 'Mafia'
                      ? t('MafiaVictory', 'Mafia Victory')
                      : t('InProgress', 'In Progress')}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">
                {t('ActivityLeaders', 'Activity Leaders')}
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('MostActive', 'Most Active')}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {gameAnalytics.mostActivePlayer}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('LeastActive', 'Least Active')}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {gameAnalytics.leastActivePlayer}
                  </Badge>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Players Tab */}
          <TabsContent value="players" className="mt-4">
            <ScrollArea className="h-96">
              <div className="space-y-3">
                {Object.values(playerAnalytics)
                  .sort((a, b) => b.influenceScore - a.influenceScore)
                  .map((player) => {
                    const activity = getActivityLevel(player.activityScore);
                    const isExpanded = selectedPlayer === player.playerId;

                    return (
                      <div
                        key={player.playerId}
                        className={cn(
                          'border rounded-lg p-3 cursor-pointer transition-colors',
                          isExpanded && 'bg-accent'
                        )}
                        onClick={() =>
                          setSelectedPlayer(isExpanded ? null : player.playerId)
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              #{getPlayerInfluenceRank(player.playerId)}
                            </Badge>
                            <span className="font-medium text-sm">
                              {player.playerName}
                            </span>
                            {player.role && (
                              <Badge variant="secondary" className="text-xs">
                                {player.role}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs', activity.color)}>
                              {activity.level}
                            </span>
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </div>
                        </div>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mt-3 space-y-2"
                            >
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">
                                    {t('Messages', 'Messages')}:
                                  </span>
                                  <span className="ms-1 font-medium">
                                    {player.messageCount}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    {t('AvgLength', 'Avg Length')}:
                                  </span>
                                  <span className="ms-1 font-medium">
                                    {Math.round(player.averageMessageLength)}
                                  </span>
                                </div>
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    {t('InfluenceScore', 'Influence')}
                                  </span>
                                  <span className="font-medium">
                                    {player.influenceScore}
                                  </span>
                                </div>
                                <Progress
                                  value={(player.influenceScore / 100) * 100}
                                  className="h-1"
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  {t('GameTimeline', 'Game Timeline')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="text-xs"
                >
                  {isPlaying ? (
                    <PauseCircle className="w-4 h-4 me-1" />
                  ) : (
                    <PlayCircle className="w-4 h-4 me-1" />
                  )}
                  {isPlaying ? t('Pause', 'Pause') : t('Play', 'Play')}
                </Button>
              </div>

              <ScrollArea className="h-80">
                <div className="space-y-2">
                  {timelineEvents.map((event, index) => (
                    <div
                      key={index}
                      className={cn(
                        'border-s-2 ps-3 py-2 transition-colors',
                        index <= currentEventIndex && isPlaying
                          ? 'border-primary bg-accent'
                          : 'border-border'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          R{event.round}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {event.phase}
                        </Badge>
                        <Badge
                          variant={
                            event.importance === 'high'
                              ? 'destructive'
                              : event.importance === 'medium'
                                ? 'default'
                                : 'outline'
                          }
                          className="text-xs"
                        >
                          {event.type}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {event.description}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="mt-4">
            <div className="space-y-4">
              <div className="border rounded-lg p-3">
                <h4 className="text-sm font-medium mb-2">
                  {t('GamePhases', 'Game Phase Distribution')}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {t('DayPhase', 'Day Phase')}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {gameAnalytics.phaseDistribution.day}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {t('NightPhase', 'Night Phase')}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {gameAnalytics.phaseDistribution.night}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg p-3">
                <h4 className="text-sm font-medium mb-2">
                  {t('PlayerEngagement', 'Player Engagement')}
                </h4>
                <div className="space-y-2">
                  {Object.values(playerAnalytics)
                    .sort((a, b) => b.activityScore - a.activityScore)
                    .slice(0, 3)
                    .map((player, index) => (
                      <div
                        key={player.playerId}
                        className="flex items-center justify-between"
                      >
                        <span className="text-xs">
                          #{index + 1} {player.playerName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {player.activityScore} pts
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  TrendingUp,
  MessageSquare,
  Vote,
  Shield,
  Zap,
  Clock,
  Award,
  AlertTriangle,
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
import { TooltipProvider } from '@/components/ui/tooltip';
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
  votesReceived: number;
  votesCast: number;
  survivalRounds: number;
  influenceScore: number;
  suspicionScore: number;
  activityScore: number;
  keyMoments: Array<{
    round: number;
    type: 'vote' | 'message' | 'action' | 'elimination';
    description: string;
  }>;
}

interface GameAnalytics {
  totalRounds: number;
  totalMessages: number;
  averageMessagesPerRound: number;
  mostActivePlayer: string;
  leastActivePlayer: string;
  firstElimination: { round: number; player: string } | null;
  lastElimination: { round: number; player: string } | null;
  votingPatterns: {
    unanimous: number;
    split: number;
    noConsensus: number;
  };
  phaseDistribution: {
    day: number;
    night: number;
  };
  winningTeam: 'Town' | 'Mafia' | null;
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
  type: 'message' | 'vote' | 'elimination' | 'action' | 'phase_change';
  playerId?: string;
  playerName?: string;
  description: string;
  timestamp?: number;
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
        (msg) => msg.type === 'chat' && msg.senderId === playerId
      );

      const votesReceived = gameState.log.filter(
        (msg) => msg.type === 'vote' && msg.targetId === playerId
      ).length;

      const votesCast = gameState.log.filter(
        (msg) => msg.type === 'vote' && msg.senderId === playerId
      ).length;

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
        votesReceived,
        votesCast,
        survivalRounds:
          player.status === 'Alive'
            ? gameState.round
            : player.eliminatedRound || 0,
        influenceScore: messages.length * 2 + votesCast * 3,
        suspicionScore: votesReceived * 10,
        activityScore: messages.length + votesCast,
        keyMoments: [],
      };
    });

    return analytics;
  }, [gameState]);

  // Calculate game analytics
  const gameAnalytics = useMemo((): GameAnalytics => {
    const messages = gameState.log.filter((msg) => msg.type === 'chat');
    const votes = gameState.log.filter((msg) => msg.type === 'vote');
    const eliminations = gameState.log.filter(
      (msg) => msg.type === 'elimination'
    );

    const votingRounds = new Map<number, number>();
    votes.forEach((vote) => {
      const round = vote.round || 0;
      votingRounds.set(round, (votingRounds.get(round) || 0) + 1);
    });

    const firstElim = eliminations[0];
    const lastElim = eliminations[eliminations.length - 1];

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
      firstElimination: firstElim
        ? {
            round: firstElim.round || 0,
            player:
              gameState.players[firstElim.targetId || '']?.name || 'Unknown',
          }
        : null,
      lastElimination: lastElim
        ? {
            round: lastElim.round || 0,
            player:
              gameState.players[lastElim.targetId || '']?.name || 'Unknown',
          }
        : null,
      votingPatterns: {
        unanimous: Array.from(votingRounds.values()).filter(
          (v) => v >= Object.keys(gameState.players).length - 1
        ).length,
        split: Array.from(votingRounds.values()).filter(
          (v) => v > 2 && v < Object.keys(gameState.players).length - 1
        ).length,
        noConsensus: Array.from(votingRounds.values()).filter((v) => v <= 2)
          .length,
      },
      phaseDistribution: {
        day: gameState.log.filter((msg) => msg.phase === 'Day').length,
        night: gameState.log.filter((msg) => msg.phase === 'Night').length,
      },
      winningTeam: gameState.winner,
      gameDuration: 0, // Would need timestamp data
      criticalTurningPoints: [],
    };
  }, [gameState, playerAnalytics]);

  // Build timeline events
  const timelineEvents = useMemo((): TimelineEvent[] => {
    const events: TimelineEvent[] = [];

    gameState.log.forEach((msg, index) => {
      let event: TimelineEvent | null = null;

      switch (msg.type) {
        case 'chat':
          if (msg.content && msg.content.length > 100) {
            event = {
              round: msg.round || 0,
              phase: msg.phase || 'Unknown',
              type: 'message',
              playerId: msg.senderId,
              playerName: msg.senderId
                ? gameState.players[msg.senderId]?.name
                : 'System',
              description: `${gameState.players[msg.senderId || '']?.name || 'System'} made a significant statement`,
              importance: 'medium',
            };
          }
          break;

        case 'vote':
          event = {
            round: msg.round || 0,
            phase: msg.phase || 'Unknown',
            type: 'vote',
            playerId: msg.senderId,
            playerName: msg.senderId
              ? gameState.players[msg.senderId]?.name
              : 'Unknown',
            description: `${gameState.players[msg.senderId || '']?.name || 'Unknown'} voted for ${gameState.players[msg.targetId || '']?.name || 'Unknown'}`,
            importance: 'medium',
          };
          break;

        case 'elimination':
          event = {
            round: msg.round || 0,
            phase: msg.phase || 'Unknown',
            type: 'elimination',
            playerId: msg.targetId,
            playerName: msg.targetId
              ? gameState.players[msg.targetId]?.name
              : 'Unknown',
            description: `${gameState.players[msg.targetId || '']?.name || 'Unknown'} was eliminated`,
            importance: 'high',
          };
          break;

        case 'phase':
          event = {
            round: msg.round || 0,
            phase: msg.phase || 'Unknown',
            type: 'phase_change',
            description: `Phase changed to ${msg.phase}`,
            importance: 'low',
          };
          break;
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
      ...Object.values(playerAnalytics).map((p) => p.activityScore)
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
                    : t('MafiaVictory', 'Mafia Victory')}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium">
                {t('VotingPatterns', 'Voting Patterns')}
              </p>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('UnanimousVotes', 'Unanimous')}
                  </span>
                  <span className="text-xs font-medium">
                    {gameAnalytics.votingPatterns.unanimous}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('SplitVotes', 'Split')}
                  </span>
                  <span className="text-xs font-medium">
                    {gameAnalytics.votingPatterns.split}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t('NoConsensus', 'No Consensus')}
                  </span>
                  <span className="text-xs font-medium">
                    {gameAnalytics.votingPatterns.noConsensus}
                  </span>
                </div>
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
                                <div>
                                  <span className="text-muted-foreground">
                                    {t('VotesCast', 'Votes Cast')}:
                                  </span>
                                  <span className="ms-1 font-medium">
                                    {player.votesCast}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    {t('VotesReceived', 'Votes Received')}:
                                  </span>
                                  <span className="ms-1 font-medium">
                                    {player.votesReceived}
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

                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">
                                    {t('SuspicionLevel', 'Suspicion')}
                                  </span>
                                  <span className="font-medium">
                                    {player.suspicionScore}
                                  </span>
                                </div>
                                <Progress
                                  value={(player.suspicionScore / 50) * 100}
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
                  {timelineEvents.map((event, index) => {
                    const isActive = index <= currentEventIndex;
                    const icon = {
                      message: <MessageSquare className="w-3 h-3" />,
                      vote: <Vote className="w-3 h-3" />,
                      elimination: <Zap className="w-3 h-3" />,
                      action: <Shield className="w-3 h-3" />,
                      phase_change: <Clock className="w-3 h-3" />,
                    }[event.type];

                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{
                          opacity: isActive ? 1 : 0.3,
                          x: 0,
                        }}
                        className={cn(
                          'flex items-start gap-3 p-2 rounded',
                          event.importance === 'high' && 'bg-destructive/10',
                          event.importance === 'medium' && 'bg-accent/50',
                          isActive && 'border-s-2 border-primary'
                        )}
                      >
                        <div
                          className={cn(
                            'mt-0.5',
                            event.importance === 'high' && 'text-destructive',
                            event.importance === 'medium' && 'text-primary'
                          )}
                        >
                          {icon}
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="text-xs font-medium">
                            {t('Round', 'Round')} {event.round} - {event.phase}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Insights Tab */}
          <TabsContent value="insights" className="space-y-4 mt-4">
            <TooltipProvider>
              <div className="space-y-3">
                {/* Key Insights */}
                <div className="space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    {t('KeyInsights', 'Key Insights')}
                  </p>
                  <div className="space-y-2">
                    {gameAnalytics.firstElimination && (
                      <div className="p-2 bg-muted rounded-lg">
                        <p className="text-xs">
                          <span className="font-medium">
                            {t('FirstBlood', 'First Blood')}:
                          </span>{' '}
                          {gameAnalytics.firstElimination.player} was eliminated
                          in round {gameAnalytics.firstElimination.round}
                        </p>
                      </div>
                    )}

                    {gameAnalytics.votingPatterns.unanimous >
                      gameAnalytics.votingPatterns.split && (
                      <div className="p-2 bg-muted rounded-lg">
                        <p className="text-xs">
                          <span className="font-medium">
                            {t('ConsensusGame', 'Consensus Game')}:
                          </span>{' '}
                          Most votes were unanimous, indicating strong town
                          coordination
                        </p>
                      </div>
                    )}

                    {Object.values(playerAnalytics).some(
                      (p) => p.messageCount === 0
                    ) && (
                      <div className="p-2 bg-muted rounded-lg">
                        <p className="text-xs">
                          <span className="font-medium">
                            {t('SilentPlayers', 'Silent Players')}:
                          </span>{' '}
                          Some players never spoke, which could indicate lurking
                          Mafia
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Performance Metrics */}
                <div className="space-y-2">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    {t('PerformanceMetrics', 'Performance Metrics')}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 border rounded">
                      <p className="text-xs text-muted-foreground">
                        {t('GamePace', 'Game Pace')}
                      </p>
                      <p className="text-sm font-bold">
                        {gameAnalytics.averageMessagesPerRound > 10
                          ? t('Fast', 'Fast')
                          : gameAnalytics.averageMessagesPerRound > 5
                            ? t('Normal', 'Normal')
                            : t('Slow', 'Slow')}
                      </p>
                    </div>
                    <div className="p-2 border rounded">
                      <p className="text-xs text-muted-foreground">
                        {t('Engagement', 'Engagement')}
                      </p>
                      <p className="text-sm font-bold">
                        {
                          Object.values(playerAnalytics).filter(
                            (p) => p.activityScore > 10
                          ).length
                        }{' '}
                        / {Object.keys(playerAnalytics).length}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {gameAnalytics.votingPatterns.noConsensus > 2 && (
                  <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                    <div>
                      <p className="text-xs font-medium">
                        {t('LowConsensus', 'Low Consensus Warning')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'LowConsensusDesc',
                          'Multiple rounds with no voting consensus may indicate confusion or manipulation'
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </TooltipProvider>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

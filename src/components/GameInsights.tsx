'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Brain,
  TrendingUp,
  Users,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Target,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface GameInsightsProps {
  gameState: FilteredGameState;
  className?: string;
}

interface GameInsight {
  type: 'strategy' | 'warning' | 'opportunity' | 'analysis';
  icon: React.ReactNode;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionable?: string;
}

interface GameMetrics {
  eliminationRate: number;
  discussionIntensity: number;
  votingCoherence: number;
  gamePace: 'slow' | 'normal' | 'fast';
  predictedWinner: 'town' | 'mafia' | 'uncertain';
  winProbability: number;
}

export function GameInsights({ gameState, className }: GameInsightsProps) {
  const { t } = useTranslation();

  // Check if we can see mafia info
  const canSeeMafiaInfo =
    gameState.phase === 'GameOver' ||
    (gameState.humanPlayerId &&
      gameState.players[gameState.humanPlayerId]?.isMafia);

  // Calculate game metrics
  const metrics = useMemo((): GameMetrics => {
    const players = Object.values(gameState.players);
    const mafiaPlayers = players.filter((p) => p.role === 'Mafia');
    const alivePlayers = players.filter((p) => p.status === 'Alive').length;
    const mafiaAlive = mafiaPlayers.filter((p) => p.status === 'Alive').length;
    const villagersAlive = alivePlayers - mafiaAlive;

    // Elimination rate (players eliminated per round)
    const eliminationRate =
      gameState.round > 0 ? mafiaAlive / gameState.round : 0;

    // Discussion intensity (messages per round)
    const totalMessages = gameState.log.filter((m) => m.type === 'chat').length;
    const discussionIntensity =
      gameState.round > 0 ? totalMessages / gameState.round : 0;

    // Voting coherence (how unified voting is)
    const currentVotes = gameState.log.filter(
      (m) => m.round === gameState.round && m.content.includes('votes for')
    );
    const voteTargets = new Set(
      currentVotes.map((v) => v.content.match(/votes for (.+)$/)?.[1])
    );
    const votingCoherence =
      currentVotes.length > 0
        ? 1 - (voteTargets.size - 1) / Math.max(currentVotes.length - 1, 1)
        : 0;

    // Game pace
    let gamePace: 'slow' | 'normal' | 'fast' = 'normal';
    if (eliminationRate > 1.5) gamePace = 'fast';
    else if (eliminationRate < 0.5) gamePace = 'slow';

    // Predict winner based on current state (only if allowed to see mafia info)
    let predictedWinner: 'town' | 'mafia' | 'uncertain' = 'uncertain';
    let winProbability = 50;

    if (canSeeMafiaInfo) {
      const mafiaCount = mafiaAlive;
      const townCount = villagersAlive;

      if (mafiaCount === 0) {
        predictedWinner = 'town';
        winProbability = 100;
      } else if (mafiaCount >= townCount) {
        predictedWinner = 'mafia';
        winProbability = 95;
      } else {
        const mafiaRatio = mafiaCount / alivePlayers;
        if (mafiaRatio < 0.2) {
          predictedWinner = 'town';
          winProbability = 80 - mafiaRatio * 100;
        } else if (mafiaRatio > 0.4) {
          predictedWinner = 'mafia';
          winProbability = 50 + mafiaRatio * 100;
        }
      }
    }

    return {
      eliminationRate,
      discussionIntensity,
      votingCoherence,
      gamePace,
      predictedWinner,
      winProbability: Math.min(100, Math.max(0, winProbability)),
    };
  }, [gameState, canSeeMafiaInfo]);

  // Generate insights based on game state
  const insights = useMemo((): GameInsight[] => {
    const insights: GameInsight[] = [];
    const humanPlayer = gameState.humanPlayerId
      ? gameState.players[gameState.humanPlayerId]
      : null;

    // Game pace insight
    if (metrics.gamePace === 'fast') {
      insights.push({
        type: 'warning',
        icon: <TrendingUp className="w-4 h-4" />,
        title: t('FastPaceWarning', 'Game is moving quickly'),
        description: t(
          'FastPaceDesc',
          'Multiple eliminations per round - be careful with accusations'
        ),
        priority: 'high',
      });
    } else if (metrics.gamePace === 'slow') {
      insights.push({
        type: 'analysis',
        icon: <BarChart3 className="w-4 h-4" />,
        title: t('SlowPaceAnalysis', 'Cautious gameplay detected'),
        description: t(
          'SlowPaceDesc',
          'Players are being careful - look for subtle clues'
        ),
        priority: 'medium',
      });
    }

    // Voting coherence insight
    if (metrics.votingCoherence > 0.7 && gameState.phase === 'Day') {
      insights.push({
        type: 'opportunity',
        icon: <Users className="w-4 h-4" />,
        title: t('StrongConsensus', 'Strong voting consensus'),
        description: t(
          'ConsensusDesc',
          'Most players agree on the target - consider if this is justified'
        ),
        priority: 'high',
        actionable:
          humanPlayer?.status === 'Alive'
            ? t(
                'ConsiderJoining',
                'Consider joining the majority or defending the target'
              )
            : undefined,
      });
    }

    // Discussion intensity insight
    if (metrics.discussionIntensity < 5 && gameState.round > 2) {
      insights.push({
        type: 'strategy',
        icon: <Lightbulb className="w-4 h-4" />,
        title: t('LowDiscussion', 'Low discussion activity'),
        description: t(
          'LowDiscussionDesc',
          'Quiet players might be hiding something'
        ),
        priority: 'medium',
        actionable:
          humanPlayer?.status === 'Alive'
            ? t('EncourageDiscussion', 'Ask questions to encourage discussion')
            : undefined,
      });
    }

    // Win prediction insight
    if (metrics.winProbability > 70) {
      insights.push({
        type: 'analysis',
        icon: <Target className="w-4 h-4" />,
        title: t('WinPrediction', '{{team}} likely to win', {
          team: metrics.predictedWinner === 'town' ? t('Town') : t('Mafia'),
        }),
        description: t(
          'WinProbabilityDesc',
          '{{probability}}% chance based on current numbers',
          {
            probability: Math.round(metrics.winProbability),
          }
        ),
        priority: metrics.winProbability > 85 ? 'high' : 'medium',
      });
    }

    // Role-specific insights
    if (humanPlayer?.status === 'Alive') {
      if (humanPlayer.role === 'Seer' && gameState.phase === 'Night') {
        insights.push({
          type: 'strategy',
          icon: <Brain className="w-4 h-4" />,
          title: t('SeerStrategy', 'Investigation opportunity'),
          description: t(
            'SeerStrategyDesc',
            'Focus on quiet or defensive players'
          ),
          priority: 'high',
          actionable: t('InvestigateQuiet', 'Investigate the quietest player'),
        });
      } else if (humanPlayer.role === 'Doctor' && gameState.phase === 'Night') {
        insights.push({
          type: 'strategy',
          icon: <Shield className="w-4 h-4" />,
          title: t('DoctorStrategy', 'Protection decision'),
          description: t(
            'DoctorStrategyDesc',
            'Protect active town members or yourself'
          ),
          priority: 'high',
          actionable: t(
            'ProtectActive',
            'Consider protecting the most vocal player'
          ),
        });
      }
    }

    // Endgame insights
    const alivePlayers = gameState.livingPlayerIds?.length || 0;
    if (alivePlayers <= 5 && alivePlayers > 0) {
      insights.push({
        type: 'warning',
        icon: <AlertTriangle className="w-4 h-4" />,
        title: t('EndgameApproaching', 'Endgame approaching'),
        description: t('EndgameDesc', 'Every decision is critical now'),
        priority: 'high',
      });
    }

    return insights.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [gameState, metrics, t]);

  if (insights.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="text-sm font-medium flex items-center gap-2">
        <Brain className="w-4 h-4 text-muted-foreground" />
        {t('GameInsights', 'Game Insights')}
      </h3>
      <div className="space-y-3">
        {/* Win Probability Meter */}
        {canSeeMafiaInfo && metrics.predictedWinner !== 'uncertain' && (
          <div className="p-3 rounded-lg bg-accent/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium">
                {t('WinProbability', 'Win Probability')}
              </p>
              <Badge
                variant={
                  metrics.predictedWinner === 'town' ? 'default' : 'destructive'
                }
                className="text-xs"
              >
                {metrics.predictedWinner === 'town' ? t('Town') : t('Mafia')}
              </Badge>
            </div>
            <Progress
              value={metrics.winProbability}
              className={cn(
                'h-2',
                metrics.predictedWinner === 'town'
                  ? 'bg-blue-200'
                  : 'bg-red-200'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(metrics.winProbability)}% {t('chance', 'chance')}
            </p>
          </div>
        )}

        {/* Insights List */}
        <div className="space-y-2">
          {insights.map((insight, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Alert
                className={cn(
                  'border-l-4',
                  insight.type === 'warning' && 'border-l-orange-500',
                  insight.type === 'strategy' && 'border-l-blue-500',
                  insight.type === 'opportunity' && 'border-l-green-500',
                  insight.type === 'analysis' && 'border-l-purple-500'
                )}
              >
                <div className="flex items-start gap-2">
                  <div
                    className={cn(
                      'mt-0.5',
                      insight.type === 'warning' && 'text-orange-500',
                      insight.type === 'strategy' && 'text-blue-500',
                      insight.type === 'opportunity' && 'text-green-500',
                      insight.type === 'analysis' && 'text-purple-500'
                    )}
                  >
                    {insight.icon}
                  </div>
                  <AlertDescription className="space-y-1">
                    <p className="font-medium text-sm">{insight.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {insight.description}
                    </p>
                    {insight.actionable && (
                      <p className="text-xs font-medium text-primary mt-1">
                        → {insight.actionable}
                      </p>
                    )}
                  </AlertDescription>
                </div>
              </Alert>
            </motion.div>
          ))}
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {t('GamePace', 'Pace')}
            </p>
            <p className="text-sm font-medium capitalize">
              {t(metrics.gamePace)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {t('Discussion', 'Discussion')}
            </p>
            <p className="text-sm font-medium">
              {metrics.discussionIntensity > 10
                ? t('High')
                : metrics.discussionIntensity > 5
                  ? t('Medium')
                  : t('Low')}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {t('Unity', 'Unity')}
            </p>
            <p className="text-sm font-medium">
              {Math.round(metrics.votingCoherence * 100)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  Vote,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';

interface VotingVisualizationProps {
  gameState: FilteredGameState;
  className?: string;
}

interface VoteData {
  voterId: string;
  voterName: string;
  targetId: string;
  targetName: string;
  round: number;
}

interface VotingPattern {
  playerId: string;
  playerName: string;
  votesReceived: number;
  votesReceivedFrom: string[];
  votesCast: number;
  votingTargets: string[];
  suspicionLevel: 'high' | 'medium' | 'low';
}

export function VotingVisualization({
  gameState,
  className,
}: VotingVisualizationProps) {
  const { t } = useTranslation();

  // Extract voting data from game log
  const votingData = useMemo((): VoteData[] => {
    const votes: VoteData[] = [];

    gameState.log.forEach((msg) => {
      // Parse vote messages like "Player A votes for Player B"
      const voteMatch = msg.content.match(/^(.+?) votes for (.+?)$/);
      if (voteMatch && msg.senderId) {
        const voterName = voteMatch[1];
        const targetName = voteMatch[2];

        // Find player IDs by name
        const voterEntry = Object.entries(gameState.players).find(
          ([, p]) => p.name === voterName
        );
        const targetEntry = Object.entries(gameState.players).find(
          ([, p]) => p.name === targetName
        );

        if (voterEntry && targetEntry) {
          const voterId = voterEntry[0];
          const targetId = targetEntry[0];

          votes.push({
            voterId,
            voterName,
            targetId,
            targetName,
            round: msg.round,
          });
        }
      }
    });

    return votes;
  }, [gameState]);

  // Analyze voting patterns
  const votingPatterns = useMemo((): VotingPattern[] => {
    const patterns: Map<string, VotingPattern> = new Map();

    // Initialize patterns for all players
    Object.entries(gameState.players).forEach(([id, player]) => {
      patterns.set(id, {
        playerId: id,
        playerName: player.name,
        votesReceived: 0,
        votesReceivedFrom: [],
        votesCast: 0,
        votingTargets: [],
        suspicionLevel: 'low',
      });
    });

    // Process votes
    votingData.forEach((vote) => {
      const voterPattern = patterns.get(vote.voterId);
      const targetPattern = patterns.get(vote.targetId);

      if (voterPattern) {
        voterPattern.votesCast++;
        if (!voterPattern.votingTargets.includes(vote.targetName)) {
          voterPattern.votingTargets.push(vote.targetName);
        }
      }

      if (targetPattern) {
        targetPattern.votesReceived++;
        if (!targetPattern.votesReceivedFrom.includes(vote.voterName)) {
          targetPattern.votesReceivedFrom.push(vote.voterName);
        }
      }
    });

    // Calculate suspicion levels
    const maxVotes = Math.max(
      ...Array.from(patterns.values()).map((p) => p.votesReceived)
    );
    patterns.forEach((pattern) => {
      if (pattern.votesReceived >= maxVotes * 0.7 && maxVotes > 0) {
        pattern.suspicionLevel = 'high';
      } else if (pattern.votesReceived >= maxVotes * 0.4 && maxVotes > 0) {
        pattern.suspicionLevel = 'medium';
      }
    });

    return Array.from(patterns.values())
      .filter((p) => gameState.players[p.playerId]?.status === 'Alive')
      .sort((a, b) => b.votesReceived - a.votesReceived);
  }, [votingData, gameState]);

  // Get current round votes
  const currentRoundVotes = useMemo(() => {
    return votingData.filter((v) => v.round === gameState.round);
  }, [votingData, gameState.round]);

  // Calculate voting consensus
  const votingConsensus = useMemo(() => {
    if (currentRoundVotes.length === 0) return null;

    const voteTargets = new Map<string, number>();
    currentRoundVotes.forEach((vote) => {
      voteTargets.set(
        vote.targetName,
        (voteTargets.get(vote.targetName) || 0) + 1
      );
    });

    const totalVotes = currentRoundVotes.length;
    const maxVotes = Math.max(...voteTargets.values());
    const leadingTarget = Array.from(voteTargets.entries()).find(
      ([, votes]) => votes === maxVotes
    );

    return leadingTarget
      ? {
          target: leadingTarget[0],
          votes: leadingTarget[1],
          percentage: (leadingTarget[1] / totalVotes) * 100,
          hasConsensus: leadingTarget[1] > totalVotes / 2,
        }
      : null;
  }, [currentRoundVotes]);

  if (gameState.phase !== 'Day' || votingPatterns.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Vote className="w-4 h-4 text-muted-foreground" />
          {t('VotingAnalysis', 'Voting Analysis')}
        </h3>
        <Badge variant="secondary" className="text-xs">
          {t('Round', 'Round')} {gameState.round}
        </Badge>
      </div>
      <div className="space-y-4">
        {/* Current Round Consensus */}
        {votingConsensus && (
          <div className="p-3 rounded-lg bg-accent/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">
                {t('CurrentLeader', 'Current Leader')}
              </p>
              {votingConsensus.hasConsensus && (
                <Badge variant="default" className="text-xs">
                  {t('Consensus', 'Consensus')}
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {votingConsensus.target}
                </span>
                <span className="text-sm text-muted-foreground">
                  {votingConsensus.votes} {t('votes', 'votes')}
                </span>
              </div>
              <Progress value={votingConsensus.percentage} className="h-2" />
            </div>
          </div>
        )}

        {/* Voting Patterns */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            {t('SuspicionLevels', 'Suspicion Levels')}
          </h4>
          <TooltipProvider>
            <div className="space-y-1">
              {votingPatterns.slice(0, 5).map((pattern, index) => (
                <motion.div
                  key={pattern.playerId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex items-center justify-between p-2 rounded-lg',
                          'hover:bg-accent/50 transition-colors cursor-pointer',
                          pattern.suspicionLevel === 'high' && 'bg-red-500/10',
                          pattern.suspicionLevel === 'medium' &&
                            'bg-orange-500/10'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              pattern.suspicionLevel === 'high' && 'bg-red-500',
                              pattern.suspicionLevel === 'medium' &&
                                'bg-orange-500',
                              pattern.suspicionLevel === 'low' && 'bg-green-500'
                            )}
                          />
                          <span className="text-sm font-medium">
                            {pattern.playerName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {pattern.votesReceived > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Target className="w-3 h-3 me-1" />
                              {pattern.votesReceived}
                            </Badge>
                          )}
                          {pattern.suspicionLevel === 'high' && (
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <div className="space-y-2">
                        <p className="font-semibold">{pattern.playerName}</p>
                        {pattern.votesReceivedFrom.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t('VotedBy', 'Voted by')}:
                            </p>
                            <p className="text-xs">
                              {pattern.votesReceivedFrom.join(', ')}
                            </p>
                          </div>
                        )}
                        {pattern.votingTargets.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t('VotedFor', 'Voted for')}:
                            </p>
                            <p className="text-xs">
                              {pattern.votingTargets.join(', ')}
                            </p>
                          </div>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </motion.div>
              ))}
            </div>
          </TooltipProvider>
        </div>

        {/* Voting Flow Visualization */}
        {currentRoundVotes.length > 0 && (
          <div className="pt-3 border-t">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">
              {t('CurrentVotes', 'Current Votes')}
            </h4>
            <div className="space-y-1">
              {currentRoundVotes.slice(0, 5).map((vote, index) => (
                <motion.div
                  key={`${vote.voterId}-${vote.targetId}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="truncate flex-1">{vote.voterName}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate flex-1 text-right font-medium">
                    {vote.targetName}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Insights */}
        {votingPatterns.some((p) => p.suspicionLevel === 'high') && (
          <div className="pt-3 border-t">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <TrendingUp className="w-3 h-3 mt-0.5" />
              <p>
                {t(
                  'HighSuspicionAlert',
                  'Players with high suspicion levels may be eliminated soon'
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

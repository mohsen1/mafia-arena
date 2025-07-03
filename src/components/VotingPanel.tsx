'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Vote,
  AlertCircle,
  CheckCircle2,
  Users,
  Target,
  Ban,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { useTranslation } from 'react-i18next';
import { useGameContext } from '@/context/GameContext';

interface VotingPanelProps {
  gameState: FilteredGameState;
  onVote?: (targetId: string | null) => void;
  className?: string;
}

interface VoteData {
  voterId: string;
  voterName: string;
  targetId: string | null;
  targetName: string | null;
}

export function VotingPanel({
  gameState,
  onVote,
  className,
}: VotingPanelProps) {
  const { t } = useTranslation();
  const { submitHumanAction } = useGameContext();
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const humanPlayerId = gameState.humanPlayerId;
  const isVotingPhase = gameState.phase === 'Day';
  const canVote = isVotingPhase && humanPlayerId && !hasVoted;

  // Extract current round votes from conversation log
  const currentVotes = useMemo(() => {
    const votes: VoteData[] = [];
    const currentRound = gameState.round;

    // Parse votes from the conversation log
    gameState.log.forEach((message) => {
      if (message.round === currentRound && message.phase === 'Day') {
        const voteMatch = message.content.match(/votes for (.+)\./);
        if (voteMatch && message.senderId) {
          const targetName = voteMatch[1];
          const voter = gameState.players[message.senderId];
          const target = Object.values(gameState.players).find(
            (p) => p.name === targetName
          );

          if (voter) {
            votes.push({
              voterId: message.senderId,
              voterName: voter.name,
              targetId: target?.id || null,
              targetName: targetName,
            });
          }
        }
      }
    });

    return votes;
  }, [gameState.log, gameState.round, gameState.players]);

  // Calculate vote tallies
  const voteTallies = useMemo(() => {
    const tallies = new Map<string, { count: number; voters: string[] }>();

    currentVotes.forEach((vote) => {
      if (vote.targetId) {
        const current = tallies.get(vote.targetId) || { count: 0, voters: [] };
        current.count++;
        current.voters.push(vote.voterName);
        tallies.set(vote.targetId, current);
      }
    });

    return tallies;
  }, [currentVotes]);

  // Get alive players for voting
  const alivePlayersArray = useMemo(() => {
    return Object.values(gameState.players).filter(
      (player) => player.status === 'Alive' && player.id !== humanPlayerId
    );
  }, [gameState.players, humanPlayerId]);

  // Calculate required votes for majority
  const totalAlivePlayers = gameState.livingPlayerIds?.length || 0;
  const requiredVotes = Math.ceil(totalAlivePlayers / 2);

  // Check if human has already voted
  useEffect(() => {
    const humanVote = currentVotes.find((v) => v.voterId === humanPlayerId);
    if (humanVote) {
      setHasVoted(true);
      setSelectedTarget(humanVote.targetId);
    }
  }, [currentVotes, humanPlayerId]);

  const handleVoteSubmit = async () => {
    if (!canVote || !submitHumanAction) return;

    setShowConfirmation(false);
    setHasVoted(true);

    try {
      await submitHumanAction({
        playerId: humanPlayerId!,
        type: 'vote',
        targetPlayerId: selectedTarget,
      });

      if (onVote) {
        onVote(selectedTarget);
      }
    } catch (error) {
      console.error('Failed to submit vote:', error);
      setHasVoted(false);
    }
  };

  const getPlayerVoteStatus = (playerId: string) => {
    const vote = currentVotes.find((v) => v.voterId === playerId);
    if (!vote) return null;

    if (vote.targetId === null) {
      return { type: 'abstain', target: null };
    }

    const target = gameState.players[vote.targetId];
    return {
      type: 'voted',
      target: target?.name || vote.targetName,
    };
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVotingPhase || !humanPlayerId || !alivePlayersArray.length) return;

      // Number keys 1-9 for quick voting
      const key = parseInt(e.key);
      if (key >= 1 && key <= 9) {
        const playerIndex = key - 1;
        const sortedPlayers = alivePlayersArray.filter(
          (p) => p.id !== humanPlayerId
        );
        if (playerIndex < sortedPlayers.length) {
          setSelectedTarget(sortedPlayers[playerIndex].id);
        }
      }

      // 0 key for abstain
      if (e.key === '0') {
        setSelectedTarget(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVotingPhase, humanPlayerId, alivePlayersArray]);

  if (!isVotingPhase) return null;

  return (
    <Card
      className={cn('w-full', className)}
      role="region"
      aria-label={t('VotingPanel', 'Voting Panel')}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Vote className="w-5 h-5" />
            {t('VotingPanel', 'Voting Panel')}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            {t('VotingProgress', '{{current}} of {{total}} votes cast', {
              current: voteTallies.size,
              total: totalAlivePlayers,
            })}
          </Badge>
        </div>
        <Progress
          value={(voteTallies.size / totalAlivePlayers) * 100}
          className="h-2 mt-2"
          aria-label={t('VotingProgressBar', 'Voting progress: {{percent}}%', {
            percent: Math.round((voteTallies.size / totalAlivePlayers) * 100),
          })}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t('MajorityRequired', 'Majority: {{count}} votes needed', {
            count: requiredVotes,
          })}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Cast Your Vote Section */}
        {canVote && (
          <div
            className="space-y-3"
            role="group"
            aria-labelledby="vote-section-title"
          >
            <h4
              id="vote-section-title"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Target className="w-4 h-4" />
              {t('CastYourVote', 'Cast Your Vote')}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {alivePlayersArray
                .filter((p) => p.id !== humanPlayerId)
                .map((player, index) => (
                  <Button
                    key={player.id}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedTarget(player.id);
                      setShowConfirmation(true);
                    }}
                    className="justify-start text-left"
                    aria-label={t(
                      'VoteForPlayer',
                      'Vote for {{name}} (press {{key}})',
                      {
                        name: player.name,
                        key: index + 1,
                      }
                    )}
                    title={`Press ${index + 1} to vote`}
                  >
                    <span className="text-xs text-muted-foreground mr-2">
                      {index + 1}.
                    </span>
                    {player.name}
                  </Button>
                ))}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedTarget(null);
                  setShowConfirmation(true);
                }}
                className="col-span-2"
                aria-label={t(
                  'AbstainFromVoting',
                  'Abstain from voting (press 0)'
                )}
                title="Press 0 to abstain"
              >
                <Ban className="w-4 h-4 mr-2" />
                {t('AbstainFromVoting', 'Abstain from voting')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {t(
                'VotingKeyboardHint',
                'Press number keys 1-9 to vote, 0 to abstain'
              )}
            </p>
          </div>
        )}

        {/* Vote Tallies */}
        {voteTallies.size > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">
              {t('CurrentVotes', 'Current Votes')}
            </h4>
            {Array.from(voteTallies.entries())
              .sort((a, b) => b[1].count - a[1].count)
              .map(([playerId, data]) => {
                const player = gameState.players[playerId];
                if (!player) return null;

                const percentage = (data.count / totalAlivePlayers) * 100;
                const isMajority = data.count >= requiredVotes;

                return (
                  <motion.div
                    key={playerId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      'p-3 rounded-lg border transition-all',
                      isMajority && 'border-destructive bg-destructive/10'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{player.name}</span>
                        {isMajority && (
                          <Badge variant="destructive" className="text-xs">
                            {t('Majority', 'Majority')}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-medium">
                        {data.count} {t('votes', 'votes')}
                      </span>
                    </div>
                    <Progress
                      value={percentage}
                      className={cn(
                        'h-1.5',
                        isMajority && '[&>div]:bg-destructive'
                      )}
                    />
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('VotedBy', 'Voted by')}: {data.voters.join(', ')}
                    </div>
                  </motion.div>
                );
              })}
          </div>
        )}

        {/* Confirmation Dialog */}
        <AnimatePresence>
          {showConfirmation && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="p-4 rounded-lg bg-secondary/50 space-y-3"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">
                    {t('ConfirmVote', 'Confirm your vote')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedTarget
                      ? t(
                          'VoteForPlayer',
                          'You are voting to eliminate {{player}}',
                          {
                            player: gameState.players[selectedTarget]?.name,
                          }
                        )
                      : t(
                          'VoteAbstain',
                          'You are choosing to abstain from voting'
                        )}
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfirmation(false)}
                >
                  {t('Cancel', 'Cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleVoteSubmit}
                >
                  <CheckCircle2 className="h-4 w-4 me-1" />
                  {t('ConfirmVote', 'Confirm Vote')}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voting Status Section */}
        <div
          className="space-y-2"
          role="region"
          aria-label={t('VotingStatus', 'Voting Status')}
        >
          <h4 className="text-sm font-medium">
            {t('VotingStatus', 'Voting Status')}
          </h4>
          <div className="space-y-1">
            {alivePlayersArray.map((player) => {
              const voteStatus = getPlayerVoteStatus(player.id);
              const hasPlayerVoted = voteStatus !== null;
              const isCurrentPlayer = player.id === humanPlayerId;

              return (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-md text-sm',
                    hasPlayerVoted && 'bg-secondary/50',
                    isCurrentPlayer && 'ring-1 ring-primary'
                  )}
                  role="listitem"
                  aria-label={`${player.name}: ${hasPlayerVoted ? t('Voted', 'Voted') : t('NotVoted', 'Not voted')}`}
                >
                  <span className="font-medium">
                    {player.name}
                    {isCurrentPlayer && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({t('You', 'You')})
                      </span>
                    )}
                  </span>
                  {hasPlayerVoted ? (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {t('Voted', 'Voted')}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t('NotVoted', 'Not voted')}
                    </span>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

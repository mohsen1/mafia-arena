'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Vote,
  Users,
  UserCheck,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Timer,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { FilteredPlayer } from '@/lib/interfaces/client.types';
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

export function VotingPanel({ gameState, onVote, className }: VotingPanelProps) {
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
            p => p.name === targetName
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
    const humanVote = currentVotes.find(v => v.voterId === humanPlayerId);
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
    const vote = currentVotes.find(v => v.voterId === playerId);
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

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Vote className="h-5 w-5" />
            {t('VotingPanel', 'Voting Panel')}
          </CardTitle>
          {isVotingPhase && (
            <Badge variant="default" className="animate-pulse">
              <Timer className="h-3 w-3 me-1" />
              {t('VotingInProgress', 'Voting in Progress')}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Voting Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t('VotesCount', '{{count}} of {{total}} votes cast', {
                count: currentVotes.length,
                total: totalAlivePlayers,
              })}
            </span>
            <span className="text-muted-foreground">
              {t('MajorityRequired', 'Majority: {{count}}', {
                count: requiredVotes,
              })}
            </span>
          </div>
          <Progress 
            value={(currentVotes.length / totalAlivePlayers) * 100} 
            className="h-2"
          />
        </div>

        {/* Vote Tallies */}
        {voteTallies.size > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t('CurrentVotes', 'Current Votes')}</h4>
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

        {/* Player Voting Options */}
        {canVote && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              {t('CastYourVote', 'Cast Your Vote')}
            </h4>
            
            <div className="grid gap-2">
              {alivePlayersArray.map((player) => {
                const voteCount = voteTallies.get(player.id)?.count || 0;
                const isSelected = selectedTarget === player.id;
                
                return (
                  <motion.button
                    key={player.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedTarget(player.id);
                      setShowConfirmation(true);
                    }}
                    className={cn(
                      'w-full p-3 rounded-lg border transition-all text-left',
                      'hover:bg-secondary/50',
                      isSelected && 'border-primary bg-primary/10',
                      voteCount > 0 && 'border-orange-500/50'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'h-2 w-2 rounded-full',
                          isSelected ? 'bg-primary' : 'bg-muted'
                        )} />
                        <span className="font-medium">{player.name}</span>
                        {player.role && (
                          <Badge variant="outline" className="text-xs">
                            {player.role}
                          </Badge>
                        )}
                      </div>
                      {voteCount > 0 && (
                        <Badge variant="secondary">
                          {voteCount} {t('votes', 'votes')}
                        </Badge>
                      )}
                    </div>
                  </motion.button>
                );
              })}
              
              {/* Abstain option */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedTarget(null);
                  setShowConfirmation(true);
                }}
                className={cn(
                  'w-full p-3 rounded-lg border transition-all text-left',
                  'hover:bg-secondary/50 border-dashed',
                  selectedTarget === null && 'border-primary bg-primary/10'
                )}
              >
                <div className="flex items-center gap-3">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {t('Abstain', 'Abstain from voting')}
                  </span>
                </div>
              </motion.button>
            </div>
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
                      ? t('VoteForPlayer', 'You are voting to eliminate {{player}}', {
                          player: gameState.players[selectedTarget]?.name,
                        })
                      : t('VoteAbstain', 'You are choosing to abstain from voting')}
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

        {/* Voting Status for All Players */}
        {isVotingPhase && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">{t('VotingStatus', 'Voting Status')}</h4>
            <div className="space-y-1">
              {Object.values(gameState.players)
                .filter(p => p.status === 'Alive')
                .map((player) => {
                  const voteStatus = getPlayerVoteStatus(player.id);
                  
                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <span className={cn(
                        player.id === humanPlayerId && 'font-medium'
                      )}>
                        {player.name}
                        {player.id === humanPlayerId && ' (You)'}
                      </span>
                      {voteStatus ? (
                        <Badge variant={voteStatus.type === 'abstain' ? 'secondary' : 'default'}>
                          {voteStatus.type === 'abstain'
                            ? t('Abstained', 'Abstained')
                            : `→ ${voteStatus.target}`}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          {t('NotVoted', 'Not voted')}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 
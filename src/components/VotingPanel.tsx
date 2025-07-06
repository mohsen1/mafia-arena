'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Vote,
  AlertCircle,
  CheckCircle2,
  Users,
  Target,
  Ban,
  CheckCircle,
  User,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { useTranslation } from 'react-i18next';
import { useGameContext } from '@/context/GameContext';
import { addAudioBreadcrumb } from '@/components/AudioDebugOverlay';

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
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);

  const humanPlayerId = gameState.humanPlayerId;
  const isVotingPhase = gameState.phase === 'Day';
  const canVote = isVotingPhase && humanPlayerId && !hasVoted;

  // Check if we're in the voting step by looking at recent messages
  const isInVotingStep = useMemo(() => {
    if (!isVotingPhase) return false;

    // Look for voting announcement in recent messages
    const recentMessages = gameState.log.slice(0, 10);
    return recentMessages.some(
      (msg) =>
        msg.content.includes('time to vote') ||
        msg.content.includes('Voting time') ||
        msg.content.includes('VotingPhase') ||
        msg.content.includes('vote to eliminate')
    );
  }, [gameState.log, isVotingPhase]);

  // Only show panel if we're in voting phase AND actively voting
  const shouldShowPanel = isVotingPhase && isInVotingStep;

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

  const handleVoteSubmit = useCallback(async () => {
    if (!canVote || !submitHumanAction) return;

    setShowConfirmation(false);
    setHasVoted(true);

    console.log('[VotingPanel] 🗳️ VOTE SUBMITTED:', {
      voter: humanPlayerId,
      target: selectedTarget,
      targetName: selectedTarget ? gameState.players[selectedTarget]?.name : 'Abstain',
      timestamp: new Date().toISOString(),
    });
    
    addAudioBreadcrumb('Vote submitted', { 
      target: selectedTarget,
      targetName: selectedTarget ? gameState.players[selectedTarget]?.name : 'Abstain' 
    });

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
  }, [canVote, submitHumanAction, humanPlayerId, selectedTarget, onVote, gameState.players]);

  const getPlayerVoteStatus = useCallback(
    (playerId: string) => {
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
    },
    [currentVotes, gameState.players]
  );

  const handlePlayerClick = useCallback((playerId: string) => {
    setSelectedTarget(playerId);
    setShowConfirmation(true);
  }, []);

  const handleAbstainClick = useCallback(() => {
    setSelectedTarget(null);
    setShowConfirmation(true);
  }, []);

  const handleCancelClick = useCallback(() => {
    setShowConfirmation(false);
  }, []);

  const handlePlayerHover = useCallback((playerId: string | null) => {
    setHoveredPlayer(playerId);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isVotingPhase || !humanPlayerId || !alivePlayersArray.length) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Prevent if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key;

      // Number keys 1-9 for voting
      if (key >= '1' && key <= '9') {
        const index = parseInt(key) - 1;
        if (index < alivePlayersArray.length) {
          e.preventDefault();
          setSelectedTarget(alivePlayersArray[index].id);
          setShowConfirmation(true);
        }
      }

      // 0 for abstain
      if (key === '0') {
        e.preventDefault();
        setSelectedTarget(null);
        setShowConfirmation(true);
      }

      // Enter to confirm
      if (key === 'Enter' && showConfirmation) {
        e.preventDefault();
        handleVoteSubmit();
      }

      // Escape to cancel
      if (key === 'Escape' && showConfirmation) {
        e.preventDefault();
        setShowConfirmation(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [
    isVotingPhase,
    humanPlayerId,
    alivePlayersArray,
    showConfirmation,
    handleVoteSubmit,
  ]);

  if (!shouldShowPanel) return null;

  return (
    <Card
      className={cn(
        'w-full backdrop-blur-sm bg-background/95 border-border/50',
        className
      )}
      role="region"
      aria-label={t('VotingPanel', 'Voting Panel')}
    >
      <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Vote className="w-5 h-5 text-primary" />
            {t('VotingPanel', 'Voting Panel')}
          </CardTitle>
          <Badge variant="outline" className="text-xs border-primary/20">
            <Users className="w-3 h-3 mr-1" />
            {t('VotingProgress', '{{current}} of {{total}} votes cast', {
              current: currentVotes.length,
              total: totalAlivePlayers,
            })}
          </Badge>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>{t('Progress', 'Progress')}</span>
            <span>
              {Math.round((currentVotes.length / totalAlivePlayers) * 100)}%
            </span>
          </div>
          <Progress
            value={(currentVotes.length / totalAlivePlayers) * 100}
            className="h-2"
            aria-label={t(
              'VotingProgressBar',
              'Voting progress: {{percent}}%',
              {
                percent: Math.round(
                  (currentVotes.length / totalAlivePlayers) * 100
                ),
              }
            )}
          />
          <p className="text-xs text-muted-foreground mt-1">
            {t('MajorityRequired', 'Majority: {{count}} votes needed', {
              count: requiredVotes,
            })}
          </p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        {/* Cast Your Vote Section */}
        {canVote && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50"
            role="group"
            aria-labelledby="vote-section-title"
          >
            <h4
              id="vote-section-title"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Target className="w-4 h-4 text-primary" />
              {t('CastYourVote', 'Cast Your Vote')}
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {alivePlayersArray
                .filter((p) => p.id !== humanPlayerId)
                .map((player, index) => (
                  <motion.div
                    key={player.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      variant={
                        selectedTarget === player.id ? 'default' : 'outline'
                      }
                      size="sm"
                      onClick={() => handlePlayerClick(player.id)}
                      onMouseEnter={() => handlePlayerHover(player.id)}
                      onMouseLeave={() => handlePlayerHover(null)}
                      className={cn(
                        'justify-start text-left w-full transition-all relative group',
                        hoveredPlayer === player.id && 'shadow-md'
                      )}
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
                      <kbd className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono bg-muted/50 rounded px-1.5 py-0.5 border border-border/50 group-hover:bg-muted group-hover:border-border">
                        {index + 1}
                      </kbd>
                      <span className="ml-8 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {player.name}
                      </span>
                    </Button>
                  </motion.div>
                ))}
              <motion.div
                className="col-span-2"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Button
                  variant={
                    selectedTarget === null && showConfirmation
                      ? 'secondary'
                      : 'ghost'
                  }
                  size="sm"
                  onClick={handleAbstainClick}
                  className="w-full relative group"
                  aria-label={t(
                    'AbstainFromVoting',
                    'Abstain from voting (press 0)'
                  )}
                  title="Press 0 to abstain"
                >
                  <kbd className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono bg-muted/50 rounded px-1.5 py-0.5 border border-border/50 group-hover:bg-muted group-hover:border-border">
                    0
                  </kbd>
                  <span className="ml-8 flex items-center gap-2">
                    <Ban className="w-4 h-4" />
                    {t('AbstainFromVoting', 'Abstain from voting')}
                  </span>
                </Button>
              </motion.div>
            </div>
            <div className="mt-3 p-3 rounded-md bg-muted/30 border border-border/50">
              <p className="text-xs text-muted-foreground text-center">
                <kbd className="text-xs font-mono bg-muted rounded px-1.5 py-0.5 border border-border/50">
                  1
                </kbd>
                {' - '}
                <kbd className="text-xs font-mono bg-muted rounded px-1.5 py-0.5 border border-border/50">
                  9
                </kbd>{' '}
                {t('VotingKeyboardHint', 'to vote')}
                {' • '}
                <kbd className="text-xs font-mono bg-muted rounded px-1.5 py-0.5 border border-border/50">
                  0
                </kbd>{' '}
                {t('ToAbstain', 'to abstain')}
                {' • '}
                <kbd className="text-xs font-mono bg-muted rounded px-1.5 py-0.5 border border-border/50">
                  Enter
                </kbd>{' '}
                {t('ToConfirm', 'to confirm')}
                {' • '}
                <kbd className="text-xs font-mono bg-muted rounded px-1.5 py-0.5 border border-border/50">
                  Esc
                </kbd>{' '}
                {t('ToCancel', 'to cancel')}
              </p>
            </div>
          </motion.div>
        )}

        {/* Vote Tallies */}
        {voteTallies.size > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
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
                      isMajority
                        ? 'border-destructive bg-destructive/10 shadow-lg shadow-destructive/20'
                        : 'border-border/50 bg-secondary/20'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{player.name}</span>
                        {isMajority && (
                          <Badge
                            variant="destructive"
                            className="text-xs animate-pulse"
                          >
                            {t('Majority', 'Majority')}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm font-bold">
                        {data.count} {t('votes', 'votes')}
                      </span>
                    </div>
                    <Progress
                      value={percentage}
                      className={cn(
                        'h-2 mb-2',
                        isMajority && '[&>div]:bg-destructive'
                      )}
                    />
                    <div className="text-xs text-muted-foreground">
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
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="p-4 rounded-lg bg-warning/10 border border-warning/20 space-y-3"
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
                          'VoteForPlayerConfirm',
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
                <Button variant="outline" size="sm" onClick={handleCancelClick}>
                  {t('Cancel', 'Cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleVoteSubmit}
                  className="shadow-sm"
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
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
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
                    'flex items-center justify-between p-2 rounded-md text-sm transition-colors',
                    hasPlayerVoted && 'bg-secondary/30',
                    isCurrentPlayer && 'ring-1 ring-primary/50 bg-primary/5'
                  )}
                  role="listitem"
                  aria-label={`${player.name}: ${hasPlayerVoted ? t('Voted', 'Voted') : t('NotVoted', 'Not voted')}`}
                >
                  <span className="font-medium flex items-center gap-2">
                    <User className="w-3 h-3 text-muted-foreground" />
                    {player.name}
                    {isCurrentPlayer && (
                      <span className="text-xs text-primary">
                        ({t('You', 'You')})
                      </span>
                    )}
                  </span>
                  {hasPlayerVoted ? (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {voteStatus.type === 'abstain'
                        ? t('Abstained', 'Abstained')
                        : t('Voted', 'Voted')}
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

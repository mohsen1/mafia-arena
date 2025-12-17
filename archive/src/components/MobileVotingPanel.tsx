'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import {
  Vote,
  User,
  Bot,
  CheckCircle,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import { useTranslation } from 'react-i18next';
import { useGameContext } from '@/context/GameContext';

interface MobileVotingPanelProps {
  gameState: FilteredGameState;
  onVote: (targetId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

export function MobileVotingPanel({
  gameState,
  onVote,
  disabled = false,
  className,
}: MobileVotingPanelProps) {
  const { t } = useTranslation();
  const {} = useGameContext();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const humanPlayerId = gameState.humanPlayerId;
  const playersArray = Object.values(gameState.players);

  const alivePlayersExceptSelf = playersArray.filter(
    (player) => player.status === 'Alive' && player.id !== humanPlayerId
  );

  const currentPlayer = alivePlayersExceptSelf[currentIndex];

  const handleSwipe = (_event: Event, info: PanInfo) => {
    const swipeThreshold = 50;

    if (info.offset.x > swipeThreshold) {
      // Swipe right - previous player
      setCurrentIndex((prev) =>
        prev === 0 ? alivePlayersExceptSelf.length - 1 : prev - 1
      );
    } else if (info.offset.x < -swipeThreshold) {
      // Swipe left - next player
      setCurrentIndex((prev) => (prev + 1) % alivePlayersExceptSelf.length);
    }
  };

  const handleVote = () => {
    if (currentPlayer) {
      setSelectedTarget(currentPlayer.id);
      onVote(currentPlayer.id);
    }
  };

  const handleAbstain = () => {
    setSelectedTarget('abstain');
    onVote(null);
  };

  if (!currentPlayer) {
    return null;
  }

  return (
    <Card className={cn('overflow-hidden md:hidden', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Vote className="h-4 w-4" />
          {t('VotingPhase')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Player Carousel */}
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPlayer.id}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={handleSwipe}
              className="touch-pan-y"
            >
              <Card className="bg-secondary/10">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      {currentPlayer.id === humanPlayerId ? (
                        <User className="w-6 h-6" />
                      ) : (
                        <Bot className="w-6 h-6" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{currentPlayer.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {currentPlayer.id === humanPlayerId
                          ? t('Human')
                          : t('AI')}{' '}
                        Player
                      </p>
                    </div>
                    {selectedTarget === currentPlayer.id && (
                      <CheckCircle className="w-5 h-5 text-primary" />
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>

          {/* Navigation Buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={() =>
              setCurrentIndex((prev) =>
                prev === 0 ? alivePlayersExceptSelf.length - 1 : prev - 1
              )
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8"
            onClick={() =>
              setCurrentIndex(
                (prev) => (prev + 1) % alivePlayersExceptSelf.length
              )
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Player Counter */}
        <div className="flex justify-center gap-1">
          {alivePlayersExceptSelf.map((_, index) => (
            <div
              key={index}
              className={cn(
                'w-2 h-2 rounded-full transition-colors',
                index === currentIndex ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={
              selectedTarget === currentPlayer.id ? 'default' : 'outline'
            }
            onClick={handleVote}
            disabled={disabled}
            className="h-12"
          >
            <Vote className="w-4 h-4 mr-2" />
            {t('VotePlayer')}
          </Button>
          <Button
            variant={selectedTarget === 'abstain' ? 'secondary' : 'outline'}
            onClick={handleAbstain}
            disabled={disabled}
            className="h-12"
          >
            <X className="w-4 h-4 mr-2" />
            {t('Abstain')}
          </Button>
        </div>

        {/* Swipe Hint */}
        <p className="text-xs text-center text-muted-foreground">
          {t('SwipeToNavigatePlayers')}
        </p>
      </CardContent>
    </Card>
  );
}

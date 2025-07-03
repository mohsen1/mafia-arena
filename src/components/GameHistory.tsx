'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  History,
  Vote,
  Skull,
  Shield,
  Search,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Moon,
  Sun,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { AgentMemory } from '@/lib/engine/interfaces/AgentMemory';
import { useTranslation } from 'react-i18next';

interface GameHistoryProps {
  gameState: FilteredGameState & { memory: AgentMemory };
  className?: string;
}

type HistoryEvent = {
  id: string;
  round: number;
  phase: string;
  type: 'vote' | 'elimination' | 'save' | 'investigation' | 'message';
  content: string;
  timestamp: number;
  playerName?: string;
  targetName?: string;
  result?: string;
};

export function GameHistory({ gameState, className }: GameHistoryProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [filter, setFilter] = useState<HistoryEvent['type'] | 'all'>('all');

  // Generate history events from game state memory
  const historyEvents = useMemo(() => {
    const events: HistoryEvent[] = [];
    const memory = gameState.memory;

    // Add vote history
    memory.voteHistory?.forEach((vote, index) => {
      const voteResults = new Map<string, number>();
      vote.votes.forEach((targetId) => {
        if (targetId) {
          voteResults.set(targetId, (voteResults.get(targetId) || 0) + 1);
        }
      });

      // Find the eliminated player
      let eliminatedPlayer = '';
      let maxVotes = 0;
      voteResults.forEach((count, playerId) => {
        if (count > maxVotes) {
          maxVotes = count;
          eliminatedPlayer = playerId;
        }
      });

      if (eliminatedPlayer && maxVotes > 0) {
        events.push({
          id: `vote-${index}`,
          round: vote.round,
          phase: 'Day',
          type: 'elimination',
          content: t('PlayerEliminatedByVote', {
            playerName: eliminatedPlayer,
            voteCount: maxVotes,
          }),
          timestamp: Date.now() - (memory.voteHistory.length - index) * 300000,
          targetName: eliminatedPlayer,
        });
      }
    });

    // Add kill history
    memory.killHistory?.forEach((kill, index) => {
      if (kill.killedPlayerId) {
        events.push({
          id: `kill-${index}`,
          round: kill.round,
          phase: 'Night',
          type: 'elimination',
          content: t('PlayerKilledAtNight', {
            playerName: kill.killedPlayerId,
          }),
          timestamp: Date.now() - (memory.killHistory.length - index) * 400000,
          targetName: kill.killedPlayerId,
        });
      }
    });

    // Add save history
    memory.saveHistory?.forEach((save, index) => {
      if (save.savedPlayerId) {
        events.push({
          id: `save-${index}`,
          round: save.round,
          phase: 'Night',
          type: 'save',
          content: t('PlayerSavedByDoctor', { playerName: save.savedPlayerId }),
          timestamp: Date.now() - (memory.saveHistory.length - index) * 350000,
          targetName: save.savedPlayerId,
        });
      }
    });

    // Add investigation results
    memory.investigationResults?.forEach((investigation, index) => {
      events.push({
        id: `investigation-${index}`,
        round: investigation.round,
        phase: 'Night',
        type: 'investigation',
        content: t('SeerInvestigated', {
          playerName: investigation.targetId,
          result: investigation.allegiance,
        }),
        timestamp:
          Date.now() - (memory.investigationResults.length - index) * 380000,
        targetName: investigation.targetId,
        result: investigation.allegiance,
      });
    });

    // Sort events by timestamp (most recent first)
    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [gameState.memory, t]);

  // Filter events based on selected filter
  const filteredEvents = useMemo(() => {
    if (filter === 'all') return historyEvents;
    return historyEvents.filter((event) => event.type === filter);
  }, [historyEvents, filter]);

  const getEventIcon = (type: HistoryEvent['type']) => {
    switch (type) {
      case 'vote':
        return Vote;
      case 'elimination':
        return Skull;
      case 'save':
        return Shield;
      case 'investigation':
        return Search;
      case 'message':
        return MessageSquare;
    }
  };

  const getEventColor = (type: HistoryEvent['type']) => {
    switch (type) {
      case 'vote':
        return 'text-blue-600 dark:text-blue-400';
      case 'elimination':
        return 'text-red-600 dark:text-red-400';
      case 'save':
        return 'text-green-600 dark:text-green-400';
      case 'investigation':
        return 'text-purple-600 dark:text-purple-400';
      case 'message':
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getPhaseIcon = (phase: string) => {
    return phase === 'Day' ? Sun : Moon;
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">{t('GameHistory')}</h3>
            <Badge variant="secondary" className="ml-2">
              {filteredEvents.length} {t('Events')}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {isExpanded && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              {t('All')}
            </Button>
            <Button
              variant={filter === 'elimination' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('elimination')}
            >
              <Skull className="h-3 w-3 me-1" />
              {t('Eliminations')}
            </Button>
            <Button
              variant={filter === 'save' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('save')}
            >
              <Shield className="h-3 w-3 me-1" />
              {t('Saves')}
            </Button>
            <Button
              variant={filter === 'investigation' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('investigation')}
            >
              <Search className="h-3 w-3 me-1" />
              {t('Investigations')}
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ScrollArea className="h-[300px]">
              <div className="p-4 space-y-3">
                {filteredEvents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {t('NoHistoryEvents')}
                  </p>
                ) : (
                  filteredEvents.map((event) => {
                    const Icon = getEventIcon(event.type);
                    const PhaseIcon = getPhaseIcon(event.phase);

                    return (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex gap-3 items-start"
                      >
                        <div
                          className={cn(
                            'mt-1 p-2 rounded-full bg-secondary/50',
                            getEventColor(event.type)
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>

                        <div className="flex-1 space-y-1">
                          <p className="text-sm">{event.content}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <PhaseIcon className="h-3 w-3" />
                              {t('Round')} {event.round}
                            </span>
                            {event.result && (
                              <Badge
                                variant={
                                  event.result === 'Mafia'
                                    ? 'destructive'
                                    : 'default'
                                }
                                className="text-xs"
                              >
                                {event.result}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  ChevronFirst,
  ChevronLast,
  Clock,
  MessageSquare,
  Vote,
  Moon,
  Sun,
  Skull,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type {
  ClientMessage,
  FilteredGameState,
} from '@/lib/interfaces/gameState.types';
import { MessageBubble } from './MessageBubble';
import { DynamicAvatar } from './ui/dynamic-avatar';

interface GameEvent {
  id: string;
  type:
    | 'message'
    | 'vote'
    | 'elimination'
    | 'night_action'
    | 'phase_change'
    | 'game_end';
  timestamp: number;
  round: number;
  phase: string;
  data: any;
  description: string;
}

interface GameReplayProps {
  gameState: FilteredGameState;
  className?: string;
}

export function GameReplay({ gameState, className }: GameReplayProps) {
  const { t } = useTranslation();
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Parse game events from the game state
  const gameEvents = useMemo(() => {
    const events: GameEvent[] = [];
    let eventId = 0;

    // Add initial game state
    events.push({
      id: `event-${eventId++}`,
      type: 'phase_change',
      timestamp: new Date(gameState.createdAt).getTime(),
      round: 0,
      phase: 'Init',
      data: { phase: 'Init' },
      description: t('replay.gameStarted', 'Game started'),
    });

    // Parse messages and create events
    gameState.log.forEach((message) => {
      // Phase change detection
      if (
        message.content.includes('Day begins') ||
        message.content.includes('Night falls')
      ) {
        const isDay = message.content.includes('Day begins');
        events.push({
          id: `event-${eventId++}`,
          type: 'phase_change',
          timestamp: new Date(message.timestamp).getTime(),
          round: gameState.round,
          phase: isDay ? 'Day' : 'Night',
          data: { phase: isDay ? 'Day' : 'Night' },
          description: isDay
            ? t('replay.dayBegins', 'Day begins')
            : t('replay.nightFalls', 'Night falls'),
        });
      }
      // Vote detection
      else if (message.content.includes('votes for')) {
        const match = message.content.match(/votes for (.+)\./);
        if (match) {
          events.push({
            id: `event-${eventId++}`,
            type: 'vote',
            timestamp: new Date(message.timestamp).getTime(),
            round: gameState.round,
            phase: 'Day',
            data: {
              voter: message.senderName,
              target: match[1],
            },
            description: t(
              'replay.playerVoted',
              '{{voter}} voted for {{target}}',
              {
                voter: message.senderName,
                target: match[1],
              }
            ),
          });
        }
      }
      // Elimination detection
      else if (
        message.content.includes('was eliminated') ||
        message.content.includes('was killed')
      ) {
        const eliminatedMatch = message.content.match(
          /(.+) \((.+)\) was (eliminated|killed)/
        );
        if (eliminatedMatch) {
          events.push({
            id: `event-${eventId++}`,
            type: 'elimination',
            timestamp: new Date(message.timestamp).getTime(),
            round: gameState.round,
            phase: message.content.includes('eliminated') ? 'Day' : 'Night',
            data: {
              player: eliminatedMatch[1],
              role: eliminatedMatch[2],
              method: eliminatedMatch[3],
            },
            description: message.content,
          });
        }
      }
      // Regular messages
      else if (message.senderId) {
        events.push({
          id: `event-${eventId++}`,
          type: 'message',
          timestamp: new Date(message.timestamp).getTime(),
          round: gameState.round,
          phase: gameState.phase,
          data: { message },
          description: t('replay.playerSpoke', '{{player}} spoke', {
            player: message.senderName,
          }),
        });
      }
    });

    // Add game end event if game is over
    if (gameState.winCondition) {
      events.push({
        id: `event-${eventId++}`,
        type: 'game_end',
        timestamp: new Date(
          gameState.lastUpdatedAt || gameState.createdAt
        ).getTime(),
        round: gameState.round,
        phase: 'GameOver',
        data: { winCondition: gameState.winCondition },
        description: gameState.winCondition,
      });
    }

    return events;
  }, [gameState, t]);

  // Get the state at current event
  const currentState = useMemo(() => {
    const state = {
      round: 0,
      phase: 'Init',
      alivePlayers: new Set(Object.keys(gameState.players)),
      messages: [] as ClientMessage[],
      lastElimination: null as string | null,
    };

    for (let i = 0; i <= currentEventIndex && i < gameEvents.length; i++) {
      const event = gameEvents[i];

      switch (event.type) {
        case 'phase_change':
          state.phase = event.data.phase;
          if (event.data.phase === 'Day' && state.phase === 'Night') {
            state.round++;
          }
          break;
        case 'message':
          state.messages.push(event.data.message);
          break;
        case 'elimination':
          const eliminatedPlayer = Object.values(gameState.players).find(
            (p) => p.name === event.data.player
          );
          if (eliminatedPlayer) {
            state.alivePlayers.delete(eliminatedPlayer.id);
            state.lastElimination = eliminatedPlayer.id;
          }
          break;
      }
    }

    return state;
  }, [currentEventIndex, gameEvents, gameState.players]);

  // Playback control
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentEventIndex((prev) => {
        if (prev >= gameEvents.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 2000 / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, gameEvents.length]);

  const handleSkipToEvent = (index: number) => {
    setCurrentEventIndex(Math.max(0, Math.min(index, gameEvents.length - 1)));
  };

  const handleReset = () => {
    setCurrentEventIndex(0);
    setIsPlaying(false);
  };

  const currentEvent = gameEvents[currentEventIndex];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Replay Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {t('replay.title', 'Game Replay')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Timeline Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>
                {t('replay.event', 'Event')} {currentEventIndex + 1} /{' '}
                {gameEvents.length}
              </span>
              <span>
                {t('replay.round', 'Round')} {currentState.round}
              </span>
            </div>
            <Slider
              value={[currentEventIndex]}
              onValueChange={([value]) => handleSkipToEvent(value)}
              max={gameEvents.length - 1}
              step={1}
              className="cursor-pointer"
            />
          </div>

          {/* Current Event Info */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'p-2 rounded-full',
                  currentEvent?.type === 'message' &&
                    'bg-blue-500/20 text-blue-500',
                  currentEvent?.type === 'vote' &&
                    'bg-yellow-500/20 text-yellow-500',
                  currentEvent?.type === 'elimination' &&
                    'bg-red-500/20 text-red-500',
                  currentEvent?.type === 'phase_change' &&
                    'bg-purple-500/20 text-purple-500',
                  currentEvent?.type === 'game_end' &&
                    'bg-green-500/20 text-green-500'
                )}
              >
                {currentEvent?.type === 'message' && (
                  <MessageSquare className="w-4 h-4" />
                )}
                {currentEvent?.type === 'vote' && <Vote className="w-4 h-4" />}
                {currentEvent?.type === 'elimination' && (
                  <Skull className="w-4 h-4" />
                )}
                {currentEvent?.type === 'phase_change' &&
                  (currentEvent.data.phase === 'Day' ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  ))}
                {currentEvent?.type === 'game_end' && (
                  <Shield className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium">{currentEvent?.description}</p>
                <p className="text-xs text-muted-foreground">
                  {currentEvent &&
                    new Date(currentEvent.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleReset}
              disabled={currentEventIndex === 0}
            >
              <ChevronFirst className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleSkipToEvent(currentEventIndex - 1)}
              disabled={currentEventIndex === 0}
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={currentEventIndex >= gameEvents.length - 1}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleSkipToEvent(currentEventIndex + 1)}
              disabled={currentEventIndex >= gameEvents.length - 1}
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handleSkipToEvent(gameEvents.length - 1)}
              disabled={currentEventIndex >= gameEvents.length - 1}
            >
              <ChevronLast className="w-4 h-4" />
            </Button>
          </div>

          {/* Playback Speed */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t('replay.speed', 'Speed')}:
            </span>
            <div className="flex gap-1">
              {[0.5, 1, 2, 4].map((speed) => (
                <Button
                  key={speed}
                  variant={playbackSpeed === speed ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPlaybackSpeed(speed)}
                >
                  {speed}x
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Game State Display */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Players */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">
              {t('replay.players', 'Players')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.values(gameState.players).map((player) => {
                const isAlive = currentState.alivePlayers.has(player.id);
                const isRecentlyEliminated =
                  currentState.lastElimination === player.id;

                return (
                  <motion.div
                    key={player.id}
                    animate={{
                      opacity: isAlive ? 1 : 0.5,
                      scale: isRecentlyEliminated ? [1, 0.95, 1] : 1,
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    <div
                      className={cn(
                        'p-2 rounded-lg border transition-colors',
                        isAlive ? 'bg-card' : 'bg-muted/50',
                        isRecentlyEliminated && 'border-red-500'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <DynamicAvatar
                          name={player.name}
                          role={player.role}
                          imageUrl={player.imageUrl}
                          size="sm"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{player.name}</p>
                          {player.role && (
                            <p className="text-xs text-muted-foreground">
                              {player.role}
                            </p>
                          )}
                        </div>
                        {!isAlive && (
                          <Skull className="w-4 h-4 text-destructive" />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Messages */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{t('replay.conversation', 'Conversation')}</span>
              <Badge variant="outline">
                {currentState.phase === 'Day' ? (
                  <Sun className="w-3 h-3 me-1" />
                ) : (
                  <Moon className="w-3 h-3 me-1" />
                )}
                {currentState.phase}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {currentState.messages.slice(-10).map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <MessageBubble
                      message={message}
                      players={gameState.players}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {currentState.messages.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  {t('replay.noMessages', 'No messages yet')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

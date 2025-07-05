'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
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
  Brain,
  Trophy,
  Users,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [selectedPlayerAIThoughts, setSelectedPlayerAIThoughts] = useState<
    string | null
  >(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight;
    }
  }, [currentState.messages]);

  return (
    <div className={cn('h-full flex flex-col bg-background', className)}>
      {/* Replay Header */}
      <div className="bg-card border-b">
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Clock className="w-6 h-6 text-primary" />
                {t('replay.title', 'Game Replay')}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('replay.subtitle', 'Review and analyze your game')}
              </p>
            </div>
            <Badge variant="outline" className="text-lg px-3 py-1">
              {currentState.phase === 'GameOver' ? (
                <Trophy className="w-4 h-4 mr-1" />
              ) : (
                <Clock className="w-4 h-4 mr-1" />
              )}
              {currentState.phase}
            </Badge>
          </div>
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

          {/* Current Event Card */}
          <motion.div
            key={currentEvent?.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-lg border p-4 shadow-sm"
          >
            <div className="flex items-start gap-4">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className={cn(
                  'p-3 rounded-full',
                  currentEvent?.type === 'message' &&
                    'bg-blue-500/10 text-blue-500',
                  currentEvent?.type === 'vote' &&
                    'bg-orange-500/10 text-orange-500',
                  currentEvent?.type === 'elimination' &&
                    'bg-red-500/10 text-red-500',
                  currentEvent?.type === 'phase_change' &&
                    'bg-purple-500/10 text-purple-500',
                  currentEvent?.type === 'game_end' &&
                    'bg-green-500/10 text-green-500'
                )}
              >
                {currentEvent?.type === 'message' && (
                  <MessageSquare className="w-5 h-5" />
                )}
                {currentEvent?.type === 'vote' && <Vote className="w-5 h-5" />}
                {currentEvent?.type === 'elimination' && (
                  <Skull className="w-5 h-5" />
                )}
                {currentEvent?.type === 'phase_change' &&
                  (currentEvent.data.phase === 'Day' ? (
                    <Sun className="w-5 h-5" />
                  ) : (
                    <Moon className="w-5 h-5" />
                  ))}
                {currentEvent?.type === 'game_end' && (
                  <Trophy className="w-5 h-5" />
                )}
              </motion.div>
              <div className="flex-1">
                <p className="font-semibold text-lg">
                  {currentEvent?.description}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentEvent &&
                    new Date(currentEvent.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-1 bg-muted/50 rounded-lg p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={currentEventIndex === 0}
              className="h-8 w-8"
            >
              <ChevronFirst className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSkipToEvent(currentEventIndex - 1)}
              disabled={currentEventIndex === 0}
              className="h-8 w-8"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant={isPlaying ? 'secondary' : 'default'}
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={currentEventIndex >= gameEvents.length - 1}
              className="h-8 px-4"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-4 h-4 mr-1" />
                  {t('replay.pause', 'Pause')}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-1" />
                  {t('replay.play', 'Play')}
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSkipToEvent(currentEventIndex + 1)}
              disabled={currentEventIndex >= gameEvents.length - 1}
              className="h-8 w-8"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSkipToEvent(gameEvents.length - 1)}
              disabled={currentEventIndex >= gameEvents.length - 1}
              className="h-8 w-8"
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
        </div>
      </div>

      {/* Game State Display */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 overflow-hidden">
        {/* Players Panel */}
        <div className="lg:col-span-1 bg-card rounded-lg border shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t('replay.players', 'Players')}
            </h3>
          </div>
          <ScrollArea className="flex-1 p-4">
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
                        <div className="flex items-center gap-1">
                          {!isAlive && (
                            <Skull className="w-4 h-4 text-destructive" />
                          )}
                          {gameState.agentMemories?.[player.id] &&
                            gameState.agentMemories[player.id]
                              .aiConversationLogs &&
                            gameState.agentMemories[player.id]
                              .aiConversationLogs.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setSelectedPlayerAIThoughts(player.id)
                                }
                                title={t(
                                  'replay.viewAIThoughts',
                                  'View AI thoughts'
                                )}
                              >
                                <Brain className="w-4 h-4" />
                              </Button>
                            )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Messages Panel */}
        <div className="lg:col-span-2 bg-card rounded-lg border shadow-sm flex flex-col overflow-hidden">
          <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              {t('replay.conversation', 'Conversation')}
            </h3>
            <Badge
              variant={currentState.phase === 'Day' ? 'default' : 'secondary'}
            >
              {currentState.phase === 'Day' ? (
                <Sun className="w-3 h-3 mr-1" />
              ) : (
                <Moon className="w-3 h-3 mr-1" />
              )}
              {currentState.phase}
            </Badge>
          </div>
          <div
            className="flex-1 p-4 space-y-2 overflow-y-auto"
            ref={messagesContainerRef}
          >
            {currentState.messages.slice(-10).map((message) => (
              <div key={message.id}>
                <MessageBubble message={message} players={gameState.players} />
              </div>
            ))}
            {currentState.messages.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                {t('replay.noMessages', 'No messages yet')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* AI Thoughts Dialog */}
      <Dialog
        open={!!selectedPlayerAIThoughts}
        onOpenChange={(open) => !open && setSelectedPlayerAIThoughts(null)}
      >
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              {selectedPlayerAIThoughts &&
                gameState.players[selectedPlayerAIThoughts]?.name}{' '}
              - {t('replay.aiThoughts', 'AI Thoughts')}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            {selectedPlayerAIThoughts &&
              gameState.agentMemories?.[selectedPlayerAIThoughts]
                ?.aiConversationLogs && (
                <div className="space-y-6">
                  {gameState.agentMemories[
                    selectedPlayerAIThoughts
                  ].aiConversationLogs.map((log, index) => (
                    <Card key={index} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <Badge variant="outline">
                            {t('replay.round', 'Round')} {log.round} -{' '}
                            {log.phase}
                          </Badge>
                          <span className="text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>

                        {log.prompt.user && (
                          <div>
                            <p className="text-sm font-medium mb-1">
                              {t('replay.gameState', 'Game State')}:
                            </p>
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                              {log.prompt.user}
                            </pre>
                          </div>
                        )}

                        {log.response.raw && (
                          <div>
                            <p className="text-sm font-medium mb-1">
                              {t('replay.aiResponse', 'AI Response')}:
                            </p>
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
                              {log.response.raw}
                            </pre>
                          </div>
                        )}

                        {log.response.parsedAction && (
                          <div>
                            <p className="text-sm font-medium mb-1">
                              {t('replay.action', 'Action')}:
                            </p>
                            <Badge variant="secondary">
                              {log.response.parsedAction.type}
                              {log.response.parsedAction.type === 'vote' &&
                                log.response.parsedAction.targetPlayerId &&
                                ' → ' +
                                  gameState.players[
                                    log.response.parsedAction.targetPlayerId
                                  ]?.name}
                              {log.response.parsedAction.type === 'message' &&
                                ': ' + log.response.parsedAction.content}
                            </Badge>
                          </div>
                        )}

                        {log.response.error && (
                          <div className="text-destructive text-sm">
                            <p className="font-medium">
                              {t('replay.error', 'Error')}:
                            </p>
                            <p>{log.response.error}</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

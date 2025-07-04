'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  EyeOff,
  Play,
  Pause,
  SkipForward,
  Brain,
  Users,
  Moon,
  Sun,
  MessageSquare,
  Shield,
  Search,
  Skull,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type {
  FilteredGameState,
  ClientMessage,
} from '@/lib/interfaces/gameState.types';
import { MessageBubble } from './MessageBubble';
import { DynamicAvatar } from './ui/dynamic-avatar';
import { RoleName } from '@/lib/engine/interfaces/IRole';

interface SpectatorModeProps {
  gameState: FilteredGameState;
  messages: ClientMessage[];
  onSpeedChange?: (speed: number) => void;
  className?: string;
}

interface PlayerInsight {
  playerId: string;
  role: RoleName;
  allegiance: 'Town' | 'Mafia';
  isAlive: boolean;
  lastAction?: string;
  suspicionLevel?: number;
  targetedBy?: string[];
}

interface SpectatorInsights {
  players: Map<string, PlayerInsight>;
  currentPhase: string;
  mafiaTarget?: string;
  doctorTarget?: string;
  seerTarget?: string;
  votingIntentions: Map<string, string>;
  aiReasoning?: {
    playerId: string;
    thought: string;
    confidence: number;
  }[];
}

const SpectatorMode: React.FC<SpectatorModeProps> = ({
  gameState,
  messages,
  onSpeedChange,
  className,
}) => {
  const {} = useTranslation();
  const [isPlaying, setIsPlaying] = useState(true);
  const [gameSpeed, setGameSpeed] = useState(1); // 0.5x, 1x, 2x, 3x
  const [showInsights, setShowInsights] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);

  // Mock insights data - in real implementation, this would come from the game engine
  const insights: SpectatorInsights = {
    players: new Map(
      Object.values(gameState.players).map((player) => [
        player.id,
        {
          playerId: player.id,
          role: player.role || RoleName.Villager,
          allegiance: player.role === RoleName.Mafia ? 'Mafia' : 'Town',
          isAlive: player.status === 'Alive',
          suspicionLevel: Math.random() * 100,
          targetedBy: [],
        },
      ])
    ),
    currentPhase: gameState.phase,
    votingIntentions: new Map(),
    aiReasoning: Object.values(gameState.players)
      .filter((p) => p.status === 'Alive')
      .map((p) => ({
        playerId: p.id,
        thought: `Analyzing ${p.name}'s behavior and voting patterns...`,
        confidence: Math.random() * 100,
      })),
  };

  const handleSpeedChange = useCallback(
    (value: number[]) => {
      const speed = value[0];
      setGameSpeed(speed);
      onSpeedChange?.(speed);
    },
    [onSpeedChange]
  );

  const getRoleIcon = (role: RoleName) => {
    switch (role) {
      case RoleName.Mafia:
        return <Skull className="w-4 h-4" />;
      case RoleName.Doctor:
        return <Shield className="w-4 h-4" />;
      case RoleName.Seer:
        return <Search className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const getRoleColor = (role: RoleName) => {
    switch (role) {
      case RoleName.Mafia:
        return 'text-red-500';
      case RoleName.Doctor:
        return 'text-blue-500';
      case RoleName.Seer:
        return 'text-purple-500';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className={cn('flex flex-col lg:flex-row gap-4 h-full', className)}>
      {/* Main Game View */}
      <div className="flex-1 space-y-4">
        {/* Game Controls */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={isPlaying ? 'default' : 'outline'}
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>
                <Button size="sm" variant="outline">
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-4 flex-1">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  Speed:
                </span>
                <Slider
                  value={[gameSpeed]}
                  onValueChange={handleSpeedChange}
                  min={0.5}
                  max={3}
                  step={0.5}
                  className="w-32"
                />
                <span className="text-sm font-medium w-12">{gameSpeed}x</span>
              </div>

              <Toggle
                pressed={showInsights}
                onPressedChange={setShowInsights}
                size="sm"
              >
                {showInsights ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                <span className="ml-2">Insights</span>
              </Toggle>
            </div>
          </CardContent>
        </Card>

        {/* Game Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {gameState.phase === 'Day' ? (
                  <Sun className="w-5 h-5 text-yellow-500" />
                ) : (
                  <Moon className="w-5 h-5 text-blue-500" />
                )}
                {gameState.phase} - Round {gameState.round}
              </CardTitle>
              <Badge variant="outline">
                {
                  Object.values(gameState.players).filter(
                    (p) => p.status === 'Alive'
                  ).length
                }{' '}
                alive
              </Badge>
            </div>
          </CardHeader>
        </Card>

        {/* Messages & Activity */}
        <Card className="flex-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Game Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {messages.slice(-20).map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      <MessageBubble
                        message={message}
                        players={gameState.players}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Spectator Insights Panel */}
      {showInsights && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="w-full lg:w-96 space-y-4"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                Spectator Insights
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="w-full rounded-none">
                  <TabsTrigger value="overview" className="flex-1">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="players" className="flex-1">
                    Players
                  </TabsTrigger>
                  <TabsTrigger value="ai" className="flex-1">
                    AI Thoughts
                  </TabsTrigger>
                </TabsList>

                <div className="p-4">
                  <TabsContent value="overview" className="mt-0 space-y-4">
                    {/* Team Balance */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">Team Balance</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Town
                          </span>
                          <Badge variant="secondary">
                            {
                              Array.from(insights.players.values()).filter(
                                (p) => p.allegiance === 'Town' && p.isAlive
                              ).length
                            }
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Mafia
                          </span>
                          <Badge variant="destructive">
                            {
                              Array.from(insights.players.values()).filter(
                                (p) => p.allegiance === 'Mafia' && p.isAlive
                              ).length
                            }
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Current Actions */}
                    <div>
                      <h4 className="text-sm font-medium mb-2">
                        Current Phase Actions
                      </h4>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        {gameState.phase === 'Night' ? (
                          <>
                            <p>• Mafia discussing targets</p>
                            <p>• Doctor choosing protection</p>
                            <p>• Seer investigating a player</p>
                          </>
                        ) : (
                          <>
                            <p>• Players discussing suspicions</p>
                            <p>• Building cases against suspects</p>
                            <p>• Preparing for voting phase</p>
                          </>
                        )}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="players" className="mt-0">
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {Object.values(gameState.players).map((player) => {
                          const insight = insights.players.get(player.id);
                          if (!insight) return null;

                          return (
                            <motion.div
                              key={player.id}
                              className={cn(
                                'p-3 rounded-lg border cursor-pointer transition-colors',
                                selectedPlayer === player.id
                                  ? 'bg-accent'
                                  : 'hover:bg-accent/50',
                                !insight.isAlive && 'opacity-50'
                              )}
                              onClick={() => setSelectedPlayer(player.id)}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <div className="flex items-start gap-3">
                                <DynamicAvatar
                                  name={player.name}
                                  role={insight.role}
                                  imageUrl={player.imageUrl}
                                  size="sm"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-medium text-sm truncate">
                                      {player.name}
                                    </h5>
                                    {!insight.isAlive && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        Dead
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span
                                      className={cn(
                                        'text-xs flex items-center gap-1',
                                        getRoleColor(insight.role)
                                      )}
                                    >
                                      {getRoleIcon(insight.role)}
                                      {insight.role}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      •
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {insight.allegiance}
                                    </span>
                                  </div>
                                  {insight.suspicionLevel && (
                                    <div className="mt-2">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">
                                          Suspicion
                                        </span>
                                        <span>
                                          {Math.round(insight.suspicionLevel)}%
                                        </span>
                                      </div>
                                      <div className="w-full bg-secondary rounded-full h-1.5 mt-1">
                                        <div
                                          className="bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 h-1.5 rounded-full transition-all"
                                          style={{
                                            width: `${insight.suspicionLevel}%`,
                                          }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="ai" className="mt-0">
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {insights.aiReasoning?.map((reasoning, index) => {
                          const player = Object.values(gameState.players).find(
                            (p) => p.id === reasoning.playerId
                          );
                          if (!player) return null;

                          return (
                            <div
                              key={index}
                              className="p-3 rounded-lg bg-secondary/30"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <DynamicAvatar
                                  name={player.name}
                                  size="sm"
                                  imageUrl={player.imageUrl}
                                />
                                <h5 className="font-medium text-sm">
                                  {player.name}
                                </h5>
                                <Badge
                                  variant="outline"
                                  className="text-xs ml-auto"
                                >
                                  {Math.round(reasoning.confidence)}% confident
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground italic">
                                &quot;{reasoning.thought}&quot;
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
};

export default SpectatorMode;

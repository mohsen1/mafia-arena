'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Pause,
  SkipForward,
  Moon,
  Sun,
  MessageSquare,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import type {
  FilteredGameState,
  ClientMessage,
} from '@/lib/interfaces/gameState.types';
import { MessageBubble } from './MessageBubble';

interface SpectatorModeProps {
  gameState: FilteredGameState;
  messages: ClientMessage[];
  onSpeedChange?: (speed: number) => void;
  className?: string;
}

const SpectatorMode: React.FC<SpectatorModeProps> = ({
  gameState,
  messages,
  onSpeedChange,
  className,
}) => {

  const [isPlaying, setIsPlaying] = useState(true);
  const [gameSpeed, setGameSpeed] = useState(1);

  const handleSpeedChange = useCallback(
    (value: number[]) => {
      const speed = value[0];
      setGameSpeed(speed);
      onSpeedChange?.(speed);
    },
    [onSpeedChange]
  );

  return (
    <div className={cn('flex flex-col gap-2 h-full', className)}>
      {/* Compact Game Controls */}
      <div className="flex items-center gap-2 p-2 bg-card rounded-lg">
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

        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-muted-foreground">Speed:</span>
          <Slider
            value={[gameSpeed]}
            onValueChange={handleSpeedChange}
            min={0.5}
            max={3}
            step={0.5}
            className="w-24"
          />
          <span className="text-xs font-medium w-8">{gameSpeed}x</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          {gameState.phase === 'Day' ? (
            <Sun className="w-4 h-4 text-yellow-500" />
          ) : (
            <Moon className="w-4 h-4 text-blue-500" />
          )}
          <span className="font-medium">
            {gameState.phase} {gameState.round}
          </span>
          <Badge variant="outline" className="text-xs">
            {
              Object.values(gameState.players).filter(
                (p) => p.status === 'Alive'
              ).length
            }{' '}
            alive
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <Card className="flex-1">
        <CardHeader className="py-2 px-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Game Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {messages.slice(-50).map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
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
  );
};

export default SpectatorMode;

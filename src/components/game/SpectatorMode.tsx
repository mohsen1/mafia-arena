'use client';

import React, { useState, useRef, useEffect } from 'react';
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
import { cn } from '@/lib/utils';
import type {
  FilteredGameState,
  ClientMessage,
} from '@/lib/interfaces/gameState.types';
import { MessageBubble } from '@/components/game/MessageBubble';

interface SpectatorModeProps {
  gameState: FilteredGameState;
  messages: ClientMessage[];
  onSpeedChange?: (speed: number) => void;
  className?: string;
}

const SpectatorMode: React.FC<SpectatorModeProps> = ({
  gameState,
  messages,
  className,
}) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollContentRef.current && scrollAreaRef.current) {
      // Find the ScrollArea viewport
      const viewport = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (viewport) {
        // Scroll to bottom
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages.length]);

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

        <div className="flex items-center gap-2 text-sm ml-auto">
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
          <ScrollArea ref={scrollAreaRef} className="h-[calc(100vh-200px)]">
            <div ref={scrollContentRef} className="space-y-1">
              {messages.slice(-50).map((message) => (
                <div key={message.id}>
                  <MessageBubble
                    message={message}
                    players={gameState.players}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default SpectatorMode;

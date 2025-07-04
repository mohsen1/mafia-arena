'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DynamicAvatar } from './ui/dynamic-avatar';
import { MemoizedReactMarkdown } from './MemoizedReactMarkdown';
import type {
  ClientMessage,
  FilteredPlayer,
  PlayerId,
} from '@/lib/interfaces/gameState.types';
import { MessageVisibility } from '@/lib/engine/interfaces/IMessage';
import Image from 'next/image';
import { useGameContext } from '@/context/GameContext';

interface MessageBubbleProps {
  message: ClientMessage;
  players: Record<PlayerId, FilteredPlayer>;
  isWerewolfChat?: boolean;
}

export function MessageBubble({ message, players }: MessageBubbleProps) {
  const { gameState } = useGameContext();
  const sender = message.senderId ? players[message.senderId] : null;
  const isModeratorMessage =
    message.senderId === 'moderator' || !message.senderId;
  const isMafiaMessage = message.visibility === MessageVisibility.Mafia;
  const isHumanMessage = message.senderId === gameState?.humanPlayerId;

  if (isModeratorMessage) {
    return (
      <div className="flex items-start gap-2 py-1">
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 mt-0.5">
          <Image
            src="/images/characters/mod.png"
            alt="Moderator"
            width={32}
            height={32}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Moderator
            </span>
          </div>
          <div className="text-xs text-muted-foreground italic">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 py-1',
        isMafiaMessage && 'bg-red-950/20 px-2 rounded',
        isHumanMessage && 'bg-blue-500/10 px-2 rounded'
      )}
    >
      {sender && (
        <DynamicAvatar
          name={sender.name}
          role={sender.role}
          imageUrl={sender.imageUrl}
          size="sm"
          showRole={false}
          className="mt-0.5"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1">
          <span
            className={cn(
              'text-xs font-medium',
              isHumanMessage && 'text-blue-600 dark:text-blue-400'
            )}
          >
            {sender?.name || 'Unknown'}
          </span>
          {isMafiaMessage && (
            <span className="text-[10px] text-red-400">(Mafia)</span>
          )}
          {isHumanMessage && (
            <span className="text-[10px] text-blue-600 dark:text-blue-400">
              (You)
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          <MemoizedReactMarkdown>{message.content}</MemoizedReactMarkdown>
        </div>
      </div>
    </div>
  );
}

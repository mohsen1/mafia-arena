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
      <div className="flex justify-center py-2">
        <div className="bg-muted/30 rounded-full px-4 py-2 max-w-[80%] flex items-center gap-2">
          <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
            <Image
              src="/images/characters/mod.png"
              alt="Moderator"
              width={20}
              height={20}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="text-xs text-muted-foreground italic text-center">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex gap-2 py-1',
        isHumanMessage ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      {sender && !isHumanMessage && (
        <DynamicAvatar
          name={sender.name}
          role={sender.role}
          imageUrl={sender.imageUrl}
          size="sm"
          showRole={false}
          className="flex-shrink-0"
        />
      )}
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2',
          isHumanMessage
            ? 'bg-primary text-primary-foreground ms-auto'
            : 'bg-muted',
          isMafiaMessage &&
            !isHumanMessage &&
            'bg-red-950/30 border border-red-900/20'
        )}
      >
        <div className="flex items-baseline gap-2 mb-1">
          <span
            className={cn(
              'text-xs font-medium',
              isHumanMessage && 'text-primary-foreground'
            )}
          >
            {isHumanMessage ? 'You' : sender?.name || 'Unknown'}
          </span>
          {isMafiaMessage && (
            <span
              className={cn(
                'text-[10px]',
                isHumanMessage ? 'text-primary-foreground/70' : 'text-red-400'
              )}
            >
              (Mafia)
            </span>
          )}
        </div>
        <div
          className={cn(
            'text-sm',
            isHumanMessage ? 'text-primary-foreground' : 'text-foreground'
          )}
        >
          <MemoizedReactMarkdown>{message.content}</MemoizedReactMarkdown>
        </div>
      </div>
      {sender && isHumanMessage && (
        <DynamicAvatar
          name={sender.name}
          role={sender.role}
          imageUrl={sender.imageUrl}
          size="sm"
          showRole={false}
          className="flex-shrink-0"
        />
      )}
    </div>
  );
}

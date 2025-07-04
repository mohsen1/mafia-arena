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

interface MessageBubbleProps {
  message: ClientMessage;
  players: Record<PlayerId, FilteredPlayer>;
  isWerewolfChat?: boolean;
}

export function MessageBubble({
  message,
  players,
}: MessageBubbleProps) {
  const sender = message.senderId ? players[message.senderId] : null;
  const isModeratorMessage = message.senderId === 'moderator';
  const isMafiaMessage = message.visibility === MessageVisibility.Mafia;

  if (isModeratorMessage) {
    return (
      <div className="text-center py-1">
        <p className="text-xs text-muted-foreground italic">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-2 py-1',
        isMafiaMessage && 'bg-red-950/20 px-2 rounded'
      )}
    >
      {sender && (
        <DynamicAvatar
          name={sender.name}
          role={sender.role}
          imageUrl={
            sender.imageUrl ||
            (isModeratorMessage ? '/images/characters/mod.png' : undefined)
          }
          size="sm"
          showRole={false}
          className="mt-0.5"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1">
          <span className="text-xs font-medium">
            {sender?.name || 'Unknown'}
          </span>
          {isMafiaMessage && (
            <span className="text-[10px] text-red-400">(Mafia)</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          <MemoizedReactMarkdown>{message.content}</MemoizedReactMarkdown>
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DynamicAvatar } from '@/components/ui/dynamic-avatar';
import { MemoizedReactMarkdown } from '@/components/common/MemoizedReactMarkdown';
import { SpeakText } from '@/components/common/SpeakText';
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

const MessageBubbleComponent = ({ message, players }: MessageBubbleProps) => {
  const { gameState, isAudioGloballyEnabled } = useGameContext();
  const sender = message.senderId ? players[message.senderId] : null;
  const isModeratorMessage =
    message.senderId === 'moderator' || !message.senderId;
  const isMafiaMessage = message.visibility === MessageVisibility.Mafia;
  const isHumanMessage = message.senderId === gameState?.humanPlayerId;

  const timestamp = () => new Date().toISOString().split('T')[1].split('.')[0];

  console.log(`[MessageBubble] ${timestamp()} Component render:`, {
    messageId: message.id,
    senderId: message.senderId,
    senderName: sender?.name || 'Unknown',
    isModeratorMessage,
    isHumanMessage,
    isMafiaMessage,
    contentLength: message.content.length,
    contentPreview: message.content.substring(0, 30) + '...',
    isAudioGloballyEnabled,
  });

  // Default voice IDs - you should replace these with actual voice IDs from ElevenLabs
  const getVoiceId = () => {
    if (isModeratorMessage) {
      return 'EXAVITQu4vr4xnSDxMaL'; // Narrator voice
    }
    // You can assign different voices based on player characteristics
    // For now, using a default voice
    return '21m00Tcm4TlvDq8ikWAM'; // Default voice
  };

  const renderContent = (content: string) => {
    // Use isAudioGloballyEnabled which is properly initialized from voiceModeEnabled
    const voiceEnabled = isAudioGloballyEnabled;

    // Debug logging
    console.log(`[MessageBubble] ${timestamp()} 🔊 Voice check:`, {
      messageId: message.id,
      voiceModeEnabled: gameState?.voiceModeEnabled,
      isAudioGloballyEnabled,
      voiceEnabled,
      isHumanMessage,
      messageContent: content.substring(0, 50) + '...',
      willUseSpeakText: voiceEnabled && !isHumanMessage,
    });

    // Only use voice for AI messages, not human messages
    if (voiceEnabled && !isHumanMessage) {
      console.log(
        `[MessageBubble] ${timestamp()} 🎤 RENDERING with SpeakText:`,
        {
          messageId: message.id,
          voiceId: getVoiceId(),
          autoPlay: true,
        }
      );
      return (
        <SpeakText
          text={content}
          voiceId={getVoiceId()}
          autoPlay={true}
          showControls={false}
        />
      );
    }

    console.log(`[MessageBubble] ${timestamp()} 📝 RENDERING without voice:`, {
      messageId: message.id,
      reason: voiceEnabled ? 'isHumanMessage' : 'voiceDisabled',
    });
    return <MemoizedReactMarkdown>{content}</MemoizedReactMarkdown>;
  };

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
            {renderContent(message.content)}
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
          {renderContent(message.content)}
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
};

// Memoize the component to prevent re-renders unless props actually change
export const MessageBubble = React.memo(
  MessageBubbleComponent,
  (prevProps, nextProps) => {
    // Custom comparison function
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.content === nextProps.message.content &&
      prevProps.isWerewolfChat === nextProps.isWerewolfChat &&
      // Don't re-render just because of players object reference change
      Object.keys(prevProps.players).length ===
        Object.keys(nextProps.players).length
    );
  }
);

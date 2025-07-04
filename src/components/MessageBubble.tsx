'use client';

import type {
  FilteredPlayer,
  ClientMessage,
} from '@/lib/interfaces/gameState.types';
import { useGameContext } from '@/context/GameContext';
import { SpeakText } from '@/components/SpeakText';
import { cn } from '@/lib/utils';
import { useSpokenText } from '@/context/SpokenTextContext';
import { useTranslation } from 'react-i18next';
import type { PlayerId } from '@/lib/engine/interfaces/IPlayer';
import { DynamicAvatar } from '@/components/ui/dynamic-avatar';
import { Gavel } from 'lucide-react';

// Define the props using ClientMessage
interface MessageBubbleProps {
  message: ClientMessage;
  players: Record<PlayerId, FilteredPlayer>;
  isWerewolfChat?: boolean;
}

// Message Component with Dark Mode
export function MessageBubble({
  message,
  players,
  isWerewolfChat,
}: MessageBubbleProps) {
  const { reportAudioFinished, isAudioGloballyEnabled, gameState } =
    useGameContext();
  const { doneSpeaking: spokenTextReportAudioFinished } = useSpokenText();

  // Use default namespace; language is handled by i18next provider
  const { t } = useTranslation();

  // Determine the speaker based on senderId
  const isModerator = message.senderId === null;
  const speakerPlayer = message.senderId ? players[message.senderId] : null;

  // Determine if the speaker is human (assuming FilteredPlayer might have an isHuman flag, or we derive it)
  // For now, let's assume human if senderId matches humanPlayerId from context
  const isHuman = message.senderId === gameState?.humanPlayerId;
  // Player messages should be distinct - any non-moderator message is a player message
  const isPlayerMessage = !isModerator;

  // Callback for when SpeakText finishes
  const handleAudioEnd = () => {
    reportAudioFinished(message.id);
    spokenTextReportAudioFinished(message.id);
  };

  // iMessage-like styling
  const bubbleClasses = cn(
    'mb-2 flex max-w-[85%] flex-col rounded-2xl px-4 py-2',
    {
      'self-end bg-blue-500 text-white': isHuman,
      'self-end bg-secondary text-secondary-foreground': isModerator,
      'self-start bg-muted text-foreground': isPlayerMessage && !isHuman,
      'border border-red-500/50 bg-red-900/10': isWerewolfChat,
    }
  );

  // Container for image + bubble
  const containerClasses = cn('flex items-start gap-2 mb-4', {
    'justify-end': isHuman,
    'justify-start': !isHuman,
  });

  // Use message.senderName directly
  const speakerDisplayName = isModerator
    ? t('ModeratorName', { defaultValue: 'Moderator' })
    : message.senderName;

  return (
    <div className={containerClasses}>
      {/* Show avatar for non-human, non-moderator messages */}
      {isPlayerMessage && !isHuman && (
        <DynamicAvatar
          name={speakerPlayer?.name || 'Unknown'}
          role={speakerPlayer?.role}
          imageUrl={speakerPlayer?.imageUrl}
          size="sm"
          className="flex-shrink-0"
          aria-hidden="true"
        />
      )}

      {/* Show moderator avatar */}
      {isModerator && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Gavel className="w-4 h-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'flex flex-col',
          isHuman || isModerator ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={bubbleClasses}
          role="article"
          aria-label={`${speakerDisplayName}: ${message.content}`}
        >
          {/* Speaker name for non-human messages */}
          {!isHuman && !isModerator && (
            <p
              className="text-xs font-medium mb-1 opacity-70"
              aria-hidden="true"
            >
              {speakerDisplayName}
            </p>
          )}

          <p className="text-sm">{message.content}</p>

          {/* Timestamp */}
          <p
            className="text-xs opacity-50 mt-1"
            aria-label={`Sent at ${new Date(message.timestamp).toLocaleTimeString()}`}
          >
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/* Audio control */}
        {isAudioGloballyEnabled && isPlayerMessage && !isHuman && (
          <div
            className="mt-1"
            aria-label={`Play audio for ${speakerDisplayName}'s message`}
          >
            <SpeakText
              voiceId={speakerPlayer?.voiceId}
              onEnd={handleAudioEnd}
              autoQueue
              disabled={isWerewolfChat}
            >
              {message.content}
            </SpeakText>
          </div>
        )}
      </div>

      {/* Show avatar for human messages on the right */}
      {isPlayerMessage && isHuman && speakerPlayer && (
        <DynamicAvatar
          name={speakerPlayer.name}
          role={speakerPlayer.role}
          imageUrl={speakerPlayer.imageUrl}
          size="sm"
          className="flex-shrink-0"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

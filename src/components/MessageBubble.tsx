"use client";

import type { FilteredPlayer, ClientMessage } from "@/lib/interfaces/client.types";
import { useGameContext } from "@/context/GameContext";
import { SpeakText } from "@/components/SpeakText";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { useSpokenText } from "@/context/SpokenTextContext";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import type { PlayerId } from "@/lib/engine/interfaces/IPlayer";

// Define the props using ClientMessage
interface MessageBubbleProps {
  message: ClientMessage;
  players: Record<PlayerId, FilteredPlayer>;
  isWerewolfChat?: boolean;
}

// Message Component with Dark Mode
export function MessageBubble({ message, players, isWerewolfChat }: MessageBubbleProps) {
  const { reportAudioFinished, isAudioGloballyEnabled, gameState } = useGameContext();
  const { doneSpeaking: spokenTextReportAudioFinished } = useSpokenText();

  // Use default namespace; language is handled by i18next provider
  const { t } = useTranslation();

  // Determine the speaker based on senderId
  const isModerator = message.senderId === null;
  const speakerPlayer = message.senderId ? players[message.senderId] : null;

  // Determine if the speaker is human (assuming FilteredPlayer might have an isHuman flag, or we derive it)
  // For now, let's assume human if senderId matches humanPlayerId from context
  const isHuman = message.senderId === gameState?.humanPlayerId;
  // Assume bot if not moderator and not human
  const isBot = !isModerator && !isHuman;

  const imageUrl = speakerPlayer?.imageUrl;

  // Callback for when SpeakText finishes
  const handleAudioEnd = () => {
    reportAudioFinished(message.id);
    spokenTextReportAudioFinished(message.id);
  };

  // iMessage-like styling
  const bubbleClasses = cn(
    "mb-2 flex max-w-[85%] flex-col rounded-2xl px-4 py-2",
    {
      "self-end bg-blue-500 text-white": isHuman,
      "self-end bg-secondary text-secondary-foreground": isModerator,
      "self-start bg-muted text-foreground": isBot,
      "border border-red-500/50 bg-red-900/10": isWerewolfChat,
    },
  );

  // Container for image + bubble
  const containerClasses = cn("flex items-start gap-2 mb-4", {
    "justify-end": isHuman || isModerator,
    "justify-start": isBot,
  });

  // Use message.senderName directly
  const speakerDisplayName = isModerator ? t('ModeratorName', { defaultValue: 'Moderator' }) : message.senderName;
  // Translate the display name if needed (e.g., role names used as senderName)
  const translatedSpeakerName = t(speakerDisplayName, { defaultValue: speakerDisplayName });

  // Placeholder translation logic (assuming message.content contains the key/text)
  // TODO: Adapt if message structure for translations changes (e.g., separate phraseKey)
  const messageContent = message.content;
  // const translatePlaceholders = ... (This logic might need adjustment based on how placeholders are stored)

  return (
    <div className={containerClasses}>
      {isBot && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden flex-shrink-0">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={translatedSpeakerName}
              width={32}
              height={32}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Bot size={18} />
            </div>
          )}
        </div>
      )}

      <div className={bubbleClasses}>
        <div className={cn("flex items-center gap-2 justify-start", {
          "justify-end": isHuman || isModerator,
        })}>
          <span
            className={cn(
              "text-xs font-semibold opacity-80",
              isHuman ? "text-blue-100" : "text-foreground",
            )}
          >
            {translatedSpeakerName}
          </span>
          {isBot && isAudioGloballyEnabled && (
            <SpeakText
              voiceId={speakerPlayer?.voiceId}
              className="text-xs"
              autoQueue
              onEnd={handleAudioEnd}
              disabled={isWerewolfChat}
            >
              {messageContent}
            </SpeakText>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap">
          {messageContent}
        </p>
      </div>

      {(isHuman || isModerator) && (
        <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden flex-shrink-0">
          {isModerator ? (
            <Image
              src="/images/characters/mod.png"
              alt={t('ModeratorName', { defaultValue: 'Moderator' })}
              width={32}
              height={32}
              className="object-cover"
            />
          ) : imageUrl ? (
            <Image
              src={imageUrl}
              alt={translatedSpeakerName}
              width={32}
              height={32}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary text-primary-foreground">
              <User size={18} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

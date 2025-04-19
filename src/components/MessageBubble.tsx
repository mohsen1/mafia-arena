"use client";

import type { FilteredGameState, ChatMessage } from "@/lib/types/game";
import { useGameContext } from "@/context/GameContext";
import { SpeakText } from "@/components/SpeakText";
import { cn } from "@/lib/utils";
import { Bot, User } from "lucide-react";
import { useSpokenText } from "@/context/SpokenTextContext";
import Image from "next/image";
import { useTranslation } from "react-i18next";

// Define the props
interface MessageBubbleProps {
  message: Omit<ChatMessage, "audience"> & { speakerName: string };
  players: FilteredGameState["players"];
}

// Message Component with Dark Mode
export function MessageBubble({ message, players }: MessageBubbleProps) {
  const { reportAudioFinished, isAudioGloballyEnabled, gameState } = useGameContext();
  const { doneSpeaking: spokenTextReportAudioFinished } = useSpokenText();

  // Use default namespace; language is handled by i18next provider
  const { t } = useTranslation();

  // Determine the speaker
  const isModerator = message.speaker.type === "moderator";
  const speakerPlayer =
    message.speaker.type === "player"
      ? players[message.speaker.playerId]
      : null;
  // Assume player is human if they exist and DON'T have an aiModel property
  const isHuman =
    message.speaker.type === "player" &&
    !!speakerPlayer &&
    !speakerPlayer.aiModel;
  // Assume player is bot if they exist and DO have an aiModel property
  const isBot = message.speaker.type === "player" && !!speakerPlayer?.aiModel;

  const imageUrl = speakerPlayer?.imageUrl;

  // Callback for when SpeakText finishes
  const handleAudioEnd = () => {
    reportAudioFinished(message.messageId);
    spokenTextReportAudioFinished(message.messageId);
  };

  // iMessage-like styling
  const bubbleClasses = cn(
    "mb-2 flex max-w-[85%] flex-col rounded-2xl px-4 py-2",
    {
      "self-end bg-blue-500 text-white": isHuman,
      "self-end bg-secondary text-secondary-foreground": isModerator,
      "self-start bg-muted text-foreground": isBot,
    },
  );

  // Container for image + bubble
  const containerClasses = cn("flex items-start gap-2 mb-4", {
    "justify-end": isHuman || isModerator,
    "justify-start": isBot,
  });

  // Translate speaker name if it's a key
  const translatedSpeakerName = t(message.speakerName, { defaultValue: message.speakerName });

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
            {isModerator ? t('ModeratorName', { defaultValue: 'Moderator' }) : translatedSpeakerName}
          </span>
          {isBot && isAudioGloballyEnabled && (
            <SpeakText
              voiceId={
                message.speaker.type === "player" && speakerPlayer
                  ? speakerPlayer.voiceId
                  : undefined
              }
              className="text-xs"
              autoQueue
              onEnd={handleAudioEnd}
            >
              {message.content}
            </SpeakText>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap">
          {message.phraseKey
            ? t(message.phraseKey, {
                ...(message.placeholders || {}),
                defaultValue: message.content,
              })
            : message.content}
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

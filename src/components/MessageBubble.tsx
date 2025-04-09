'use client';

import React from 'react';
import Image from 'next/image';
import type { FilteredGameState, ChatMessage } from "@/lib/types/game";
import { useGameContext } from '@/context/GameContext'; // Import context hook
import { SpeakText } from '@/components/SpeakText'; // Import SpeakText
import { useTranslation } from '@/hooks/useTranslation';

// Define the props
interface MessageBubbleProps {
    message: Omit<ChatMessage, 'audience'> & { speakerName: string };
    players: FilteredGameState['players'];
}

// Message Component with Dark Mode
export function MessageBubble({ message, players }: MessageBubbleProps) {
    // Get necessary context functions and state
    const {
        t, // Keep t function from context
        reportAudioFinished, // Get the function to report audio finish
        isAudioGloballyEnabled // Get global audio state
    } = useGameContext();

    const speakerPlayer = message.speaker.type === 'player'
        ? players[message.speaker.playerId]
        : null;
    const isModerator = message.speaker.type === 'moderator';
    const imageUrl = isModerator 
        ? '/images/characters/mod.png' 
        : speakerPlayer?.imageUrl;

    // Callback for when SpeakText finishes
    const handleAudioEnd = () => {
        reportAudioFinished(message.messageId); 
    };

    return (
        <div className="flex items-start gap-3 p-2 rounded-lg transition-colors duration-200">
            {/* Speaker Image */} 
             <div className="flex-shrink-0 mt-1">
                 {imageUrl ? (
                     <Image
                         src={imageUrl}
                         alt={`Image of ${message.speakerName}`}
                         width={32}
                         height={32}
                         className="rounded-full object-cover border border-border"
                     />
                 ) : (
                     <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-[10px] font-bold">
                         {message.speakerName?.substring(0, 1) || 'P'} 
                     </div>
                 )}
             </div>
            {/* Message Content */} 
            <div className="flex-grow">
                {/* Speaker Name */}
                <span className={`font-semibold text-foreground ${isModerator ? 'text-primary' : ''}`}>
                    {isModerator ? t('ModeratorLabel', 'Moderator') : message.speakerName}:
                </span>
                {/* Conditionally render SpeakText or plain text based on isAudioGloballyEnabled */}
                {isAudioGloballyEnabled ? (
                    <SpeakText
                        voiceId={speakerPlayer?.voiceId}
                        className="mt-1"
                        autoQueue
                        onEnd={handleAudioEnd} // Pass the callback
                    >
                        {message.content}
                    </SpeakText>
                ) : (
                    <div className="mt-1">{message.content}</div>
                )}
                {/* Timestamp (moved below SpeakText) */}
                <span className="text-xs text-muted-foreground block text-right opacity-75 mt-1">
                    R{message.round} {message.phase}
                </span>
            </div>
        </div>
    );
} 
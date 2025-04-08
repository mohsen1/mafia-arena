'use client';

import Image from 'next/image';
import { FilteredGameState, ChatMessage } from "@/lib/types/game";
import { useState, useEffect, useRef } from 'react';
import { Volume, CheckCircle, Loader2 } from 'lucide-react';

// Define the props including the correctly typed players object and latestMessageId
interface MessageBubbleProps {
    message: Omit<ChatMessage, 'audience'> & { speakerName: string };
    players: FilteredGameState['players'];
    latestMessageId: string | null; // Add latestMessageId prop
}

// Message Component with Dark Mode
export function MessageBubble({ message, players, latestMessageId }: MessageBubbleProps) {
    const [audioStatus, setAudioStatus] = useState<'idle' | 'loading' | 'playing' | 'done'>('idle');
    const audioRef = useRef<HTMLAudioElement | null>(null); // Ref to manage audio object

    const speakerPlayer = message.speaker.type === 'player'
        ? players[message.speaker.playerId]
        : null;
    const isModerator = message.speaker.type === 'moderator';
    // Determine image URL: specific for moderator, player image, or null
    const imageUrl = isModerator 
        ? '/images/characters/mod.png' 
        : speakerPlayer?.imageUrl;

    const playAudio = async () => {
        // Moderator messages cannot be read aloud
        if (isModerator || audioStatus !== 'idle') return; // Prevent playing if already playing/loading or moderator

        try {
            setAudioStatus('loading');
            
            // Determine voice ID: Use assigned player voice or default
            const voiceIdToUse = speakerPlayer?.voiceId || 'default'; // Use default if no voiceId
            
            // Call ElevenLabs API to convert text to speech
            const response = await fetch('/api/text-to-speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: message.content,
                    voice: voiceIdToUse, 
                    speakerName: message.speakerName
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to generate audio: ${response.statusText}`);
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio; // Store audio object in ref
            
            setAudioStatus('playing');
            
            audio.onended = () => {
                setAudioStatus('done');
                URL.revokeObjectURL(audioUrl);
                audioRef.current = null; // Clear ref on end
            };

            // Handle potential play error (e.g., user interaction needed)
            try {
                 await audio.play();
            } catch (playError) {
                 console.error("Audio play failed:", playError);
                 setAudioStatus('idle'); // Reset status if play fails
                 URL.revokeObjectURL(audioUrl); // Clean up blob URL
                 audioRef.current = null;
            }
        } catch (error) {
            console.error('Error playing audio:', error);
            setAudioStatus('idle');
            if (audioRef.current) {
                // Attempt to clean up blob URL if it exists
                const url = audioRef.current.src;
                if (url && url.startsWith('blob:')) {
                    URL.revokeObjectURL(url);
                }
                audioRef.current = null;
            }
        }
    };

    // Effect to trigger autoplay for the latest message
    useEffect(() => {
        if (message.messageId === latestMessageId && !isModerator) {
            const timeoutId = setTimeout(() => {
                 playAudio();
             }, 500); // Small delay to allow UI to settle
            
             // Cleanup function to stop audio and clear timeout if component unmounts
             // or if latestMessageId changes before timeout/play finishes
            return () => {
                clearTimeout(timeoutId);
                if (audioRef.current) {
                    audioRef.current.pause();
                    const url = audioRef.current.src;
                    if (url && url.startsWith('blob:')) {
                        URL.revokeObjectURL(url);
                    }
                    audioRef.current = null;
                    setAudioStatus('idle'); // Reset status on cleanup
                }
            };
        }
    }, [latestMessageId, message.messageId, isModerator]); // Dependencies
    
    return (
        <div className={`flex items-start gap-3 p-2 rounded-lg transition-colors duration-200 ${isModerator ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 text-sm italic' : 'bg-white dark:bg-gray-700'}`}>
            {/* Speaker Image */}
            <div className="flex-shrink-0 mt-1">
                {imageUrl ? (
                    <Image
                        src={imageUrl} // Use the determined imageUrl
                        alt={`Image of ${message.speakerName}`}
                        width={32}
                        height={32}
                        className="rounded-full object-cover border border-gray-300 dark:border-gray-600"
                    />
                ) : (
                    // Fallback Icon (Initials or Generic)
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 text-[10px] font-bold">
                        {message.speakerName?.substring(0, 1) || 'P'} 
                    </div>
                )}
            </div>
            {/* Message Content */}
            <div className="flex-grow">
                <div className="flex justify-between items-start">
                    <div className="flex-grow">
                        <span className={`font-semibold text-gray-900 dark:text-gray-50 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>{message.speakerName}: </span>
                        <span className={`text-gray-800 dark:text-gray-200 ${isModerator ? 'text-blue-800 dark:text-blue-200' : ''}`}>{message.content}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 block text-right opacity-75">R{message.round} {message.phase}</span>
                    </div>
                    {/* Only show button for player messages */}
                    {!isModerator && (
                        <button 
                            onClick={playAudio} // Manual play still possible
                            disabled={audioStatus === 'loading' || audioStatus === 'playing'}
                            className="flex-shrink-0 ml-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150"
                            aria-label="Read message aloud"
                        >
                            {audioStatus === 'idle' && <Volume className="h-4 w-4 text-gray-500 dark:text-gray-400" />}
                            {audioStatus === 'loading' && <Loader2 className="h-4 w-4 text-blue-500 dark:text-blue-400 animate-spin" />}
                            {audioStatus === 'playing' && <Loader2 className="h-4 w-4 text-blue-500 dark:text-blue-400 animate-spin" />}
                            {audioStatus === 'done' && <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
} 
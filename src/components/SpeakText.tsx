/**
 * SpeakText component renders text as it's being spoken
 * It uses ElevenLabs API in the backend to get audio and timestamps for it's children text
 * It then plays the audio and updates the text as it's being spoken. 
 * 
 * There are two options, either words or text segments appear as they are being spoken or 
 * the whole text appears at once but in dimmed shape and as words are bing spoken, the text that 
 * is spoken will be full opacity.
 * 
 * It uses a Next.js route handler in the backend to proxy the API calls to ElevenLabs. see /api/speak
 * 
 * It works with SpokenTextContext and its provider to ensure no two components are speaking at the same time 
 * @returns 
 */
'use client';

import React, { useState, useRef, useEffect, ReactNode, useId, useCallback } from 'react';
import { useSpokenText } from '@/context/SpokenTextContext'; // Corrected path  
import { Button } from '@/components/ui/button'; // Assuming you use shadcn/ui
import { PlayIcon, PauseIcon } from 'lucide-react'; // Use lucide-react icons

// Define type for alignment data based on API response
interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface SpeakTextProps {
  children: ReactNode;
  /** Custom Voice ID from ElevenLabs */
  voiceId?: string;
  /** Optional className for styling the container */
  className?: string;
}

export function SpeakText({ children, voiceId, className }: SpeakTextProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const componentId = useId();
  const { requestToSpeak, doneSpeaking, currentlySpeakingId } = useSpokenText();

  // State for alignment data and current highlight position
  const [alignmentData, setAlignmentData] = useState<AlignmentData | null>(null);
  const [highlightedCharIndex, setHighlightedCharIndex] = useState<number>(-1);
  // State to track if playback completed successfully
  const [hasPlaybackCompleted, setHasPlaybackCompleted] = useState(false); 

  // Ensure text content is a string
  const textContent = React.Children.toArray(children).reduce<string>((acc, child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      return acc + child;
    }
    // Handle nested components if necessary, or ignore/error
    console.warn('SpeakText children should ideally be plain text.');
    return acc;
  }, '');

  const canPlay = currentlySpeakingId === null || currentlySpeakingId === componentId;
  const isCurrentlySpeakingThis = currentlySpeakingId === componentId;

  // Function to find the character index based on time
  const findCharacterIndexForTime = useCallback((currentTime: number): number => {
    if (!alignmentData) return -1;
    // Find the index of the first character whose start time is greater than the current time
    const nextCharIndex = alignmentData.character_start_times_seconds.findIndex(
      startTime => startTime > currentTime
    );
    // If no character starts after the current time, all characters are spoken
    if (nextCharIndex === -1) {
      return alignmentData.characters.length - 1;
    }
    // Otherwise, the currently spoken character is the one before the next starting character
    return Math.max(0, nextCharIndex - 1); 
  }, [alignmentData]);

  // Effect to handle audio time updates for highlighting
  useEffect(() => {
    const audio = audioRef.current;
    if (isPlaying && audio && alignmentData) {
      const handleTimeUpdate = () => {
        const index = findCharacterIndexForTime(audio.currentTime);
        setHighlightedCharIndex(index);
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);
      console.log(`[SpeakText ${componentId}] Added timeupdate listener.`);
      
      // Cleanup listener
      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);
        console.log(`[SpeakText ${componentId}] Removed timeupdate listener.`);
      };
    } else {
      // Reset index if not playing, *unless* playback has completed successfully
      if (!hasPlaybackCompleted) {
           setHighlightedCharIndex(-1);
      }
    }
  }, [isPlaying, alignmentData, findCharacterIndexForTime, componentId, hasPlaybackCompleted]);

  // Effect to cleanup audio element and context state
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        const src = audioRef.current.src;
        if (src && src.startsWith('blob:')) {
           URL.revokeObjectURL(src); // Clean up blob URL if it exists
        }
        audioRef.current.src = ''; 
        audioRef.current = null;
        console.log(`[SpeakText ${componentId}] Cleaned up audio element.`);
      }
      if (isCurrentlySpeakingThis) {
        doneSpeaking(componentId); 
      }
    };
  }, [componentId, doneSpeaking, isCurrentlySpeakingThis]);

  // Helper function to convert Base64 to Blob
  function base64ToBlob(base64: string, contentType = 'audio/mpeg'): Blob {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: contentType });
  }

  const handlePlayPause = async () => {
    console.log(`[SpeakText ${componentId}] handlePlayPause. isSpeaking: ${isCurrentlySpeakingThis}, canPlay: ${canPlay}`);
    setError(null);
    setHighlightedCharIndex(-1); // Reset reveal progress
    setAlignmentData(null); 
    setHasPlaybackCompleted(false); // Reset completion state on new action

    if (isCurrentlySpeakingThis && audioRef.current) { 
      console.log(`[SpeakText ${componentId}] Stopping current playback.`);
      audioRef.current.pause(); // Pause triggers reset via useEffect
      setIsPlaying(false);
    } else if (canPlay) { 
        console.log(`[SpeakText ${componentId}] Requesting speak permission.`);
        if (!requestToSpeak(componentId)) {
            console.log(`[SpeakText ${componentId}] Speak permission denied.`);
            return; 
        }
        console.log(`[SpeakText ${componentId}] Speak permission granted.`);
        setIsLoading(true);

        try {
            // Always request timestamps
            const requestBody = {
                 text: textContent, 
                 voice_id: voiceId, 
                 with_timestamps: true
            };
            console.log(`[SpeakText ${componentId}] Requesting audio WITH timestamps.`);

            const response = await fetch('/api/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });
            console.log(`[SpeakText ${componentId}] Fetch response status: ${response.status}`);

            if (!response.ok) {
                let errorText = `HTTP error! status: ${response.status}`;
                try { const errorData = await response.json(); errorText = errorData.error || errorText; } catch (e) { /* ignore */ }
                console.error(`[SpeakText ${componentId}] Fetch error: ${errorText}`);
                throw new Error(errorText);
            }

            // Always process JSON response (timestamps + base64 audio)
            console.log(`[SpeakText ${componentId}] Processing JSON response...`);
            const data = await response.json();
            if (!data.audio_base64 || !data.alignment) {
                    console.error(`[SpeakText ${componentId}] Invalid timestamp response structure`, data);
                throw new Error('Received invalid data structure for timestamps.');
            }
            setAlignmentData(data.alignment); 
            console.log(`[SpeakText ${componentId}] Alignment data stored. Characters: ${data.alignment.characters.length}`);
            const audioBlob = base64ToBlob(data.audio_base64);
            const audioUrl = URL.createObjectURL(audioBlob);
            console.log(`[SpeakText ${componentId}] Created blob URL from Base64 audio. Size: ${audioBlob.size}, Type: ${audioBlob.type}`);
            
            // Setup Audio Element
            if (!audioRef.current) {
                console.log(`[SpeakText ${componentId}] Creating new Audio element.`);
                audioRef.current = new Audio();
            }
            
            // Assign event handlers *before* setting src
            audioRef.current.onended = () => {
                console.log(`[SpeakText ${componentId}] Audio ended naturally.`);
                setIsPlaying(false);
                setHasPlaybackCompleted(true); // Signal completion
                // Ensure all text is marked as spoken visually if needed (or rely on hasPlaybackCompleted state)
                setHighlightedCharIndex(textContent.length - 1); 
                doneSpeaking(componentId);
                const currentAudioUrl = audioRef.current?.src;
                if (currentAudioUrl && currentAudioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(currentAudioUrl); 
                }
            };
            audioRef.current.onerror = (e) => {
                console.error(`[SpeakText ${componentId}] Audio playback error:`, e);
                setError("Audio playback failed.");
                setIsPlaying(false);
                setIsLoading(false);
                setHighlightedCharIndex(-1); // Reset index on error
                setHasPlaybackCompleted(false); // Ensure not marked as completed on error
                doneSpeaking(componentId);
                const currentAudioUrl = audioRef.current?.src;
                if (currentAudioUrl && currentAudioUrl.startsWith('blob:')) {
                        URL.revokeObjectURL(currentAudioUrl);
                }
            };
            
            const previousSrc = audioRef.current.src;
            if (previousSrc && previousSrc.startsWith('blob:')) {
                URL.revokeObjectURL(previousSrc);
                console.log(`[SpeakText ${componentId}] Revoked previous blob URL.`);
            }

            console.log(`[SpeakText ${componentId}] Setting audio src and calling play()...`);
            audioRef.current.src = audioUrl;
            await audioRef.current.play();
            setIsPlaying(true); 
            console.log(`[SpeakText ${componentId}] Playback started.`);

        } catch (err: any) {
            console.error(`[SpeakText ${componentId}] Error in handlePlayPause catch block:`, err);
            setError(err.message || 'Failed to process audio.');
            setIsPlaying(false);
            setHasPlaybackCompleted(false); // Reset completion state on error
            doneSpeaking(componentId); 
        } finally {
            console.log(`[SpeakText ${componentId}] handlePlayPause finally block. Setting isLoading=false.`);
            setIsLoading(false);
        }
    } else {
        console.log(`[SpeakText ${componentId}] Cannot play, another component might be speaking.`);
    }
  };

  // Render text based on state
  const renderTextContent = () => {
      if (hasPlaybackCompleted) {
          // After successful playback, render the full text statically
          // Split into spans to maintain structure if needed, or just return the string
          return textContent.split('').map((char, index) => (
             <span key={index}>{char === ' ' ? '\u00A0' : char}</span>
          ));
          // Alternatively: return textContent;
      } else if (alignmentData && highlightedCharIndex >= 0) {
          // During playback reveal, render chars up to the index
          const currentIndex = highlightedCharIndex;
          const charsToRender = textContent.slice(0, currentIndex + 1);
          return charsToRender.split('').map((char, index) => (
             <span key={index}>
                 {char === ' ' ? '\u00A0' : char}
             </span>
          ));
      } 
      // Render nothing initially or on error
      return null; 
  };

  return (
    <div className={` ${className || ''}`}>
       <Button
        variant="outline"
        size="icon"
        className='mr-2'
        onClick={handlePlayPause}
        disabled={isLoading || (!canPlay && !isCurrentlySpeakingThis)} 
        aria-label={isPlaying ? "Pause speaking" : "Speak text"}
       >
        {isLoading ? (
           <span className="animate-spin">⏳</span> 
        ) : isPlaying ? (
            <PauseIcon className="h-4 w-4" />
        ) : (
            <PlayIcon className="h-4 w-4" />
        )}
       </Button>

       {/* Render revealed text directly */}
        <span className="text-content">
            {renderTextContent()} 
        </span>

      {error && <p className="text-destructive text-xs ml-2">Error: {error}</p>}
    </div>
  );
}

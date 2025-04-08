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

import React, { useState, useRef, useEffect, ReactNode, useId, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useSpokenText } from '@/context/SpokenTextContext'; // Corrected path  
import { Button } from '@/components/ui/button'; // Assuming you use shadcn/ui
import { PlayIcon, PauseIcon, Loader2 } from 'lucide-react'; // Use lucide-react icons

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
  /** Callback when audio playback finishes naturally */
  onEnd?: () => void;
  /** If true, component will register itself for automatic sequential playback. */
  autoQueue?: boolean;
}

// Define the type for the imperative handle
export interface SpeakTextHandle {
  play: () => void;
}

// Wrap component with forwardRef
export const SpeakText = forwardRef<SpeakTextHandle, SpeakTextProps>(
  ({ children, voiceId, className, onEnd, autoQueue = false }, ref) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // Ref to track if playback ended successfully to prevent onerror race condition
    const playbackCompletedRef = useRef<boolean>(false);
    const componentId = useId();
    const { requestToSpeak, doneSpeaking, currentlySpeakingId, registerForAutoPlay, deregister } = useSpokenText();

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
          if (!audioRef.current) return; // Guard against race condition on unmount
          const index = findCharacterIndexForTime(audioRef.current.currentTime);
          setHighlightedCharIndex(index);
        };

        audio.addEventListener('timeupdate', handleTimeUpdate);
        console.log(`[SpeakText ${componentId}] Added timeupdate listener.`);
        
        // Cleanup listener
        return () => {
          // Check if audio still exists before removing listener
          audio?.removeEventListener('timeupdate', handleTimeUpdate);
          console.log(`[SpeakText ${componentId}] Removed timeupdate listener.`);
        };
      } else {
        // Reset index if not playing, *unless* playback has completed successfully
        if (!hasPlaybackCompleted) {
             setHighlightedCharIndex(-1);
        }
      }
    }, [isPlaying, alignmentData, findCharacterIndexForTime, componentId, hasPlaybackCompleted]);

    // Effect to register for auto-play queue on mount if autoQueue is true
    useEffect(() => {
        if (autoQueue) {
            console.log(`[SpeakText ${componentId}] Registering for auto-play queue.`);
            registerForAutoPlay(componentId);
        }
        // No cleanup needed for registration
    }, [autoQueue, registerForAutoPlay, componentId]); // Rerun if props/identity change

    const handlePlayPause = useCallback(async (triggeredExternally = false) => {
        const currentAudio = audioRef.current;

        if (!triggeredExternally && isPlaying && currentAudio) {
            console.log(`[SpeakText ${componentId}] Pausing current playback via button.`);
            currentAudio.pause();
            // Note: The onpause handler should set isPlaying to false and call doneSpeaking
            return; // Exit early, let onpause handle state changes
        }

        console.log(`[SpeakText ${componentId}] handlePlayPause called. isPlaying (state): ${isPlaying}, canPlay: ${canPlay}, triggeredExternally: ${triggeredExternally}`);
        setError(null);
        // Reset completion flag on new play attempt
        playbackCompletedRef.current = false;
        setHighlightedCharIndex(-1);
        setAlignmentData(null);
        setHasPlaybackCompleted(false);

        // Request permission ONLY if we are not currently the speaker
        if (currentlySpeakingId !== componentId) {
             console.log(`[SpeakText ${componentId}] Not current speaker. Attempting to acquire.`);
             if (canPlay) {
                 console.log(`[SpeakText ${componentId}] Requesting speak permission from context.`);
                 if (!requestToSpeak(componentId)) {
                     console.log(`[SpeakText ${componentId}] Speak permission denied by context.`);
                     setError("Another audio is currently playing.");
                     setIsLoading(false); // Ensure loading is reset
                     return; // Don't proceed if permission denied
                 }
                 console.log(`[SpeakText ${componentId}] Speak permission granted by context.`);
             } else {
                 console.log(`[SpeakText ${componentId}] Cannot play, context reports busy.`);
                 setError("Another audio is currently playing.");
                 setIsLoading(false); // Ensure loading is reset
                 return; // Don't proceed if context is busy
             }
        } else {
             console.log(`[SpeakText ${componentId}] Already hold speaking permission, proceeding.`);
        }

        setIsLoading(true);
        try {
            if (currentAudio && currentAudio.paused && currentAudio.src && !triggeredExternally) {
                console.log(`[SpeakText ${componentId}] Resuming paused audio.`);
                playbackCompletedRef.current = false; // Reset flag on resume too
                await currentAudio.play();
                setIsPlaying(true); // Explicitly set playing state on resume
                console.log(`[SpeakText ${componentId}] Resumed playback successfully.`);
            } else {
                // --- Fetch new audio or play from beginning ---
                console.log(`[SpeakText ${componentId}] Requesting new audio WITH timestamps.`);
                const requestBody = {
                    text: textContent,
                    voice_id: voiceId,
                    with_timestamps: true
                };
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

                const data = await response.json();
                if (!data.audio_base64 || !data.alignment) {
                    console.error(`[SpeakText ${componentId}] Invalid timestamp response structure`, data);
                    throw new Error('Received invalid data structure for timestamps.');
                }
                setAlignmentData(data.alignment);
                console.log(`[SpeakText ${componentId}] Alignment data stored. Chars: ${data.alignment.characters.length}`);
                const audioBlob = base64ToBlob(data.audio_base64);
                const audioUrl = URL.createObjectURL(audioBlob);
                console.log(`[SpeakText ${componentId}] Created blob URL. Size: ${audioBlob.size}`);

                let audioToPlay = audioRef.current; // Use existing ref if available

                // Create or reuse Audio Element
                if (!audioToPlay) {
                    console.log(`[SpeakText ${componentId}] Creating new Audio element.`);
                    audioToPlay = new Audio();
                    audioRef.current = audioToPlay; // Assign to ref immediately
                    // --- Assign event handlers ONCE ---
                    audioToPlay.onended = () => {
                        // Success path
                        if (!audioRef.current || playbackCompletedRef.current) return; // Guard against double calls
                        console.log(`[SpeakText ${componentId}] Audio ended naturally.`);
                        playbackCompletedRef.current = true; // Set flag *first*
                        
                        setIsPlaying(false);
                        setHasPlaybackCompleted(true);
                        setHighlightedCharIndex(textContent.length - 1); 
                        doneSpeaking(componentId);
                        console.log(`[SpeakText ${componentId}] Called doneSpeaking via onended.`);
                        onEnd?.(); 
                        
                        // Delayed cleanup
                        setTimeout(() => {
                            if (audioRef.current) { // Check ref hasn't been nulled by unmount
                                const endedAudioUrl = audioRef.current.src; 
                                if (endedAudioUrl && endedAudioUrl.startsWith('blob:')) {
                                    URL.revokeObjectURL(endedAudioUrl);
                                    console.log(`[SpeakText ${componentId}] Revoked blob URL on ended (delayed).`);
                                }
                                // Clear src only after potential revoke
                                audioRef.current.src = '';
                            }
                        }, 0); 
                    };
                    audioToPlay.onerror = (e) => {
                        // Failure path - Check flag first!
                         if (!audioRef.current || playbackCompletedRef.current) {
                            console.warn(`[SpeakText ${componentId}] Ignoring error event because playback already completed successfully.`);
                            return; 
                         }
                        console.error(`[SpeakText ${componentId}] Audio playback error event:`, e);
                        setError("Audio playback failed.");
                        setIsPlaying(false);
                        setIsLoading(false); 
                        setHighlightedCharIndex(-1); 
                        setHasPlaybackCompleted(false);
                        // Release the speaking slot on error too
                        doneSpeaking(componentId);
                        console.log(`[SpeakText ${componentId}] Called doneSpeaking via onerror.`);
                        
                         // Perform cleanup *after* state updates
                        const errorAudioUrl = audioRef.current.src; 
                        if (errorAudioUrl && errorAudioUrl.startsWith('blob:')) {
                            URL.revokeObjectURL(errorAudioUrl);
                            console.log(`[SpeakText ${componentId}] Revoked blob URL on error.`);
                        }
                        // Clear src only after potential revoke
                        if (audioRef.current) audioRef.current.src = '';
                    };
                    audioToPlay.onpause = () => {
                        // Check ref existence and isPlaying state *at the time of pause*
                        // Use a temporary variable for isPlaying check to avoid closure issues
                         const wasPlaying = isPlaying;
                         console.log(`[SpeakText ${componentId}] Audio paused event. isPlaying state was: ${wasPlaying}`);
                         // Only update state and context if it was genuinely playing before pause
                         if (wasPlaying) {
                             setIsPlaying(false);
                            // Avoid releasing context if pause is due to natural end or error
                            // Checking audioRef.current.ended/error state might be needed if complex races occur
                             if (audioRef.current && !audioRef.current.ended) {
                                 doneSpeaking(componentId);
                                 console.log(`[SpeakText ${componentId}] Released speaking slot via onpause (manual pause).`);
                             } else {
                                 console.log(`[SpeakText ${componentId}] Pause event likely due to end/error, skipping doneSpeaking.`);
                             }
                         }
                    };
                }

                // Clean up previous blob URL if it exists and differs from the new one
                const previousSrc = audioToPlay.src;
                if (previousSrc && previousSrc.startsWith('blob:') && previousSrc !== audioUrl) {
                    URL.revokeObjectURL(previousSrc);
                    console.log(`[SpeakText ${componentId}] Revoked previous blob URL.`);
                }

                console.log(`[SpeakText ${componentId}] Setting audio src and calling play()...`);
                playbackCompletedRef.current = false; // Ensure reset before play
                audioToPlay.src = audioUrl;
                audioToPlay.currentTime = 0; // Ensure playback starts from beginning
                await audioToPlay.play();
                setIsPlaying(true); // Set state after play() is invoked
                console.log(`[SpeakText ${componentId}] Playback initiated.`);
            }

        } catch (err: any) {
            console.error(`[SpeakText ${componentId}] Error in handlePlayPause catch block:`, err);
            setError(err.message || 'Failed to process audio.');
            setIsPlaying(false);
            setHasPlaybackCompleted(false);
             // Ensure context is released on error only if we successfully acquired it
             if (currentlySpeakingId === componentId) {
                  doneSpeaking(componentId);
                  console.log(`[SpeakText ${componentId}] Released speaking slot due to error after acquiring.`);
             }
        } finally {
            // Ensure isLoading is always reset, regardless of success or failure
            console.log(`[SpeakText ${componentId}] handlePlayPause finally block. Setting isLoading=false.`);
            setIsLoading(false);
        }

    }, [
        componentId,
        isPlaying, // Need isPlaying state to determine pause action
        canPlay,
        currentlySpeakingId,
        requestToSpeak,
        doneSpeaking,
        textContent,
        voiceId,
        onEnd // Added onEnd dependency
    ]);

    // Effect to trigger playback when this component becomes the currentlySpeakingId
    useEffect(() => {
        console.log(`[SpeakText ${componentId}] Current Speaker Check: currentlySpeakingId=${currentlySpeakingId}`);
        if (currentlySpeakingId === componentId && !isLoading && !isPlaying && !audioRef.current?.src) {
             // Check !audioRef.current?.src to prevent replay if paused/errored
            console.log(`[SpeakText ${componentId}] Current Speaker Effect Triggered: Calling handlePlayPause(true).`);
            handlePlayPause(true); // Trigger playback internally
        }
    }, [currentlySpeakingId, componentId, isLoading, isPlaying, handlePlayPause]);

    // Effect to cleanup audio element, context state, and registration
    useEffect(() => {
        const audio = audioRef.current; // Capture ref value at effect setup
        const currentId = componentId; // Capture componentId
        // Capture speaking state AT RENDER TIME for cleanup logic
        const wasSpeakingAtRender = currentlySpeakingId === currentId;
        console.log(`[SpeakText ${currentId}] Cleanup Effect Setup. wasSpeakingAtRender: ${wasSpeakingAtRender}`);

        return () => {
            console.log(`[SpeakText ${currentId}] Cleanup Effect Run. wasSpeakingAtRender: ${wasSpeakingAtRender}`);
            // Deregister from the queue regardless
            deregister(currentId);

            if (audio) {
                audio.pause();
                const src = audio.src;
                if (src && src.startsWith('blob:')) {
                   URL.revokeObjectURL(src);
                }
                audio.onended = null;
                audio.onerror = null;
                audio.onpause = null;
                audio.ontimeupdate = null;
                audio.src = '';
                audioRef.current = null;
                console.log(`[SpeakText ${currentId}] Cleaned up audio element on unmount.`);
            } else {
                 console.log(`[SpeakText ${currentId}] Audio element already null on unmount cleanup.`);
            }
            // Only call doneSpeaking if this component WAS the speaker when it rendered
            if (wasSpeakingAtRender) {
                 console.log(`[SpeakText ${currentId}] Calling doneSpeaking on unmount because it was the active speaker.`);
                 doneSpeaking(currentId);
            } else {
                 console.log(`[SpeakText ${currentId}] Skipping doneSpeaking on unmount because it was not the active speaker.`);
            }
        };
    // Update dependencies for cleanup
    }, [componentId, currentlySpeakingId, doneSpeaking, deregister]);

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

    // Render text based on state
    const renderTextContent = () => {
        // Always render full text if playback completed successfully OR if alignment data is missing
        if (hasPlaybackCompleted || (!isLoading && !isPlaying && !alignmentData)) {
            return textContent.split('').map((char, index) => (
                <span key={index}>{char === ' ' ? ' ' : char}</span>
            ));
        } else if (alignmentData && highlightedCharIndex >= 0) {
            // During playback reveal, render chars up to the index
            const charsToRender = textContent.slice(0, highlightedCharIndex + 1);
            return charsToRender.split('').map((char, index) => (
                <span key={index}>
                    {char === ' ' ? ' ' : char}
                </span>
            ));
        }
        // Render nothing only while actively loading or before first play?
        // Let's render the full text dimmed initially instead.
        // Or decide based on props? For now, null if nothing else matches.
        return null;
    };

    // Expose the play function via ref (still potentially useful for direct control)
    useImperativeHandle(ref, () => ({
        play: () => handlePlayPause()
    }));

    return (
      <div className={`inline-flex items-center ${className || ''}`}>
        {/* Button calls handlePlayPause, letting it decide resume/pause/play */}
        <Button
          variant="outline"
          size="icon"
          className='mr-2 flex-shrink-0' // Prevent button shrinking
          onClick={() => handlePlayPause()} // Let the handler figure out the action
          // Disable button if loading, or if someone else is talking (and it's not this component)
          disabled={isLoading || (!canPlay && !isCurrentlySpeakingThis)}
          aria-label={isPlaying ? "Pause speaking" : "Speak text"}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <PauseIcon className="h-4 w-4" />
          ) : (
            <PlayIcon className="h-4 w-4" />
          )}
        </Button>

        {/* Render revealed text directly */}
        <span className="text-content min-h-[1em]"> {/* Add min-height to prevent layout shifts */}
          {renderTextContent()}
        </span>

        {error && <p className="text-destructive text-xs ml-2 self-center">Error: {error}</p>}
      </div>
    );
  }
);

// Add display name for better debugging in React DevTools
SpeakText.displayName = 'SpeakText';

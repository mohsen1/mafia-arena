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

import React, {
  useState,
  useRef,
  useEffect,
  useId,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import type { ReactNode } from 'react';
import { useSpokenText } from '@/context/SpokenTextContext';

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
  /** If true, audio playback will be disabled. */
  disabled?: boolean;
}

// Define the type for the imperative handle
export interface SpeakTextHandle {
  play: () => void;
}

// Wrap component with forwardRef
export const SpeakText = forwardRef<SpeakTextHandle, SpeakTextProps>(
  (
    {
      children,
      voiceId,
      className,
      onEnd,
      autoQueue = false,
      disabled = false,
    },
    ref
  ) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // Ref to track if playback ended successfully to prevent onerror race condition
    const playbackCompletedRef = useRef<boolean>(false);
    const componentId = useId();
    const {
      requestToSpeak,
      doneSpeaking,
      currentlySpeakingId,
      registerForAutoPlay,
      isAudioGloballyEnabled,
    } = useSpokenText();

    // State for alignment data and current highlight position
    const [alignmentData, setAlignmentData] = useState<AlignmentData | null>(
      null
    );
    const [highlightedCharIndex, setHighlightedCharIndex] =
      useState<number>(-1);
    // State to track if playback completed successfully
    const [hasPlaybackCompleted, setHasPlaybackCompleted] = useState(false);

    // Ensure text content is a string
    const textContent = React.Children.toArray(children).reduce<string>(
      (acc, child) => {
        if (typeof child === 'string' || typeof child === 'number') {
          return acc + child;
        }
        // Handle nested components if necessary, or ignore/error
        console.warn('SpeakText children should ideally be plain text.');
        return acc;
      },
      ''
    );

    // Check if this component *can* play (permission + global setting + not disabled)
    const canPlay =
      !disabled &&
      isAudioGloballyEnabled &&
      (currentlySpeakingId === null || currentlySpeakingId === componentId);
    // const isCurrentlySpeakingThis = currentlySpeakingId === componentId;

    // Function to find the character index based on time
    const findCharacterIndexForTime = useCallback(
      (currentTime: number): number => {
        if (!alignmentData) return -1;
        // Find the index of the first character whose start time is greater than the current time
        const nextCharIndex =
          alignmentData.character_start_times_seconds.findIndex(
            (startTime) => startTime > currentTime
          );
        // If no character starts after the current time, all characters are spoken
        if (nextCharIndex === -1) {
          return alignmentData.characters.length - 1;
        }
        // Otherwise, the currently spoken character is the one before the next starting character
        return Math.max(0, nextCharIndex - 1);
      },
      [alignmentData]
    );

    // Effect to handle audio time updates for highlighting
    useEffect(() => {
      const audio = audioRef.current;
      if (!isPlaying || !audio || !alignmentData) {
        // Reset index if not playing, *unless* playback has completed successfully
        if (!hasPlaybackCompleted) {
          setHighlightedCharIndex(-1);
        }
        return; // Exit early if not playing or required data is missing
      }

      const handleTimeUpdate = () => {
        if (!audioRef.current) return; // Guard against race condition on unmount
        const index = findCharacterIndexForTime(audioRef.current.currentTime);
        setHighlightedCharIndex(index);
      };

      audio.addEventListener('timeupdate', handleTimeUpdate);

      // Cleanup listener
      return () => {
        // Check if audio still exists before removing listener
        audio?.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }, [
      isPlaying,
      alignmentData,
      findCharacterIndexForTime,
      hasPlaybackCompleted,
    ]);

    // Effect to register for auto-play queue
    useEffect(() => {
      // Only register if globally enabled and autoQueue prop is true and not disabled
      if (!disabled && isAudioGloballyEnabled && autoQueue) {
        registerForAutoPlay(componentId);
      }
    }, [
      autoQueue,
      registerForAutoPlay,
      componentId,
      isAudioGloballyEnabled,
      disabled,
    ]);

    const handlePlayPause = useCallback(
      async (triggeredExternally = false) => {
        // Prevent any action if audio is globally disabled OR component is disabled
        if (disabled || !isAudioGloballyEnabled) {
          return;
        }

        const currentAudio = audioRef.current;

        if (!triggeredExternally && isPlaying && currentAudio) {
          currentAudio.pause();
          // Note: The onpause handler should set isPlaying to false and call doneSpeaking
          return; // Exit early, let onpause handle state changes
        }

        playbackCompletedRef.current = false;
        setHighlightedCharIndex(-1);
        setAlignmentData(null);
        setHasPlaybackCompleted(false);

        // Request permission ONLY if we are not currently the speaker
        if (currentlySpeakingId !== componentId) {
          if (canPlay) {
            if (!requestToSpeak(componentId)) {
              setIsLoading(false); // Ensure loading is reset
              return; // Don't proceed if permission denied
            }
          } else {
            setIsLoading(false); // Ensure loading is reset
            return; // Don't proceed if context is busy
          }
        } else {
          // Proceed without acquiring permission if already speaking
        }

        setIsLoading(true);
        try {
          if (
            currentAudio?.paused && // Optional chaining
            currentAudio?.src && // Optional chaining
            !triggeredExternally
          ) {
            playbackCompletedRef.current = false; // Reset flag on resume too
            await currentAudio.play();
            setIsPlaying(true); // Explicitly set playing state on resume
          } else {
            // --- Fetch new audio or play from beginning ---
            const requestBody = {
              text: textContent,
              voice_id: voiceId,
              with_timestamps: true,
            };
            const response = await fetch('/api/speak', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
              let errorText = `HTTP error! status: ${response.status}`;
              try {
                const errorData = await response.json();
                errorText = errorData.error || errorText;
              } catch {
                /* ignore */
              }
              console.error(
                `[SpeakText ${componentId}] Fetch error: ${errorText}`
              );
              throw new Error(errorText);
            }

            const data = await response.json();
            if (!data.audio_base64 || !data.alignment) {
              console.error(
                `[SpeakText ${componentId}] Invalid timestamp response structure`,
                data
              );
              throw new Error(
                'Received invalid data structure for timestamps.'
              );
            }
            setAlignmentData(data.alignment);
            const audioBlob = base64ToBlob(data.audio_base64);
            const audioUrl = URL.createObjectURL(audioBlob);

            let audioToPlay = audioRef.current; // Use existing ref if available

            // Create or reuse Audio Element
            if (!audioToPlay) {
              audioToPlay = new Audio();
              audioRef.current = audioToPlay; // Assign to ref immediately
              // --- Assign event handlers ONCE ---
              audioToPlay.onended = () => {
                if (!audioRef.current || playbackCompletedRef.current) return;
                playbackCompletedRef.current = true;
                setIsPlaying(false);
                setHasPlaybackCompleted(true);
                setHighlightedCharIndex(textContent.length - 1);

                // Call the onEnd prop passed from the parent FIRST
                onEnd?.();
                doneSpeaking(componentId);

                // Delayed cleanup
                setTimeout(() => {
                  if (audioRef.current) {
                    const endedAudioUrl = audioRef.current.src;
                    if (endedAudioUrl?.startsWith('blob:')) {
                      // Optional chaining
                      URL.revokeObjectURL(endedAudioUrl);
                    }
                    // Clear src only after potential revoke
                    audioRef.current.src = '';
                  }
                }, 0);
              };
              audioToPlay.onerror = (event) => {
                // Ensure 'e' is renamed to 'event'
                // Failure path - Check flag first!
                if (!audioRef.current || playbackCompletedRef.current) {
                  return;
                }
                console.error(
                  `[SpeakText ${componentId}] Audio playback error event:`,
                  event
                );
                setIsPlaying(false);
                setIsLoading(false);
                setHighlightedCharIndex(-1);
                setHasPlaybackCompleted(false);
                doneSpeaking(componentId);
              };
              audioToPlay.onpause = () => {
                // Check ref existence and isPlaying state *at the time of pause*
                // Use a temporary variable for isPlaying check to avoid closure issues
                const wasPlaying = isPlaying;
                if (wasPlaying) {
                  setIsPlaying(false);
                  // Avoid releasing context if pause is due to natural end or error
                  // Checking audioRef.current.ended/error state might be needed if complex races occur
                  if (audioRef.current && !audioRef.current.ended) {
                    doneSpeaking(componentId);
                  } else {
                    // If playback has ended naturally, no need to release context
                  }
                }
              };
            }

            // Clean up previous blob URL if it exists and differs from the new one
            const previousSrc = audioToPlay?.src; // Optional chaining
            if (
              previousSrc?.startsWith('blob:') && // Optional chaining
              previousSrc !== audioUrl
            ) {
              URL.revokeObjectURL(previousSrc);
            }

            playbackCompletedRef.current = false; // Ensure reset before play
            audioToPlay.src = audioUrl;
            audioToPlay.currentTime = 0; // Ensure playback starts from beginning
            await audioToPlay.play();
            setIsPlaying(true); // Set state after play() is invoked
          }
        } catch (err) {
          // Use unknown type and check within block
          console.error(
            `[SpeakText ${componentId}] Error in handlePlayPause catch block:`,
            err
          );
          setIsPlaying(false);
          setHasPlaybackCompleted(false);
          // Ensure context is released on error only if we successfully acquired it
          if (currentlySpeakingId === componentId) {
            doneSpeaking(componentId);
          }
        } finally {
          // Ensure isLoading is always reset, regardless of success or failure
          setIsLoading(false);
        }
      },
      [
        componentId,
        isPlaying, // Need isPlaying state to determine pause action
        canPlay,
        currentlySpeakingId,
        requestToSpeak,
        doneSpeaking,
        textContent,
        voiceId,
        onEnd,
        isAudioGloballyEnabled, // Add dependency
        disabled,
      ]
    );

    // Effect to trigger playback when this component becomes the currentlySpeakingId
    useEffect(() => {
      if (
        isAudioGloballyEnabled &&
        currentlySpeakingId === componentId &&
        !isLoading &&
        !isPlaying &&
        !audioRef.current?.src
      ) {
        handlePlayPause(true); // Trigger playback internally
      }
    }, [
      currentlySpeakingId,
      componentId,
      isLoading,
      isPlaying,
      handlePlayPause,
      isAudioGloballyEnabled,
    ]); // Add dependency

    // Effect to cleanup audio element, context state
    useEffect(() => {
      const audio = audioRef.current;
      const currentId = componentId;
      const wasSpeakingAtRender = currentlySpeakingId === currentId;

      return () => {
        if (audio) {
          audio.pause();
          const src = audio.src;
          if (src?.startsWith('blob:')) {
            // Optional chaining
            URL.revokeObjectURL(src);
          }
          audio.onended = null;
          audio.onerror = null;
          audio.onpause = null;
          audio.ontimeupdate = null;
          audio.src = '';
          audioRef.current = null;
        }
        // Only call doneSpeaking if this component WAS the speaker when it rendered
        if (wasSpeakingAtRender) {
          doneSpeaking(currentId);
        }
      };
      // Remove deregister from dependencies
    }, [componentId, currentlySpeakingId, doneSpeaking]);

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
      if (
        hasPlaybackCompleted ||
        (!isLoading && !isPlaying && !alignmentData)
      ) {
        return textContent
          .split('')
          .map((char, index) => <span key={index + char}>{char}</span>);
      }
      if (alignmentData && highlightedCharIndex >= 0) {
        // During playback reveal, render chars up to the index
        const charsToRender = textContent.slice(0, highlightedCharIndex + 1);
        return charsToRender
          .split('')
          .map((char, index) => <span key={index + char}>{char}</span>);
      }
      // Render nothing only while actively loading or before first play?
      // Let's render the full text dimmed initially instead.
      // Or decide based on props? For now, null if nothing else matches.
      return null;
    };

    // Expose the play function via ref (still potentially useful for direct control)
    useImperativeHandle(ref, () => ({
      play: () => handlePlayPause(),
    }));

    return (
      <div className={className}>
        {/* Render revealed text directly */}
        <span className="text-foreground inline leading-normal tracking-normal min-h-[1em]">
          {' '}
          {/* Apply Tailwind classes directly */}
          {renderTextContent()}
        </span>
      </div>
    );
  }
);

// Add display name for better debugging in React DevTools
SpeakText.displayName = 'SpeakText';

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

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useSpokenText } from '@/context/SpokenTextContext';
import { useGameContext } from '@/context/GameContext';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SpeakTextProps {
  text: string;
  voiceId?: string;
  autoPlay?: boolean;
  onComplete?: () => void;
  className?: string;
  showControls?: boolean;
}

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

export function SpeakText({
  text,
  voiceId = '21m00Tcm4TlvDq8ikWAM', // Default ElevenLabs voice
  autoPlay = true,
  onComplete,
  className = '',
  showControls = false,
}: SpeakTextProps) {
  const { isAudioGloballyEnabled, currentlySpeakingId, requestToSpeak, doneSpeaking } =
    useSpokenText();
  
  // Make GameContext optional for voice testing
  let gameContext;
  try {
    gameContext = useGameContext();
  } catch (error) {
    console.log('[SpeakText] GameContext not available, running in standalone mode');
    gameContext = null;
  }
  
  const reportAudioFinished = gameContext?.reportAudioFinished || (() => {});
  const registerStopAudio = gameContext?.registerStopAudio || (() => {});
  const unregisterStopAudio = gameContext?.unregisterStopAudio || (() => {});
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioIdRef = useRef<string>(
    `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  const wordTimingsRef = useRef<Array<{ word: string; start: number; end: number }>>([]);
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const cleanupCalledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const timestamp = () => new Date().toISOString().split('T')[1].split('.')[0];
  
  console.log(`[SpeakText] ${timestamp()} Component render:`, {
    audioId: audioIdRef.current,
    text: text.substring(0, 50) + '...',
    voiceId,
    autoPlay,
    isAudioGloballyEnabled,
    currentlySpeakingId,
    hasStarted: hasStartedRef.current,
    isMounted: isMountedRef.current,
    isPlaying,
  });

  // Memoize words to prevent recalculation
  const words = useMemo(() => text.split(' '), [text]);

  // Track mount/unmount
  useEffect(() => {
    console.log(`[SpeakText] ${timestamp()} 🏗️ Component MOUNTED:`, {
      audioId: audioIdRef.current,
      text: text.substring(0, 50) + '...',
      voiceId,
      autoPlay,
      isAudioGloballyEnabled,
      currentlySpeakingId,
    });
    
    isMountedRef.current = true;
    cleanupCalledRef.current = false;

    return () => {
      console.log(`[SpeakText] ${timestamp()} 🧹 Component UNMOUNTING:`, {
        audioId: audioIdRef.current,
        isPlaying,
        hasStarted: hasStartedRef.current,
        cleanupCalled: cleanupCalledRef.current,
        currentlySpeakingId,
      });
      
      isMountedRef.current = false;
      
      if (!cleanupCalledRef.current) {
        cleanupCalledRef.current = true;
        console.log(`[SpeakText] ${timestamp()} 🧽 CLEANUP starting for:`, audioIdRef.current);
        
        if (audioRef.current) {
          console.log(`[SpeakText] ${timestamp()} ⏹️ Pausing and removing audio element`);
          audioRef.current.pause();
          audioRef.current.src = '';
          audioRef.current = null;
        }
        
        // Always clear the speaking ID on unmount
        if (currentlySpeakingId === audioIdRef.current) {
          console.log(`[SpeakText] ${timestamp()} 🗑️ CLEARING speaking ID on unmount:`, audioIdRef.current);
          doneSpeaking(audioIdRef.current);
          unregisterStopAudio();
        }
      }
    };
  }, []);

  // Update logging for effect dependencies
  useEffect(() => {
    console.log(`[SpeakText] ${timestamp()} 📡 Main effect triggered:`, {
      audioId: audioIdRef.current,
      autoPlay,
      hasStarted: hasStartedRef.current,
      isAudioGloballyEnabled,
      isMounted: isMountedRef.current,
      currentlySpeakingId,
    });

    if (autoPlay && !hasStartedRef.current && isAudioGloballyEnabled && isMountedRef.current) {
      console.log(`[SpeakText] ${timestamp()} 🎯 AUTO-PLAYING audio on mount for:`, audioIdRef.current);
      hasStartedRef.current = true;
      handleSpeak();
    }
  }, [autoPlay, isAudioGloballyEnabled]);

  const handleSpeak = async () => {
    console.log(`[SpeakText] ${timestamp()} 🗣️ handleSpeak CALLED:`, {
      audioId: audioIdRef.current,
      text: text.substring(0, 50) + '...',
      voiceId,
      currentlySpeakingId,
      isMounted: isMountedRef.current,
      isAudioGloballyEnabled,
    });

    if (!isMountedRef.current) {
      console.log(`[SpeakText] ${timestamp()} ❌ Component unmounted, aborting speak`);
      return;
    }

    if (!isAudioGloballyEnabled) {
      console.log(`[SpeakText] ${timestamp()} ❌ Audio globally disabled`);
      setError('Audio is globally disabled');
      return;
    }

    console.log(`[SpeakText] ${timestamp()} 🔓 REQUESTING permission to speak...`);
    const canSpeak = requestToSpeak(audioIdRef.current);
    if (!canSpeak) {
      console.log(`[SpeakText] ${timestamp()} 🚫 DENIED - Cannot speak, another audio is playing:`, {
        requestingId: audioIdRef.current,
        blockingId: currentlySpeakingId,
      });
      setError('Another audio is playing');
      return;
    }

    console.log(`[SpeakText] ${timestamp()} ✅ PERMISSION GRANTED, proceeding with speak`);
    setError(null);

    try {
      console.log('[SpeakText] Fetching audio from API...');
      const response = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId }),
        signal: abortControllerRef.current?.signal,
      });

      if (!isMountedRef.current) {
        console.log('[SpeakText] Component unmounted during fetch, aborting');
        doneSpeaking(audioIdRef.current);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SpeakText] API error:', response.status, errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);

      if (!isMountedRef.current) {
        URL.revokeObjectURL(audioUrl);
        doneSpeaking(audioIdRef.current);
        return;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      // Set up audio event handlers
      audio.addEventListener('loadedmetadata', () => {
        console.log(`[SpeakText] ${timestamp()} 📂 Audio loaded:`, {
          audioId: audioIdRef.current,
          duration: audio.duration,
        });
      });

      audio.addEventListener('play', () => {
        console.log(`[SpeakText] ${timestamp()} ▶️ Audio STARTED playing:`, {
          audioId: audioIdRef.current,
          duration: audio.duration,
        });
        setIsPlaying(true);
        // Register this audio with GameContext for auto-run coordination
        registerStopAudio(audioIdRef.current, () => {
          console.log(`[SpeakText] ${timestamp()} ⏹️ Stop callback called from GameContext for:`, audioIdRef.current);
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          }
          setIsPlaying(false);
          doneSpeaking(audioIdRef.current);
        });
      });

      audio.addEventListener('pause', () => {
        console.log(`[SpeakText] ${timestamp()} ⏸️ Audio PAUSED:`, {
          audioId: audioIdRef.current,
          currentTime: audio.currentTime,
        });
        setIsPlaying(false);
      });

      audio.addEventListener('ended', () => {
        console.log(`[SpeakText] ${timestamp()} 🏁 Audio ENDED naturally:`, {
          audioId: audioIdRef.current,
          duration: audio.duration,
        });
        setIsPlaying(false);
        // Clear from both contexts
        doneSpeaking(audioIdRef.current);
        unregisterStopAudio();
        // Report to GameContext for auto-run coordination
        reportAudioFinished(audioIdRef.current);
        onComplete?.();
      });

      audio.addEventListener('error', (e) => {
        console.error('[SpeakText] Audio error event:', e);
        const audioError = audioRef.current?.error;
        let errorMessage = 'Audio playback error';
        
        if (audioError) {
          // MediaError codes: 1=ABORTED, 2=NETWORK, 3=DECODE, 4=SRC_NOT_SUPPORTED
          switch (audioError.code) {
            case 1:
              errorMessage = 'Audio playback aborted';
              break;
            case 2:
              errorMessage = 'Network error while loading audio';
              break;
            case 3:
              errorMessage = 'Audio decoding error';
              break;
            case 4:
              errorMessage = 'Audio format not supported';
              break;
          }
          console.error('[SpeakText] MediaError:', audioError.code, audioError.message);
        }
        
        setError(errorMessage);
        setIsPlaying(false);
        // Clear from both contexts on error
        doneSpeaking(audioIdRef.current);
        unregisterStopAudio();
        // Report error completion to GameContext
        reportAudioFinished(audioIdRef.current);
      });

      // Play the audio
      console.log('[SpeakText] Attempting to play audio...');
      await audio.play();
      console.log('[SpeakText] Audio playback started successfully');
    } catch (error) {
      console.error('[SpeakText] Error in handleSpeak:', error);
      
      // Immediately clear the speaking ID on any error
      doneSpeaking(audioIdRef.current);
      unregisterStopAudio();
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log('[SpeakText] Fetch aborted');
          return;
        }
        setError(error.message);
      } else {
        setError('Failed to generate speech');
      }
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    console.log('[SpeakText] handleStop called');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentWordIndex(-1);
    doneSpeaking(audioIdRef.current);
    unregisterStopAudio();
  };

  if (!isAudioGloballyEnabled) {
    console.log('[SpeakText] Audio globally disabled, rendering text only');
    return <span className={className}>{text}</span>;
  }

  return (
    <div className={`speak-text-container ${className}`}>
      <div className="text-content">
        {words.map((word, index) => (
          <span
            key={index}
            className={`word ${
              index === currentWordIndex ? 'highlighted font-bold text-primary' : ''
            }`}
          >
            {word}{' '}
          </span>
        ))}
      </div>
      
      {showControls && (
        <div className="controls mt-2">
          {!isPlaying ? (
            <Button
              onClick={handleSpeak}
              size="sm"
              variant="ghost"
              className="gap-2"
              disabled={currentlySpeakingId !== null && currentlySpeakingId !== audioIdRef.current}
            >
              <Volume2 className="h-4 w-4" />
              Speak
            </Button>
          ) : (
            <Button
              onClick={handleStop}
              size="sm"
              variant="ghost"
              className="gap-2"
            >
              <VolumeX className="h-4 w-4" />
              Stop
            </Button>
          )}
        </div>
      )}
      
      {error && (
        <div className="text-sm text-destructive mt-1">
          {error}
        </div>
      )}
    </div>
  );
}

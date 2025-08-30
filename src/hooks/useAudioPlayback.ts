import { useRef, useCallback, useEffect } from 'react';
import { useSpokenText } from '@/context/SpokenTextContext';
import { useGameContext } from '@/context/GameContext';
import { addAudioBreadcrumb } from '@/components/AudioDebugOverlay';

interface UseAudioPlaybackOptions {
  messageId?: string;
  autoPlay?: boolean;
  onComplete?: () => void;
}

interface AudioState {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  duration: number;
  currentTime: number;
}

export function useAudioPlayback(options: UseAudioPlaybackOptions = {}) {
  const { messageId, autoPlay = true, onComplete } = options;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef(true);
  const hasRegisteredRef = useRef(false);

  const {
    requestPermissionToSpeak,
    doneSpeaking,
    markAsPlaying,
  } = useSpokenText();
  const gameContext = useGameContext();
  const { registerAudioPlayback, reportAudioFinished: reportAudioToGame } =
    gameContext;

  const stateRef = useRef<AudioState>({
    isPlaying: false,
    isLoading: false,
    error: null,
    duration: 0,
    currentTime: 0,
  });

  const updateState = useCallback((updates: Partial<AudioState>) => {
    stateRef.current = { ...stateRef.current, ...updates };
  }, []);

  const playAudio = useCallback(
    async (audioUrl: string) => {
      if (!audioRef.current) return;

      try {
        updateState({ isLoading: true, error: null });

        // Register with game context
        if (messageId && autoPlay && !hasRegisteredRef.current) {
          registerAudioPlayback(messageId);
          hasRegisteredRef.current = true;
        }

        // Request permission to speak
        const permissionGranted = await requestPermissionToSpeak(
          messageId || 'unknown'
        );
        if (!permissionGranted) {
          updateState({ isLoading: false, error: 'Audio permission denied' });
          return;
        }

        audioRef.current.src = audioUrl;
        audioRef.current.currentTime = 0;

        const playPromise = audioRef.current.play();

        if (playPromise !== undefined) {
          await playPromise;
          updateState({ isPlaying: true, isLoading: false });

          if (messageId) {
            markAsPlaying(messageId);
          }

          addAudioBreadcrumb('Audio started playing', {
            messageId,
            audioUrl: audioUrl.substring(0, 50),
          });
        }
      } catch (error) {
        updateState({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Playback failed',
        });
        addAudioBreadcrumb('Audio playback failed', { error, messageId });
      }
    },
    [
      messageId,
      autoPlay,
      registerAudioPlayback,
      requestPermissionToSpeak,
      markAsPlaying,
      updateState,
    ]
  );

  const pauseAudio = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      updateState({ isPlaying: false });
      addAudioBreadcrumb('Audio paused', { messageId });
    }
  }, [messageId, updateState]);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      updateState({ isPlaying: false });
      addAudioBreadcrumb('Audio stopped', { messageId });
    }
  }, [messageId, updateState]);

  // Audio event handlers
  const handleCanPlay = useCallback(() => {
    updateState({ duration: audioRef.current?.duration || 0 });
  }, [updateState]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      updateState({ currentTime: audioRef.current.currentTime });
    }
  }, [updateState]);

  const handleEnded = useCallback(() => {
    updateState({ isPlaying: false, currentTime: 0 });

    if (messageId && autoPlay && hasRegisteredRef.current) {
      reportAudioToGame(messageId);
      hasRegisteredRef.current = false;
    }

    if (messageId) {
      doneSpeaking(messageId);
    }

    onComplete?.();
    addAudioBreadcrumb('Audio ended naturally', { messageId });
  }, [messageId, autoPlay, reportAudioToGame, doneSpeaking, onComplete]);

  const handleError = useCallback(
    (e: Event) => {
      const target = e.target as HTMLAudioElement;
      updateState({
        isPlaying: false,
        error: `Audio error: ${target?.error?.message || 'Unknown error'}`,
      });
      addAudioBreadcrumb('Audio error occurred', {
        error: target?.error,
        messageId,
      });
    },
    [messageId]
  );

  // Setup audio element
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'none';
    audioRef.current = audio;

    // Add event listeners
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.src = '';
    };
  }, [handleCanPlay, handleTimeUpdate, handleEnded, handleError]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }

      if (messageId && autoPlay && hasRegisteredRef.current) {
        reportAudioToGame(messageId);
        hasRegisteredRef.current = false;
      }
    };
  }, [messageId, autoPlay, reportAudioToGame]);

  return {
    audioRef,
    playAudio,
    pauseAudio,
    stopAudio,
    state: stateRef.current,
    updateState,
  };
}

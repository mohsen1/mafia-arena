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
  useEffect,
  useRef,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { useSpokenText } from '@/context/SpokenTextContext';
import { useGameContext } from '@/context/GameContext';
import { Volume2, VolumeX, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addAudioBreadcrumb } from '@/components/AudioDebugOverlay';
// import { useTranslation } from 'react-i18next'; // disabled for now

interface SpeakTextProps {
  text: string;
  voiceId?: string;
  autoPlay?: boolean;
  onComplete?: () => void;
  className?: string;
  showControls?: boolean;
  isAudioGloballyEnabled?: boolean;
  messageId?: string; // Add messageId to uniquely identify playback
}

// Deduplication cache for in-flight requests (disabled for now)
// const fetchCache = new Map<string, Promise<Response>>();

// Metrics collection
const audioMetrics = {
  fetchCount: 0,
  duplicateFetches: 0,
  successfulPlays: 0,
  failedPlays: 0,
  permissionDenials: 0,
  fetchTimes: [] as number[],
  audioElementPeakCount: 0,
  visibilityPauses: 0,
  visibilityResumes: 0,
  networkEvents: 0,
  unhandledErrors: 0,
  // User behavior metrics
  skipCount: 0,
  muteCount: 0,
  unmuteCount: 0,
  completionCount: 0,
  interruptCount: 0,
  totalAudioDuration: 0,
  totalPlayedDuration: 0,
  manualPlayCount: 0,
  autoPlayCount: 0,
  longMessages: 0,
};

// Performance monitoring helper - generic to support any return type (disabled for now)
/*
const measurePerformance = async <T,>(
  name: string,
  fn: () => T | Promise<T>
): Promise<T> => {
  const startMark = `audio-${name}-start-${Date.now()}`;
  const endMark = `audio-${name}-end-${Date.now()}`;

  performance.mark(startMark);

  try {
    const result = await fn();
    performance.mark(endMark);
    performance.measure(`audio-${name}`, startMark, endMark);
    return result;
  } catch (error) {
    performance.mark(endMark);
    performance.measure(`audio-${name}`, startMark, endMark);
    throw error;
  }
};
*/

// const LOG_PREFIX = '[SpeakText]'; // disabled for now
const DEBUG_MODE = true; // Toggle for verbose logging

/*
const log = (emoji: string, message: string, data?: any) => {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

  if (DEBUG_MODE) {
    console.log(
      `%c${LOG_PREFIX} ${timestamp} ${emoji} ${message}`,
      'color: #7c7c7c; font-size: 11px;',
      data || ''
    );
  }
};
*/

// Active audio elements tracking (disabled for now)
// const activeAudioElements = 0;

// Browser audio diagnostics
const logAudioDiagnostics = () => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    audioContextSupport:
      'AudioContext' in window || 'webkitAudioContext' in window,
    webAudioApiSupport: !!window.AudioContext,
    autoplayPolicy: 'unknown',
    audioCodecs: {
      mp3: canPlayType('audio/mpeg'),
      ogg: canPlayType('audio/ogg'),
      wav: canPlayType('audio/wav'),
      webm: canPlayType('audio/webm'),
    },
    speechSynthesisSupport: 'speechSynthesis' in window,
    mediaDevicesSupport: !!(
      navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    ),
    onlineStatus: navigator.onLine,
    connectionType: (navigator as any).connection?.effectiveType || 'unknown',
    memory: (performance as any).memory
      ? {
          usedJSHeapSize:
            ((performance as any).memory.usedJSHeapSize / 1048576).toFixed(2) +
            'MB',
          totalJSHeapSize:
            ((performance as any).memory.totalJSHeapSize / 1048576).toFixed(2) +
            'MB',
          jsHeapSizeLimit:
            ((performance as any).memory.jsHeapSizeLimit / 1048576).toFixed(2) +
            'MB',
        }
      : 'not available',
  };

  console.log(
    '%c[SpeakText] 🔍 AUDIO DIAGNOSTICS:',
    'color: #f39c12; font-weight: bold',
    diagnostics
  );
  return diagnostics;
};

function canPlayType(type: string): string {
  const audio = document.createElement('audio');
  const canPlay = audio.canPlayType(type);
  return canPlay || 'no';
}

// Run diagnostics once on first render
if (
  typeof window !== 'undefined' &&
  !(window as any).__audioDiagnosticsLogged
) {
  (window as any).__audioDiagnosticsLogged = true;
  logAudioDiagnostics();
}

// Expose metrics globally for debug overlay
if (typeof window !== 'undefined') {
  (window as any).__audioMetrics = audioMetrics;
}

// Network connectivity monitoring
if (typeof window !== 'undefined' && !(window as any).__audioNetworkMonitor) {
  (window as any).__audioNetworkMonitor = true;

  // Monitor online/offline status
  window.addEventListener('online', () => {
    console.log(
      '%c[SpeakText] 🌐 NETWORK ONLINE',
      'color: #27ae60; font-weight: bold'
    );
    audioMetrics.networkEvents = (audioMetrics.networkEvents || 0) + 1;
  });

  window.addEventListener('offline', () => {
    console.log(
      '%c[SpeakText] 🚫 NETWORK OFFLINE',
      'color: #e74c3c; font-weight: bold'
    );
    audioMetrics.networkEvents = (audioMetrics.networkEvents || 0) + 1;
  });

  // Monitor connection changes
  if ('connection' in navigator) {
    const connection = (navigator as any).connection;
    connection.addEventListener('change', () => {
      console.log(
        '%c[SpeakText] 📶 CONNECTION CHANGED:',
        'color: #f39c12; font-weight: bold',
        {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
        }
      );
    });
  }

  // Global error handler for unhandled audio errors
  const originalError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (
      String(message).toLowerCase().includes('audio') ||
      String(source).includes('SpeakText') ||
      (error && error.stack && error.stack.includes('audio'))
    ) {
      console.error(
        '%c[SpeakText] 🚨 UNHANDLED AUDIO ERROR:',
        'color: #e74c3c; font-weight: bold',
        {
          message,
          source,
          lineno,
          colno,
          error: error?.stack,
          timestamp: new Date().toISOString(),
        }
      );
      audioMetrics.unhandledErrors = (audioMetrics.unhandledErrors || 0) + 1;
    }

    // Call original handler if it exists
    if (originalError) {
      return originalError.call(window, message, source, lineno, colno, error);
    }
    return false;
  };
}

const SpeakText = React.memo<SpeakTextProps>(
  ({
    text,
    voiceId = '21m00Tcm4TlvDq8ikWAM', // Default ElevenLabs voice
    autoPlay = true,
    onComplete,
    className = '',
    showControls = false,
    isAudioGloballyEnabled = true,
    messageId,
  }) => {
    // const { t } = useTranslation(); // disabled for now
    // const log = console.log.bind(console, '[SpeakText]'); // disabled for now

    // Enhanced logging with emojis and colors
    const logAudio = (action: string, details: any) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(
        `%c🎵 [SpeakText] ${timestamp} ${action}`,
        'color: #9b59b6; font-weight: bold',
        details
      );
    };

    const logError = (action: string, error: any) => {
      const timestamp = new Date().toLocaleTimeString();
      console.error(
        `%c❌ [SpeakText] ${timestamp} ERROR in ${action}:`,
        'color: #e74c3c; font-weight: bold',
        error
      );
    };

    const logState = (state: string, details: any) => {
      const timestamp = new Date().toLocaleTimeString();
      console.log(
        `%c📊 [SpeakText] ${timestamp} STATE: ${state}`,
        'color: #3498db; font-weight: bold',
        details
      );
    };

    const {
      currentlySpeakingId,
      // requestPermissionToSpeak, // not used currently
      doneSpeaking,
      // markAsPlaying, // not used currently
    } = useSpokenText();

    const gameContext = useGameContext();
    const { registerAudioPlayback, reportAudioFinished: reportAudioToGame } =
      gameContext;
    const hasRegisteredRef = useRef(false);

    // Log initial mount
    React.useEffect(() => {
      logAudio('COMPONENT MOUNTED', {
        text: text.substring(0, 100) + '...',
        voiceId,
        autoPlay,
        isAudioGloballyEnabled,
      });

      return () => {
        logAudio('COMPONENT UNMOUNTING', {
          audioId: audioIdRef.current,
          isPlaying: isPlayingRef.current,
        });
      };
    }, []);

    // Voice selection and mapping (disabled for now)
    // const selectedModel = useRef<string>('');

    // Visual feedback for speech generation (disabled for now)
    // const synthProgress = useRef(0);

    // TODO: Add these methods to GameContext if needed for audio coordination (disabled for now)
    /*
    const registerStopAudio = () => {
      // Placeholder for future implementation
    };

    const unregisterStopAudio = () => {
      // Placeholder for future implementation
    };

    const reportAudioFinished = () => {
      // Placeholder for future implementation
    };
    */

    // Deduplication caches
    const pendingFetches = useRef(new Map<string, Promise<string | null>>());
    const audioCache = useRef(new Map<string, string>());

    // Audio element and state management
    const audioIdRef = useRef(
      `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    const hasStartedRef = useRef(false);
    const isMountedRef = useRef(true);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    // const isHandlingSpeakRef = useRef(false); // disabled for now
    const abortControllerRef = useRef<AbortController | null>(null);
    // Playback state refs
    const isPlayingRef = useRef(false);
    const currentTimeRef = useRef(0);
    const bufferHealthRef = useRef(1);
    const loggedProgressRef = useRef(new Set<number>());

    // Performance tracking
    const fetchStartTimeRef = useRef<number | null>(null);
    const startTimeRef = useRef<number | null>(null);

    // Audio processing refs (disabled for now)
    // const segmentDurationsRef = useRef<Map<string, number>>(new Map());

    const timestamp = () =>
      new Date().toISOString().split('T')[1].split('.')[0];

    // States
    const [status, setStatus] = useState<
      'idle' | 'fetching' | 'playing' | 'error'
    >('idle');
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentWordIndex, setCurrentWordIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    const [hasError, setHasError] = useState(false);

    // Mount/unmount tracking
    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;

        // Clean up audio
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
          audioRef.current = null;
        }
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        // Report to GameContext if we were playing
        if (messageId && autoPlay && hasRegisteredRef.current) {
          reportAudioToGame(messageId);
          hasRegisteredRef.current = false;
          logAudioEvent('REPORTED_ON_UNMOUNT', {
            messageId,
            audioId: audioIdRef.current,
          });
        }
      };
    }, [messageId, autoPlay, reportAudioToGame]); // Add dependencies

    // Enhanced audio logging with performance metrics
    const logAudioEvent = (
      eventType: string,
      details: Record<string, any> = {}
    ) => {
      const now = Date.now();
      const timeSinceStart = startTimeRef.current
        ? now - startTimeRef.current
        : 0;

      const logEntry = {
        timestamp: timestamp(),
        eventType,
        audioId: audioIdRef.current,
        text: text.substring(0, 50) + '...',
        voiceId,
        timeSinceStart,
        isPlaying: isPlayingRef.current,
        playbackTime: currentTimeRef.current,
        bufferHealth: bufferHealthRef.current,
        ...details,
      };

      logAudio(eventType, logEntry);

      // Also add to AudioDebugOverlay
      if (typeof addAudioBreadcrumb === 'function') {
        const breadcrumbMessage = `${eventType}: ${audioIdRef.current || 'unknown'}`;
        addAudioBreadcrumb(breadcrumbMessage, details || {});
      }

      // Track performance metrics
      if (eventType === 'FETCH_START') {
        fetchStartTimeRef.current = now;
      } else if (eventType === 'FETCH_COMPLETE' && fetchStartTimeRef.current) {
        const fetchDuration = now - fetchStartTimeRef.current;
        logState('FETCH_PERFORMANCE', {
          duration: fetchDuration,
          textLength: text.length,
          throughput: text.length / (fetchDuration / 1000),
        });
      }
    };

    const fetchAudioWithDeduplication = useCallback(
      async (
        text: string,
        voiceId: string,
        audioId: string
      ): Promise<string | null> => {
        const cacheKey = `${text}-${voiceId}`;

        logAudio('FETCH_AUDIO_REQUEST', {
          audioId,
          cacheKey,
          textLength: text.length,
          voiceId,
          isAudioGloballyEnabled,
        });

        // Check if already fetching
        if (pendingFetches.current.has(cacheKey)) {
          logState('FETCH_DEDUPLICATION', {
            cacheKey,
            status: 'Using existing fetch',
          });
          return pendingFetches.current.get(cacheKey)!;
        }

        // Check cache first
        const cached = audioCache.current.get(cacheKey);
        if (cached) {
          logState('CACHE_HIT', {
            cacheKey,
            cacheSize: audioCache.current.size,
          });
          return cached;
        }

        // Create new fetch promise
        const fetchPromise = (async () => {
          try {
            logAudioEvent('FETCH_START', { cacheKey });

            // For streaming, create audio URL directly with query parameters
            const params = new URLSearchParams({
              text,
              voiceId,
            });
            const audioUrl = `/api/speak?${params.toString()}`;

            logAudioEvent('FETCH_COMPLETE', {
              cacheKey,
              audioUrl: audioUrl.substring(0, 50) + '...',
              responseTime:
                Date.now() - (fetchStartTimeRef.current || Date.now()),
            });

            // Cache the result
            audioCache.current.set(cacheKey, audioUrl);

            // Limit cache size
            if (audioCache.current.size > 50) {
              const firstKey = audioCache.current.keys().next().value;
              if (firstKey !== undefined) {
                audioCache.current.delete(firstKey);
                logState('CACHE_EVICTION', {
                  evictedKey: firstKey,
                  newSize: audioCache.current.size,
                });
              }
            }

            return audioUrl;
          } catch (error) {
            logError('FETCH_ERROR', error);
            throw error;
          } finally {
            pendingFetches.current.delete(cacheKey);
          }
        })();

        pendingFetches.current.set(cacheKey, fetchPromise);
        return fetchPromise;
      },
      [isAudioGloballyEnabled]
    );

    const handleSpeak = useCallback(async () => {
      logAudio('HANDLE_SPEAK_CALLED', {
        audioId: audioIdRef.current,
        isPlaying: isPlayingRef.current,
        isLoading,
        hasError,
        isAudioGloballyEnabled,
        currentlySpeakingId,
      });

      if (!isMountedRef.current) {
        logState('SPEAK_CANCELLED', { reason: 'Component unmounted' });
        return;
      }

      if (!isAudioGloballyEnabled) {
        logState('SPEAK_CANCELLED', {
          reason: 'Audio disabled',
          isAudioGloballyEnabled,
        });
        return;
      }

      if (isLoading || isPlayingRef.current) {
        logState('SPEAK_CANCELLED', {
          reason: 'Already loading or playing',
          isLoading,
          isPlaying: isPlayingRef.current,
        });
        return;
      }

      try {
        setIsLoading(true);
        setHasError(false);
        hasStartedRef.current = true;
        startTimeRef.current = Date.now();

        logAudioEvent('SPEAK_START', {
          text: text.substring(0, 100) + '...',
          voiceId,
        });

        const audioUrl = await fetchAudioWithDeduplication(
          text,
          voiceId,
          audioIdRef.current
        );

        if (!audioUrl || !isMountedRef.current) {
          logState('SPEAK_ABORTED', {
            hasAudioUrl: !!audioUrl,
            isMounted: isMountedRef.current,
          });
          return;
        }

        // Create audio element with streaming optimizations
        const audioElement = new Audio(audioUrl);
        audioElement.preload = 'none'; // Start loading only when play() is called
        audioElement.crossOrigin = 'anonymous';
        // Enable low-latency streaming
        if ('setSinkId' in audioElement) {
          audioElement.disableRemotePlayback = true;
        }
        audioElementRef.current = audioElement;

        // Set up comprehensive event listeners
        const setupAudioListeners = () => {
          audioElement.addEventListener('loadstart', () => {
            logAudioEvent('LOADSTART', { audioId: audioIdRef.current });
          });

          audioElement.addEventListener('loadedmetadata', () => {
            logAudioEvent('LOADED_METADATA', {
              duration: audioElement.duration,
              audioId: audioIdRef.current,
            });
          });

          audioElement.addEventListener('loadeddata', () => {
            logAudioEvent('LOADED_DATA', { audioId: audioIdRef.current });
          });

          audioElement.addEventListener('canplay', () => {
            logAudioEvent('CAN_PLAY', { audioId: audioIdRef.current });
          });

          audioElement.addEventListener('canplaythrough', () => {
            logAudioEvent('CAN_PLAY_THROUGH', {
              audioId: audioIdRef.current,
              buffered:
                audioElement.buffered.length > 0
                  ? audioElement.buffered.end(0)
                  : 0,
            });
          });

          audioElement.addEventListener('play', () => {
            isPlayingRef.current = true;
            setIsPlaying(true);
            logAudioEvent('PLAY', { audioId: audioIdRef.current });

            // Register with GameContext if messageId is provided
            if (messageId && autoPlay && !hasRegisteredRef.current) {
              hasRegisteredRef.current = true;
              registerAudioPlayback(messageId);
              logAudioEvent('REGISTERED_WITH_GAME', {
                messageId,
                audioId: audioIdRef.current,
              });
            }
          });

          audioElement.addEventListener('playing', () => {
            logAudioEvent('PLAYING', {
              audioId: audioIdRef.current,
              currentTime: audioElement.currentTime,
            });
          });

          audioElement.addEventListener('pause', () => {
            logAudioEvent('PAUSE', {
              audioId: audioIdRef.current,
              currentTime: audioElement.currentTime,
              duration: audioElement.duration,
            });
          });

          audioElement.addEventListener('ended', () => {
            const duration = Date.now() - (startTimeRef.current || Date.now());
            logAudioEvent('ENDED', {
              audioId: audioIdRef.current,
              totalDuration: duration,
              audioDuration: audioElement.duration,
            });

            isPlayingRef.current = false;
            setIsPlaying(false);

            if (onComplete) {
              logState('CALLING_ON_COMPLETE', { audioId: audioIdRef.current });
              onComplete();
            }

            doneSpeaking(audioIdRef.current);

            // Report to GameContext if messageId is provided
            if (messageId && autoPlay && hasRegisteredRef.current) {
              reportAudioToGame(messageId);
              hasRegisteredRef.current = false;
              logAudioEvent('REPORTED_TO_GAME', {
                messageId,
                audioId: audioIdRef.current,
              });
            }
          });

          audioElement.addEventListener('timeupdate', () => {
            currentTimeRef.current = audioElement.currentTime;
            const progress =
              (audioElement.currentTime / audioElement.duration) * 100;

            // Log progress every 10%
            const progressBucket = Math.floor(progress / 10) * 10;
            if (
              !loggedProgressRef.current.has(progressBucket) &&
              progressBucket > 0
            ) {
              loggedProgressRef.current.add(progressBucket);
              logAudioEvent('PROGRESS', {
                audioId: audioIdRef.current,
                progress: `${progressBucket}%`,
                currentTime: audioElement.currentTime,
                duration: audioElement.duration,
              });
            }
          });

          audioElement.addEventListener('error', (e) => {
            const error = audioElement.error;
            logError('AUDIO_ERROR', {
              audioId: audioIdRef.current,
              error: error?.message || 'Unknown error',
              code: error?.code,
              mediaError: e,
            });

            setHasError(true);
            setIsLoading(false);
            isPlayingRef.current = false;
            setIsPlaying(false);

            if (onComplete) {
              onComplete();
            }

            // Report to GameContext on error if registered
            if (messageId && autoPlay && hasRegisteredRef.current) {
              reportAudioToGame(messageId);
              hasRegisteredRef.current = false;
              logAudioEvent('REPORTED_ON_ERROR', {
                messageId,
                audioId: audioIdRef.current,
              });
            }
          });

          audioElement.addEventListener('stalled', () => {
            logAudioEvent('STALLED', {
              audioId: audioIdRef.current,
              currentTime: audioElement.currentTime,
            });
          });

          audioElement.addEventListener('waiting', () => {
            logAudioEvent('WAITING', {
              audioId: audioIdRef.current,
              currentTime: audioElement.currentTime,
            });
          });
        };

        setupAudioListeners();

        // Start playback
        logAudioEvent('ATTEMPTING_PLAY', { audioId: audioIdRef.current });

        try {
          await audioElement.play();
          setIsLoading(false);
          logAudioEvent('PLAY_SUCCESS', { audioId: audioIdRef.current });
        } catch (playError: any) {
          logError('PLAY_FAILED', {
            audioId: audioIdRef.current,
            error: playError.message,
            name: playError.name,
          });

          setHasError(true);
          setIsLoading(false);
          isPlayingRef.current = false;
          setIsPlaying(false);

          if (onComplete) {
            onComplete();
          }

          // Report to GameContext on play failure if registered
          if (messageId && autoPlay && hasRegisteredRef.current) {
            reportAudioToGame(messageId);
            hasRegisteredRef.current = false;
            logAudioEvent('REPORTED_ON_PLAY_FAILURE', {
              messageId,
              audioId: audioIdRef.current,
            });
          }
        }
      } catch (error: any) {
        logError('HANDLE_SPEAK_ERROR', {
          audioId: audioIdRef.current,
          error: error.message,
          stack: error.stack,
        });

        setHasError(true);
        setIsLoading(false);

        if (onComplete) {
          onComplete();
        }
      }
    }, [
      text,
      voiceId,
      onComplete,
      isLoading,
      hasError,
      isAudioGloballyEnabled,
      currentlySpeakingId,
      fetchAudioWithDeduplication,
      doneSpeaking,
      messageId,
      autoPlay,
      registerAudioPlayback,
      reportAudioToGame,
    ]);

    // Monitor audio state changes
    React.useEffect(() => {
      logState('AUDIO_STATE_CHANGE', {
        isPlaying,
        isLoading,
        hasError,
        currentlySpeakingId,
        audioId: audioIdRef.current,
        isAudioGloballyEnabled,
      });
    }, [
      isPlaying,
      isLoading,
      hasError,
      currentlySpeakingId,
      isAudioGloballyEnabled,
    ]);

    // Enhanced auto-play effect
    React.useEffect(() => {
      logAudio('AUTOPLAY_EFFECT', {
        autoPlay,
        isAudioGloballyEnabled,
        currentlySpeakingId,
        audioId: audioIdRef.current,
        hasStarted: hasStartedRef.current,
      });

      if (autoPlay && isAudioGloballyEnabled && !hasStartedRef.current) {
        logState('AUTOPLAY_TRIGGERED', { audioId: audioIdRef.current });
        const timer = setTimeout(() => {
          handleSpeak();
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [autoPlay, isAudioGloballyEnabled, handleSpeak]);

    // Log metrics periodically
    useEffect(() => {
      if (!DEBUG_MODE) return;

      const metricsInterval = setInterval(() => {
        // const totalPlays = // disabled for now
        //   audioMetrics.current.manualPlayCount +
        //   audioMetrics.current.autoPlayCount;
        // const totalEnded = // disabled for now
        //   audioMetrics.current.completionCount +
        //   audioMetrics.current.interruptCount;
        /*
        log('📊', 'AUDIO METRICS SUMMARY', {
          // Performance metrics
          fetchCount: audioMetrics.current.fetchCount,
          avgFetchTime:
            audioMetrics.current.fetchTimes.length > 0
              ? `${(audioMetrics.current.fetchTimes.reduce((a, b) => a + b, 0) / audioMetrics.current.fetchTimes.length).toFixed(2)}ms`
              : 'N/A',
          duplicateFetchRate:
            audioMetrics.current.fetchCount > 0
              ? `${((audioMetrics.current.duplicateFetches / audioMetrics.current.fetchCount) * 100).toFixed(1)}%`
              : 'N/A',
          playSuccessRate:
            audioMetrics.current.successfulPlays +
              audioMetrics.current.failedPlays >
            0
              ? `${((audioMetrics.current.successfulPlays / (audioMetrics.current.successfulPlays + audioMetrics.current.failedPlays)) * 100).toFixed(1)}%`
              : 'N/A',

          // User behavior metrics
          totalPlays,
          manualPlayRate:
            totalPlays > 0
              ? `${((audioMetrics.current.manualPlayCount / totalPlays) * 100).toFixed(1)}%`
              : 'N/A',
          autoPlayRate:
            totalPlays > 0
              ? `${((audioMetrics.current.autoPlayCount / totalPlays) * 100).toFixed(1)}%`
              : 'N/A',
          completionRate:
            totalEnded > 0
              ? `${((audioMetrics.current.completionCount / totalEnded) * 100).toFixed(1)}%`
              : 'N/A',
          skipRate:
            totalEnded > 0
              ? `${((audioMetrics.current.interruptCount / totalEnded) * 100).toFixed(1)}%`
              : 'N/A',
          avgListenTime:
            audioMetrics.current.completionCount > 0
              ? `${(audioMetrics.current.totalPlayedDuration / totalEnded).toFixed(1)}s`
              : 'N/A',
        });
        */
      }, 30000); // Every 30 seconds

      return () => clearInterval(metricsInterval);
    }, []);

    const handleStop = useCallback(() => {
      logAudio('HANDLE_STOP_CALLED', {
        audioId: audioIdRef.current,
        isPlaying: isPlayingRef.current,
      });

      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.currentTime = 0;
        audioElementRef.current = null;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }

      isPlayingRef.current = false;
      setIsPlaying(false);
      setCurrentWordIndex(-1);
      setStatus('idle');
      doneSpeaking(audioIdRef.current);

      // Report to GameContext on manual stop if registered
      if (messageId && autoPlay && hasRegisteredRef.current) {
        reportAudioToGame(messageId);
        hasRegisteredRef.current = false;
        logAudioEvent('REPORTED_ON_STOP', {
          messageId,
          audioId: audioIdRef.current,
        });
      }
    }, [doneSpeaking, messageId, autoPlay, reportAudioToGame]);

    // Memoize words for performance
    const words = useMemo(() => text.split(' '), [text]);

    if (!isAudioGloballyEnabled) {
      console.log('[SpeakText] Audio globally disabled, rendering text only');
      return <span className={className}>{text}</span>;
    }

    return (
      <div className={`speak-text-container ${className}`}>
        {/* Status indicator */}
        {status === 'fetching' && (
          <Loader2 className="animate-spin inline-block mr-1 h-4 w-4 text-muted-foreground" />
        )}
        {status === 'error' && (
          <AlertCircle className="inline-block mr-1 h-4 w-4 text-destructive" />
        )}
        <div className="text-content">
          {words.map((word: string, index: number) => (
            <span
              key={index}
              className={`word ${
                index === currentWordIndex
                  ? 'highlighted font-bold text-primary'
                  : ''
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
                onClick={() => handleSpeak()}
                size="sm"
                variant="ghost"
                className="gap-2"
                disabled={
                  currentlySpeakingId !== null &&
                  currentlySpeakingId !== audioIdRef.current
                }
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

        {hasError && <div className="text-sm text-destructive mt-1">Audio playback error occurred</div>}
      </div>
    );
  }
);

SpeakText.displayName = 'SpeakText';

export default SpeakText;

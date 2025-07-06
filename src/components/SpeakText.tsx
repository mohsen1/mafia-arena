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

interface SpeakTextProps {
  text: string;
  voiceId?: string;
  autoPlay?: boolean;
  onComplete?: () => void;
  className?: string;
  showControls?: boolean;
  isAudioGloballyEnabled?: boolean;
}

// Deduplication cache for in-flight requests
const fetchCache = new Map<string, Promise<Response>>();

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

// Performance monitoring helper - generic to support any return type
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

const LOG_PREFIX = '[SpeakText]';
const DEBUG_MODE = true; // Toggle for verbose logging

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

// Helper function to convert Base64 to Blob
function _base64ToBlob(base64: string, contentType = 'audio/mpeg'): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

// Active audio elements tracking
let activeAudioElements = 0;

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

export function SpeakText({
  text,
  voiceId = '21m00Tcm4TlvDq8ikWAM', // Default ElevenLabs voice
  autoPlay = true,
  onComplete,
  className = '',
  showControls = false,
  isAudioGloballyEnabled = true,
}: SpeakTextProps) {
  const {
    currentlySpeakingId,
    requestPermissionToSpeak,
    doneSpeaking,
    markAsPlaying,
  } = useSpokenText();

  // GameContext is required - page should wrap with GameProvider
  const _gameContext = useGameContext();

  // TODO: Add these methods to GameContext if needed for audio coordination
  const reportAudioFinished = () => {};
  const registerStopAudio = () => {};
  const unregisterStopAudio = () => {};

  type AudioStatus = 'idle' | 'fetching' | 'playing' | 'error';

  const [status, setStatus] = useState<AudioStatus>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioIdRef = useRef<string>(
    `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
  const _wordTimingsRef = useRef<
    Array<{ word: string; start: number; end: number }>
  >([]);
  const hasStartedRef = useRef(false);
  const isMountedRef = useRef(true);
  const cleanupCalledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentlySpeakingIdRef = useRef<string | null>(null);
  const isHandlingSpeakRef = useRef(false);
  const hasPlayedRef = useRef(false);
  const renderCountRef = useRef(0);
  const fetchStartTimeRef = useRef<number | null>(null);
  const wasPlayingBeforeHiddenRef = useRef(false);

  const timestamp = () => new Date().toISOString().split('T')[1].split('.')[0];

  // Browser visibility handling
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.hidden;
      console.log(`[SpeakText] ${timestamp()} 👁️ VISIBILITY CHANGE:`, {
        audioId: audioIdRef.current,
        isHidden,
        isPlaying,
        audioElement: !!audioRef.current,
      });

      if (audioRef.current && isPlaying) {
        if (isHidden) {
          // Tab became hidden - pause audio
          console.log(
            `[SpeakText] ${timestamp()} ⏸️ PAUSING due to tab hidden`
          );
          wasPlayingBeforeHiddenRef.current = true;
          audioRef.current.pause();
          audioMetrics.visibilityPauses++;
        } else if (wasPlayingBeforeHiddenRef.current) {
          // Tab became visible - resume audio if it was playing before
          console.log(
            `[SpeakText] ${timestamp()} ▶️ RESUMING after tab visible`
          );
          wasPlayingBeforeHiddenRef.current = false;
          audioRef.current.play().catch((err) => {
            console.error(
              `[SpeakText] ${timestamp()} ❌ Error resuming after visibility:`,
              err
            );
          });
          audioMetrics.visibilityResumes++;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying]);

  // Track active audio elements
  useEffect(() => {
    activeAudioElements++;
    audioMetrics.audioElementPeakCount = Math.max(
      audioMetrics.audioElementPeakCount,
      activeAudioElements
    );
    console.log(
      `[SpeakText] ${timestamp()} 📊 AUDIO ELEMENT COUNT: ${activeAudioElements}`
    );

    return () => {
      activeAudioElements--;
      console.log(
        `[SpeakText] ${timestamp()} 📊 AUDIO ELEMENT COUNT: ${activeAudioElements}`
      );
    };
  }, []);

  // Track global audio element count for memory leak detection
  useEffect(() => {
    const win = window as any;
    if (!win.__audioElementCount) win.__audioElementCount = 0;
    win.__audioElementCount++;
    console.log(
      `[SpeakText] ${timestamp()} 📊 AUDIO ELEMENT COUNT: ${win.__audioElementCount}`
    );

    // Detect React StrictMode double rendering
    renderCountRef.current++;
    if (renderCountRef.current > 1) {
      console.log(
        `[SpeakText] ${timestamp()} ⚠️ STRICT MODE: Component rendered ${renderCountRef.current} times`
      );
    }

    return () => {
      win.__audioElementCount = Math.max(0, (win.__audioElementCount || 0) - 1);
      console.log(
        `[SpeakText] ${timestamp()} 📊 AUDIO ELEMENT COUNT (after cleanup): ${win.__audioElementCount}`
      );
    };
  }, []);

  // Keep ref in sync with context value
  useEffect(() => {
    currentlySpeakingIdRef.current = currentlySpeakingId;
  }, [currentlySpeakingId]);
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

  // Component mount/unmount tracking
  useEffect(() => {
    console.log(`[SpeakText] ${timestamp()} 🏗️ Component MOUNTED:`, {
      audioId: audioIdRef.current,
      text: text.substring(0, 50) + '...',
      voiceId,
      autoPlay,
      isAudioGloballyEnabled,
      hasStartedPreviously: hasStartedRef.current,
    });

    isMountedRef.current = true;

    // Reset hasStarted when component mounts to handle remounting scenarios
    hasStartedRef.current = false;

    return () => {
      console.log(`[SpeakText] ${timestamp()} 🗑️ Component UNMOUNTING:`, {
        audioId: audioIdRef.current,
        isPlaying: audioRef.current && !audioRef.current.paused,
        hasStarted: hasStartedRef.current,
      });

      isMountedRef.current = false;
      isHandlingSpeakRef.current = false;

      if (!cleanupCalledRef.current) {
        cleanupCalledRef.current = true;
        console.log(
          `[SpeakText] ${timestamp()} 🧽 CLEANUP starting for:`,
          audioIdRef.current
        );

        if (audioRef.current) {
          console.log(
            `[SpeakText] ${timestamp()} ⏹️ Pausing and removing audio element`
          );
          const audio = audioRef.current;
          audio.pause();

          // Remove all event listeners using stored handlers
          const eventHandlers = (audio as any).__eventHandlers;
          if (eventHandlers) {
            Object.entries(eventHandlers).forEach(([event, handler]) => {
              audio.removeEventListener(event, handler as EventListener);
            });
          }

          audio.src = '';
          audioRef.current = null;
        }

        // Always clear the speaking ID on unmount
        if (currentlySpeakingId === audioIdRef.current) {
          console.log(
            `[SpeakText] ${timestamp()} 🗑️ CLEARING speaking ID on unmount:`,
            audioIdRef.current
          );
          doneSpeaking(audioIdRef.current);
          unregisterStopAudio();
        }
      }
    };
  }, []); // Empty dependencies - only run on mount/unmount

  // Enhanced fetch with deduplication and detailed logging
  const fetchAudioWithDeduplication = async (
    url: string,
    signal: AbortSignal
  ): Promise<Response> => {
    const cacheKey = `${text}-${voiceId}`;

    // Check if we already have an in-flight request for this audio
    if (fetchCache.has(cacheKey)) {
      log('♻️', 'REUSING IN-FLIGHT FETCH', {
        cacheKey,
        audioId: audioIdRef.current,
        cacheSize: fetchCache.size,
      });
      audioMetrics.duplicateFetches++;
      return fetchCache.get(cacheKey)!;
    }

    // Create new fetch promise
    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, voiceId }),
      signal,
    })
      .then((response) => {
        // Remove from cache after completion
        fetchCache.delete(cacheKey);
        return response;
      })
      .catch((error) => {
        // Remove from cache on error
        fetchCache.delete(cacheKey);
        throw error;
      });

    // Add to cache
    fetchCache.set(cacheKey, fetchPromise);
    log('🔄', 'NEW FETCH STARTED', {
      cacheKey,
      audioId: audioIdRef.current,
      cacheSize: fetchCache.size,
    });

    return fetchPromise;
  };

  // Auto-play effect
  useEffect(() => {
    if (
      autoPlay &&
      !hasStartedRef.current &&
      isAudioGloballyEnabled &&
      isMountedRef.current
    ) {
      console.log(
        `[SpeakText] ${timestamp()} 🎯 AUTO-PLAYING audio on mount for:`,
        audioIdRef.current
      );
      hasStartedRef.current = true;
      handleSpeak();
    }
  }, [autoPlay, isAudioGloballyEnabled]);

  const handleSpeak = useCallback(
    async (retryCount = 0) => {
      const callStack = new Error().stack;
      const callerLine = callStack?.split('\n')[2] || 'unknown';

      // Performance marking
      const perfMark = `audio-speak-${audioIdRef.current}-${Date.now()}`;
      performance.mark(`${perfMark}-start`);

      // Message content analysis
      const messageAnalysis = {
        length: text.length,
        hasEmojis: /\p{Emoji}/u.test(text),
        hasSpecialChars: /[^\w\s.,!?'-]/g.test(text),
        wordCount: text.split(/\s+/).length,
        estimatedDuration: Math.ceil(text.length / 150), // Rough estimate: 150 chars/second
        lineBreaks: (text.match(/\n/g) || []).length,
        hasUrls: /https?:\/\/\S+/i.test(text),
      };

      console.log(`[SpeakText] ${timestamp()} 📊 MESSAGE CONTENT ANALYSIS:`, {
        audioId: audioIdRef.current,
        ...messageAnalysis,
        preview: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
      });

      addAudioBreadcrumb('Message analysis', {
        audioId: audioIdRef.current,
        ...messageAnalysis,
      });

      // Warn if message is very long
      if (text.length > 3000) {
        console.warn(
          `[SpeakText] ${timestamp()} ⚠️ VERY LONG MESSAGE - May exceed TTS limits`,
          {
            audioId: audioIdRef.current,
            length: text.length,
            exceedsBy: text.length - 3000,
          }
        );
        audioMetrics.longMessages = (audioMetrics.longMessages || 0) + 1;
      }

      console.log(`[SpeakText] ${timestamp()} 🗣️ handleSpeak CALLED:`, {
        audioId: audioIdRef.current,
        text: text.substring(0, 50) + '...',
        voiceId,
        currentlySpeakingId,
        isMounted: isMountedRef.current,
        isHandlingSpeakRef: isHandlingSpeakRef.current,
        hasExistingAudio: !!audioRef.current,
        isCurrentlyPlaying: audioRef.current && !audioRef.current.paused,
        caller: callerLine.includes('autoPlay')
          ? 'autoPlay-effect'
          : callerLine.includes('Button')
            ? 'manual-button'
            : 'other',
        hasStartedRef: hasStartedRef.current,
        retryCount,
      });

      // Track manual vs auto play
      const caller = callerLine.includes('autoPlay')
        ? 'autoPlay-effect'
        : callerLine.includes('Button')
          ? 'manual-button'
          : 'other';
      if (caller === 'manual-button') {
        audioMetrics.manualPlayCount++;
      } else if (caller === 'autoPlay-effect') {
        audioMetrics.autoPlayCount++;
      }

      // Check if we already have an audio element playing
      if (audioRef.current && !audioRef.current.paused) {
        console.log(
          `[SpeakText] ${timestamp()} ⚠️ Audio already playing, ignoring duplicate call`
        );
        return;
      }

      // Prevent concurrent handleSpeak calls
      if (isHandlingSpeakRef.current) {
        console.log(
          `[SpeakText] ${timestamp()} ⚠️ Already handling speak, ignoring duplicate call`
        );
        return;
      }

      if (!isMountedRef.current) {
        console.log(
          `[SpeakText] ${timestamp()} ❌ Component unmounted, aborting`
        );
        return;
      }

      // Mark that we're handling speak
      isHandlingSpeakRef.current = true;
      fetchStartTimeRef.current = performance.now();

      // Always reset state when starting
      setStatus('idle');

      console.log(
        `[SpeakText] ${timestamp()} 🔓 REQUESTING permission to speak...`
      );
      addAudioBreadcrumb('Request permission', {
        audioId: audioIdRef.current,
        caller,
      });
      const result = requestPermissionToSpeak(audioIdRef.current);
      const granted = result.granted;

      if (!granted) {
        console.log(
          `[SpeakText] ${timestamp()} ❌ PERMISSION DENIED - another audio is playing`
        );
        addAudioBreadcrumb('Permission denied', {
          audioId: audioIdRef.current,
        });
        audioMetrics.permissionDenials++;
        isHandlingSpeakRef.current = false;
        return;
      }

      console.log(
        `[SpeakText] ${timestamp()} ✅ PERMISSION GRANTED, proceeding with speak`
      );
      addAudioBreadcrumb('Permission granted', { audioId: audioIdRef.current });

      if (!text || !voiceId) {
        console.warn('[SpeakText] Missing text or voiceId');
        doneSpeaking(audioIdRef.current);
        isHandlingSpeakRef.current = false;
        return;
      }

      console.log('[SpeakText] Fetching audio from API...');
      setStatus('fetching');

      try {
        // Double-check we don't already have audio
        if (audioRef.current) {
          console.log(
            `[SpeakText] ${timestamp()} ⚠️ Audio element already exists, aborting fetch`
          );
          isHandlingSpeakRef.current = false;
          return;
        }

        console.log(
          `[SpeakText] ${timestamp()} 🌐 Fetching audio from /api/speak:`,
          {
            audioId: audioIdRef.current,
            textLength: text.length,
            voiceId,
            textPreview: text.substring(0, 50) + '...',
          }
        );

        abortControllerRef.current = new AbortController();

        const response = await measurePerformance('fetch', async () => {
          audioMetrics.fetchCount++;

          const resp = await fetchAudioWithDeduplication(
            '/api/speak',
            abortControllerRef.current!.signal
          );

          const fetchTime = fetchStartTimeRef.current
            ? performance.now() - fetchStartTimeRef.current
            : 0;
          if (fetchTime > 0) {
            audioMetrics.fetchTimes.push(fetchTime);
          }

          log('📊', 'FETCH COMPLETED', {
            audioId: audioIdRef.current,
            status: resp.status,
            fetchTime: `${fetchTime.toFixed(2)}ms`,
            contentLength: resp.headers.get('content-length'),
            contentType: resp.headers.get('content-type'),
          });

          return resp;
        });

        if (response.headers.get('x-mock-audio') === 'true') {
          console.warn(`[SpeakText] ${timestamp()} 🎭 MOCK AUDIO DETECTED:`, {
            reason: response.headers.get('x-mock-reason'),
            audioId: audioIdRef.current,
          });
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[SpeakText] ${timestamp()} ❌ API Error Response:`, {
            audioId: audioIdRef.current,
            status: response.status,
            errorText: errorText.substring(0, 200),
          });
          throw new Error(
            `Failed to generate speech: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        const audioData = await response.blob();
        console.log(`[SpeakText] ${timestamp()} 📦 Audio blob received:`, {
          audioId: audioIdRef.current,
          blobSize: audioData.size,
          blobType: audioData.type,
        });

        const audioUrl = URL.createObjectURL(audioData);
        console.log(`[SpeakText] ${timestamp()} 🔗 Audio URL created:`, {
          audioId: audioIdRef.current,
          url: audioUrl.substring(0, 50) + '...',
        });

        if (!isMountedRef.current) {
          console.log(
            '[SpeakText] Component unmounted during fetch, cleaning up'
          );
          URL.revokeObjectURL(audioUrl);
          doneSpeaking(audioIdRef.current);
          isHandlingSpeakRef.current = false;
          return;
        }

        // Create new audio element
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        console.log(`[SpeakText] ${timestamp()} 🎵 Audio element CREATED:`, {
          audioId: audioIdRef.current,
          src: audioUrl.substring(0, 50) + '...',
        });

        // Store event handlers so we can remove them later
        const eventHandlers: { [key: string]: EventListener } = {};

        // Set up comprehensive event handlers
        eventHandlers.loadstart = () => {
          console.log(`[SpeakText] ${timestamp()} 📡 Audio LOADSTART:`, {
            audioId: audioIdRef.current,
            readyState: audio.readyState,
            networkState: audio.networkState,
          });
        };
        audio.addEventListener('loadstart', eventHandlers.loadstart);

        eventHandlers.progress = () => {
          if (audio.buffered.length > 0) {
            const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
            const duration = audio.duration;
            if (duration > 0) {
              console.log(`[SpeakText] ${timestamp()} 📊 Audio PROGRESS:`, {
                audioId: audioIdRef.current,
                buffered: `${((bufferedEnd / duration) * 100).toFixed(1)}%`,
                duration: duration.toFixed(2) + 's',
              });
            }
          }
        };
        audio.addEventListener('progress', eventHandlers.progress);

        eventHandlers.canplay = () => {
          console.log(`[SpeakText] ${timestamp()} ✅ Audio CANPLAY:`, {
            audioId: audioIdRef.current,
            duration: audio.duration.toFixed(2) + 's',
            readyState: audio.readyState,
          });
        };
        audio.addEventListener('canplay', eventHandlers.canplay);

        eventHandlers.play = () => {
          console.log(`[SpeakText] ${timestamp()} ▶️ Audio PLAY event:`, {
            audioId: audioIdRef.current,
            currentTime: audio.currentTime.toFixed(2) + 's',
          });
        };
        audio.addEventListener('play', eventHandlers.play);

        eventHandlers.playing = () => {
          console.log(`[SpeakText] ${timestamp()} 🎵 Audio PLAYING event:`, {
            audioId: audioIdRef.current,
            currentTime: audio.currentTime.toFixed(2) + 's',
          });
          setIsPlaying(true);
          hasPlayedRef.current = true;
          audioMetrics.successfulPlays++;
          addAudioBreadcrumb('Audio playing', {
            audioId: audioIdRef.current,
            duration: audio.duration.toFixed(2) + 's',
          });
          // Register this audio with GameContext for auto-run coordination
          registerStopAudio();
        };
        audio.addEventListener('playing', eventHandlers.playing);

        eventHandlers.pause = () => {
          console.log(`[SpeakText] ${timestamp()} ⏸️ Audio PAUSE event:`, {
            audioId: audioIdRef.current,
            currentTime: audio.currentTime.toFixed(2) + 's',
            duration: audio.duration.toFixed(2) + 's',
          });
        };
        audio.addEventListener('pause', eventHandlers.pause);

        eventHandlers.loadeddata = () => {
          if (isMountedRef.current) {
            console.log(`[SpeakText] ${timestamp()} 📂 Audio LOADEDDATA:`, {
              audioId: audioIdRef.current,
              duration: audio.duration.toFixed(2) + 's',
              readyState: audio.readyState,
            });
          }
        };
        audio.addEventListener('loadeddata', eventHandlers.loadeddata);

        eventHandlers.ended = () => {
          console.log(`[SpeakText] ${timestamp()} 🏁 Audio ENDED naturally:`, {
            audioId: audioIdRef.current,
            totalDuration: audio.duration.toFixed(2) + 's',
          });

          // Track completion metrics
          audioMetrics.completionCount++;
          audioMetrics.totalAudioDuration += audio.duration;
          audioMetrics.totalPlayedDuration += audio.duration;
          addAudioBreadcrumb('Audio completed', {
            audioId: audioIdRef.current,
            duration: audio.duration.toFixed(2) + 's',
          });

          if (isMountedRef.current) {
            setIsPlaying(false);
            setCurrentWordIndex(-1);
            doneSpeaking(audioIdRef.current);
            setStatus('idle');
            // Report to GameContext for auto-run coordination
            reportAudioFinished();
            onComplete?.();
          }
          hasStartedRef.current = false;
          isHandlingSpeakRef.current = false;

          // Clean up audio element
          console.log(
            `[SpeakText] ${timestamp()} 🧹 Cleaning up audio after ended`
          );

          // Remove all event listeners
          Object.entries(eventHandlers).forEach(([event, handler]) => {
            audio.removeEventListener(event, handler);
          });

          audio.src = '';
          audioRef.current = null;
          URL.revokeObjectURL(audioUrl);
          unregisterStopAudio();
        };
        audio.addEventListener('ended', eventHandlers.ended);

        eventHandlers.error = (e: Event) => {
          const error = e.target as HTMLAudioElement;
          const errorCode = error.error?.code || 'unknown';
          const errorMessage = error.error?.message || 'Unknown error';

          console.error(`[SpeakText] ${timestamp()} ❌ Audio ERROR:`, {
            audioId: audioIdRef.current,
            errorCode,
            errorMessage,
            networkState: audio.networkState,
            readyState: audio.readyState,
            src: audio.src?.substring(0, 50) + '...',
          });
          setStatus('error');
          setError(`Audio error: ${errorMessage}`);
          doneSpeaking(audioIdRef.current);
          isHandlingSpeakRef.current = false;
          audioMetrics.failedPlays++;

          // Clean up on error - remove listeners first
          Object.entries(eventHandlers).forEach(([event, handler]) => {
            audio.removeEventListener(event, handler);
          });

          audio.src = '';
          audioRef.current = null;
          URL.revokeObjectURL(audioUrl);
        };
        audio.addEventListener('error', eventHandlers.error);

        // Store event handlers reference on the audio element for cleanup
        (audio as any).__eventHandlers = eventHandlers;

        // Play the audio
        console.log('[SpeakText] Attempting to play audio...');
        try {
          await audio.play();
          // Mark as playing to prevent timeout from clearing it
          markAsPlaying(audioIdRef.current);
          console.log('[SpeakText] Audio started playing successfully');
          setStatus('playing');
          // Audio is now playing, we can reset the handling flag
          isHandlingSpeakRef.current = false;
        } catch (playError: any) {
          console.error('[SpeakText] Error in handleSpeak:', playError);
          setStatus('error');
          doneSpeaking(audioIdRef.current);
          isHandlingSpeakRef.current = false;
          // If browser blocks autoplay, we should not retry immediately
          if (playError.name === 'NotAllowedError') {
            console.log('[SpeakText] Audio blocked by browser autoplay policy');
          }
        }
      } catch (error: any) {
        console.error('[SpeakText] Error in handleSpeak:', error);

        // Retry logic for network errors
        if (
          retryCount < 3 &&
          (error.name === 'NetworkError' || error.message.includes('fetch'))
        ) {
          console.log(
            `[SpeakText] ${timestamp()} 🔄 Retrying after network error (attempt ${retryCount + 1}/3)`
          );
          setTimeout(
            () => {
              if (isMountedRef.current) {
                handleSpeak(retryCount + 1);
              }
            },
            1000 * Math.pow(2, retryCount)
          ); // Exponential backoff: 1s, 2s, 4s
          return;
        }

        setStatus('error');
        doneSpeaking(audioIdRef.current);
        isHandlingSpeakRef.current = false;

        // Performance mark end on error
        performance.mark(`${perfMark}-error`);
        performance.measure(
          `audio-speak-error-${audioIdRef.current}`,
          `${perfMark}-start`,
          `${perfMark}-error`
        );
      }

      // Performance mark end on success
      if (performance.getEntriesByName(`${perfMark}-start`).length > 0) {
        performance.mark(`${perfMark}-end`);
        performance.measure(
          `audio-speak-complete-${audioIdRef.current}`,
          `${perfMark}-start`,
          `${perfMark}-end`
        );
      }
    },
    [
      text,
      voiceId,
      currentlySpeakingId,
      requestPermissionToSpeak,
      doneSpeaking,
      markAsPlaying,
    ]
  );

  const handleStop = () => {
    console.log('[SpeakText] handleStop called');
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setCurrentWordIndex(-1);
    doneSpeaking(audioIdRef.current);
    setStatus('idle');
    isHandlingSpeakRef.current = false;
  };

  // Add a cleanup function that properly removes listeners
  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      const audio = audioRef.current;
      console.log(`[SpeakText] ${timestamp()} 🧹 Cleaning up audio element:`, {
        audioId: audioIdRef.current,
        src: audio.src?.substring(0, 50) + '...',
      });

      // Pause first
      audio.pause();

      // Remove all event listeners using stored handlers
      const eventHandlers = (audio as any).__eventHandlers;
      if (eventHandlers) {
        Object.entries(eventHandlers).forEach(([event, handler]) => {
          audio.removeEventListener(event, handler as EventListener);
        });
      }

      // Clear src after removing listeners
      audio.src = '';

      // Null the reference
      audioRef.current = null;
    }
  }, []);

  // Watch for when this audio is no longer the current speaker
  useEffect(() => {
    if (audioRef.current && currentlySpeakingId !== audioIdRef.current) {
      console.log(
        `[SpeakText] ${timestamp()} 🛑 Audio stopped externally (Skip button):`,
        {
          audioId: audioIdRef.current,
          currentlySpeakingId,
        }
      );

      // Track interruption metrics
      if (audioRef.current && !audioRef.current.paused) {
        audioMetrics.interruptCount++;
        audioMetrics.skipCount++;
        const playedDuration = audioRef.current.currentTime;
        audioMetrics.totalPlayedDuration += playedDuration;
        console.log(`[SpeakText] ${timestamp()} 📊 Audio interrupted:`, {
          playedDuration: playedDuration.toFixed(2) + 's',
          totalDuration: audioRef.current.duration.toFixed(2) + 's',
          completionRate:
            ((playedDuration / audioRef.current.duration) * 100).toFixed(1) +
            '%',
        });
      }

      // Clean up the audio element
      cleanupAudio();
      setIsPlaying(false);
      setCurrentWordIndex(-1);
      setStatus('idle');
      hasStartedRef.current = false;
      isHandlingSpeakRef.current = false;
    }
  }, [currentlySpeakingId, cleanupAudio]);

  // Main effect for auto-play
  useEffect(() => {
    const caller = 'main-autoplay-effect';
    console.log(`[SpeakText] ${timestamp()} 📡 Main effect triggered:`, {
      audioId: audioIdRef.current,
      autoPlay,
      hasStarted: hasStartedRef.current,
      isAudioGloballyEnabled,
      isMounted: isMountedRef.current,
      currentlySpeakingId,
      textPreview: text.substring(0, 30) + '...',
      caller,
      existingAudio: !!audioRef.current,
      audioPlaying: audioRef.current && !audioRef.current.paused,
    });

    if (
      autoPlay &&
      !hasStartedRef.current &&
      isAudioGloballyEnabled &&
      isMountedRef.current
    ) {
      console.log(
        `[SpeakText] ${timestamp()} 🎯 AUTO-PLAYING audio on mount for:`,
        audioIdRef.current
      );
      hasStartedRef.current = true;
      // Call handleSpeak directly - the SpokenTextContext will manage queueing
      handleSpeak();
    } else if (autoPlay && hasStartedRef.current) {
      console.log(`[SpeakText] ${timestamp()} ⏭️ SKIPPING - Already started:`, {
        audioId: audioIdRef.current,
        textPreview: text.substring(0, 30) + '...',
      });
    } else if (!autoPlay) {
      console.log(`[SpeakText] ${timestamp()} 🚫 NOT AUTO-PLAYING:`, {
        audioId: audioIdRef.current,
        reason: 'autoPlay is false',
        textPreview: text.substring(0, 30) + '...',
      });
    }
  }, [autoPlay, isAudioGloballyEnabled, handleSpeak]);

  // Log metrics periodically
  useEffect(() => {
    if (!DEBUG_MODE) return;

    const metricsInterval = setInterval(() => {
      const totalPlays =
        audioMetrics.manualPlayCount + audioMetrics.autoPlayCount;
      const totalEnded =
        audioMetrics.completionCount + audioMetrics.interruptCount;

      log('📊', 'AUDIO METRICS SUMMARY', {
        // Performance metrics
        fetchCount: audioMetrics.fetchCount,
        avgFetchTime:
          audioMetrics.fetchTimes.length > 0
            ? `${(audioMetrics.fetchTimes.reduce((a, b) => a + b, 0) / audioMetrics.fetchTimes.length).toFixed(2)}ms`
            : 'N/A',
        duplicateFetchRate:
          audioMetrics.fetchCount > 0
            ? `${((audioMetrics.duplicateFetches / audioMetrics.fetchCount) * 100).toFixed(1)}%`
            : 'N/A',
        playSuccessRate:
          audioMetrics.successfulPlays + audioMetrics.failedPlays > 0
            ? `${((audioMetrics.successfulPlays / (audioMetrics.successfulPlays + audioMetrics.failedPlays)) * 100).toFixed(1)}%`
            : 'N/A',

        // User behavior metrics
        totalPlays,
        manualPlayRate:
          totalPlays > 0
            ? `${((audioMetrics.manualPlayCount / totalPlays) * 100).toFixed(1)}%`
            : 'N/A',
        autoPlayRate:
          totalPlays > 0
            ? `${((audioMetrics.autoPlayCount / totalPlays) * 100).toFixed(1)}%`
            : 'N/A',
        completionRate:
          totalEnded > 0
            ? `${((audioMetrics.completionCount / totalEnded) * 100).toFixed(1)}%`
            : 'N/A',
        skipRate:
          totalEnded > 0
            ? `${((audioMetrics.interruptCount / totalEnded) * 100).toFixed(1)}%`
            : 'N/A',
        avgListenTime:
          audioMetrics.completionCount > 0
            ? `${(audioMetrics.totalPlayedDuration / totalEnded).toFixed(1)}s`
            : 'N/A',
      });
    }, 30000); // Every 30 seconds

    return () => clearInterval(metricsInterval);
  }, []);

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
        {words.map((word, index) => (
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

      {error && <div className="text-sm text-destructive mt-1">{error}</div>}
    </div>
  );
}

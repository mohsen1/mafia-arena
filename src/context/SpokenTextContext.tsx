'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';

interface SpokenTextContextType {
  requestPermissionToSpeak: (audioId: string) => {
    granted: boolean;
    reason?: string;
  };
  doneSpeaking: (audioId: string) => void;
  resetAudio: () => void;
  currentlySpeakingId: string | null;
  isProcessingRequest: boolean;
  markAsPlaying: (audioId: string) => void;
  queuedRequests: string[]; // Expose queue for debug visualization
}

const SpokenTextContext = createContext<SpokenTextContextType | undefined>(
  undefined
);

// Enhanced logging with colors and emojis
const LOG_PREFIX = '[SpokenTextContext]';
const timestamp = () => new Date().toLocaleTimeString();

const log = (emoji: string, action: string, details: any) => {
  console.log(
    `%c${LOG_PREFIX} ${timestamp()} ${emoji} ${action}:`,
    'color: #9b59b6; font-weight: bold',
    details
  );
};

interface Props {
  children: ReactNode;
}

export function SpokenTextProvider({ children }: Props) {
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(
    null
  );
  const [isProcessingRequest, setIsProcessingRequest] = useState(false);
  const isProcessingRequestRef = useRef(false);
  const [queuedRequests, setQueuedRequests] = useState<string[]>([]);

  const requestPermissionToSpeak = useCallback(
    (audioId: string): { granted: boolean; reason?: string } => {
      log('🎤', 'PERMISSION REQUEST', {
        audioId,
        currentlySpeakingId,
        isProcessingRequest: isProcessingRequestRef.current,
        timestamp: Date.now(),
      });

      // Check if we're already processing a request
      if (isProcessingRequestRef.current) {
        const result = {
          granted: false,
          reason: 'Another permission request is being processed',
        };
        log('🚫', 'PERMISSION DENIED (Processing Lock)', {
          audioId,
          ...result,
        });
        return result;
      }

      // Check if another audio is currently speaking
      if (currentlySpeakingId && currentlySpeakingId !== audioId) {
        const result = {
          granted: false,
          reason: `Audio ${currentlySpeakingId} is currently speaking`,
        };
        log('🚫', 'PERMISSION DENIED (Busy)', {
          audioId,
          currentlySpeakingId,
          ...result,
        });

        // Add to queue if not already queued
        setQueuedRequests((prev) => {
          if (!prev.includes(audioId)) {
            log('📋', 'ADDED TO QUEUE', {
              audioId,
              queueLength: prev.length + 1,
            });
            return [...prev, audioId];
          }
          return prev;
        });

        return result;
      }

      // Check if this audio is already speaking
      if (currentlySpeakingId === audioId) {
        const result = {
          granted: true,
          reason: 'Already has permission',
        };
        log('✅', 'PERMISSION REDUNDANT', {
          audioId,
          ...result,
        });
        return result;
      }

      // Set the processing lock
      isProcessingRequestRef.current = true;
      setIsProcessingRequest(true);

      // Grant permission
      setCurrentlySpeakingId(audioId);

      // Release the lock
      setTimeout(() => {
        isProcessingRequestRef.current = false;
        setIsProcessingRequest(false);
      }, 100);

      const result = { granted: true };
      log('✅', 'PERMISSION GRANTED', {
        audioId,
        previousSpeakingId: currentlySpeakingId,
        ...result,
      });
      return result;
    },
    [currentlySpeakingId]
  );

  const markAsPlaying = useCallback(
    (audioId: string) => {
      log('🎵', 'MARK AS PLAYING', {
        audioId,
        currentlySpeakingId,
        matches: audioId === currentlySpeakingId,
      });

      if (audioId === currentlySpeakingId) {
        log('✅', 'AUDIO CONFIRMED PLAYING', { audioId });
      } else {
        log('⚠️', 'UNEXPECTED PLAYING STATE', {
          audioId,
          expectedId: currentlySpeakingId,
          mismatch: true,
        });
      }
    },
    [currentlySpeakingId]
  );

  const doneSpeaking = useCallback(
    (audioId: string) => {
      log('🏁', 'DONE SPEAKING', {
        audioId,
        currentlySpeakingId,
        wasCurrentlySpeaking: audioId === currentlySpeakingId,
      });

      if (currentlySpeakingId === audioId) {
        log('🔄', 'CLEARING CURRENT SPEAKER', {
          audioId,
          previousState: currentlySpeakingId,
          newState: null,
        });
        setCurrentlySpeakingId(null);
      } else {
        log('⚠️', 'DONE SPEAKING MISMATCH', {
          reportedId: audioId,
          currentId: currentlySpeakingId,
          action: 'Ignoring - not the current speaker',
        });
      }
    },
    [currentlySpeakingId]
  );

  const resetAudio = useCallback(() => {
    log('🔄', 'RESET AUDIO', {
      previousSpeakingId: currentlySpeakingId,
      timestamp: Date.now(),
    });

    if (currentlySpeakingId) {
      log('🛑', 'FORCE STOPPING AUDIO', {
        audioId: currentlySpeakingId,
        action: 'Clearing current speaker',
      });
    }

    setCurrentlySpeakingId(null);
    isProcessingRequestRef.current = false;
    setIsProcessingRequest(false);
  }, [currentlySpeakingId]);

  // Log context state changes
  React.useEffect(() => {
    log('📊', 'CONTEXT STATE UPDATE', {
      currentlySpeakingId,
      isProcessingRequest,
      timestamp: Date.now(),
    });
  }, [currentlySpeakingId, isProcessingRequest]);

  // Log provider mount/unmount
  React.useEffect(() => {
    log('🚀', 'PROVIDER MOUNTED', {
      timestamp: Date.now(),
    });

    return () => {
      log('💥', 'PROVIDER UNMOUNTING', {
        currentlySpeakingId,
        timestamp: Date.now(),
      });
    };
  }, []);

  // Add browser event logging
  React.useEffect(() => {
    const handleFocus = () => {
      log('🔍', 'BROWSER FOCUS', {
        currentlySpeakingId,
        timestamp: Date.now(),
      });
    };

    const handleBlur = () => {
      log('😴', 'BROWSER BLUR', {
        currentlySpeakingId,
        timestamp: Date.now(),
      });
    };

    const handleOnline = () => {
      log('🌐', 'BROWSER ONLINE', {
        timestamp: Date.now(),
      });
    };

    const handleOffline = () => {
      log('📵', 'BROWSER OFFLINE', {
        timestamp: Date.now(),
      });
    };

    const handleVisibilityChange = () => {
      log('👁️', 'VISIBILITY CHANGE', {
        hidden: document.hidden,
        visibilityState: document.visibilityState,
        currentlySpeakingId,
        timestamp: Date.now(),
      });
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentlySpeakingId) {
        log('⚠️', 'PAGE UNLOAD WITH ACTIVE AUDIO', {
          currentlySpeakingId,
          timestamp: Date.now(),
        });
      }
    };

    // Multi-tab synchronization via storage events
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'werewolf-audio-sync') {
        log('🔄', 'MULTI-TAB SYNC EVENT', {
          newValue: e.newValue,
          oldValue: e.oldValue,
          url: e.url,
          currentlySpeakingId,
          timestamp: Date.now(),
        });

        // If another tab is playing audio, we should stop ours
        if (
          e.newValue &&
          e.newValue !== currentlySpeakingId &&
          currentlySpeakingId
        ) {
          log('🛑', 'STOPPING AUDIO FOR MULTI-TAB SYNC', {
            ourAudioId: currentlySpeakingId,
            otherTabAudioId: e.newValue,
          });
          resetAudio();
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('storage', handleStorageChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentlySpeakingId, resetAudio]);

  // Broadcast our audio state to other tabs
  React.useEffect(() => {
    if (currentlySpeakingId) {
      try {
        localStorage.setItem('werewolf-audio-sync', currentlySpeakingId);
        log('📢', 'BROADCASTING AUDIO STATE', {
          audioId: currentlySpeakingId,
          timestamp: Date.now(),
        });
      } catch (e) {
        console.error('[SpokenTextContext] Failed to set localStorage:', e);
      }
    } else {
      try {
        localStorage.removeItem('werewolf-audio-sync');
        log('🔇', 'CLEARING AUDIO BROADCAST', {
          timestamp: Date.now(),
        });
      } catch (e) {
        console.error(
          '[SpokenTextContext] Failed to remove from localStorage:',
          e
        );
      }
    }
  }, [currentlySpeakingId]);

  const value: SpokenTextContextType = {
    requestPermissionToSpeak,
    doneSpeaking,
    resetAudio,
    currentlySpeakingId,
    isProcessingRequest,
    markAsPlaying,
    queuedRequests,
  };

  log('🔄', 'PROVIDER RENDER', {
    currentlySpeakingId,
    isProcessingRequest,
    hasChildren: !!children,
  });

  return (
    <SpokenTextContext.Provider value={value}>
      {children}
    </SpokenTextContext.Provider>
  );
}

export function useSpokenText() {
  const context = useContext(SpokenTextContext);
  if (!context) {
    throw new Error('useSpokenText must be used within a SpokenTextProvider');
  }
  return context;
}

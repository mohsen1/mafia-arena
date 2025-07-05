import type React from 'react';
import {
  createContext,
  useState,
  useContext,
  useCallback,
  type ReactNode,
  useRef,
  useEffect,
} from 'react';

// Define the callback function type
type OnDoneSpeakingCallback = (id: string) => void;

interface SpokenTextContextType {
  currentlySpeakingId: string | null;
  requestToSpeak: (id: string) => boolean; // Can component `id` play now? (manual trigger check)
  doneSpeaking: (id: string) => void;
  registerForAutoPlay: (id: string) => void; // Add component `id` to the auto-play queue
  resetAudio: () => void; // Force clear any stuck audio
  // Subscriptions might be less relevant now, but keep for potential other uses
  subscribeOnDoneSpeaking: (callback: OnDoneSpeakingCallback) => void;
  unsubscribeOnDoneSpeaking: (callback: OnDoneSpeakingCallback) => void;
  isAudioGloballyEnabled: boolean;
}

const SpokenTextContext = createContext<SpokenTextContextType | undefined>(
  undefined
);

interface SpokenTextProviderProps {
  children: ReactNode;
  isAudioGloballyEnabled?: boolean;
}

export const SpokenTextProvider: React.FC<SpokenTextProviderProps> = ({
  children,
  isAudioGloballyEnabled = true,
}) => {
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(
    null
  );
  const playbackQueueRef = useRef<string[]>([]);
  const subscribersRef = useRef<Set<OnDoneSpeakingCallback>>(new Set());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const timestamp = () => new Date().toISOString().split('T')[1].split('.')[0];
  
  console.log(`[SpokenTextContext] ${timestamp()} Provider render:`, {
    currentlySpeakingId,
    queueLength: playbackQueueRef.current.length,
    queue: playbackQueueRef.current,
    isAudioGloballyEnabled,
  });

  // Clear any stuck audio after a timeout
  useEffect(() => {
    if (currentlySpeakingId) {
      console.log(`[SpokenTextContext] ${timestamp()} Setting timeout for stuck audio:`, {
        currentlySpeakingId,
        queue: playbackQueueRef.current,
      });
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Set a new timeout to clear stuck audio IDs after 10 seconds (reduced from 15)
      timeoutRef.current = setTimeout(() => {
        console.warn(`[SpokenTextContext] ${timestamp()} Clearing stuck audio ID after timeout:`, {
          stuckId: currentlySpeakingId,
          currentQueue: playbackQueueRef.current,
        });
        setCurrentlySpeakingId(null);
        
        // Process any queued audio
        if (playbackQueueRef.current.length > 0) {
          const nextId = playbackQueueRef.current.shift()!;
          console.log(`[SpokenTextContext] ${timestamp()} Processing queued audio after timeout:`, {
            nextId,
            remainingQueue: playbackQueueRef.current,
          });
          setCurrentlySpeakingId(nextId);
        }
      }, 10000); // 10 seconds timeout
    } else {
      // Clear timeout if no audio is playing
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [currentlySpeakingId]);

  const requestToSpeak = useCallback((id: string): boolean => {
    const canSpeak = !currentlySpeakingId || currentlySpeakingId === id;
    console.log(`[SpokenTextContext] ${timestamp()} requestToSpeak:`, {
      requestingId: id,
      currentlySpeakingId,
      canSpeak,
      queue: playbackQueueRef.current,
      timeoutActive: !!timeoutRef.current,
    });

    if (canSpeak) {
      console.log(`[SpokenTextContext] ${timestamp()} ✅ GRANTED - Setting speaking ID:`, {
        newSpeakingId: id,
        previousId: currentlySpeakingId,
      });
      setCurrentlySpeakingId(id);
      return true;
    } else {
      console.log(`[SpokenTextContext] ${timestamp()} ❌ DENIED - Another audio playing:`, {
        requestingId: id,
        blockingId: currentlySpeakingId,
        queue: playbackQueueRef.current,
      });
      return false;
    }
  }, [currentlySpeakingId]);

  const doneSpeaking = useCallback((id: string) => {
    const isCurrentSpeaker = currentlySpeakingId === id;
    console.log(`[SpokenTextContext] ${timestamp()} doneSpeaking called:`, {
      finishedId: id,
      currentlySpeakingId,
      isCurrentSpeaker,
      queue: playbackQueueRef.current,
      timeoutActive: !!timeoutRef.current,
    });

    if (isCurrentSpeaker) {
      console.log(`[SpokenTextContext] ${timestamp()} ✅ CLEARING current speaking ID:`, {
        clearingId: id,
        queue: playbackQueueRef.current,
      });
      setCurrentlySpeakingId(null);

      // Clear the timeout since audio finished normally
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        console.log(`[SpokenTextContext] ${timestamp()} Cleared timeout for:`, id);
      }

      // Notify all subscribers
      subscribersRef.current.forEach((callback) => {
        try {
          callback(id);
        } catch (error) {
          console.error(`[SpokenTextContext] ${timestamp()} Error in subscriber callback:`, error);
        }
      });

      // Process next in queue if any
      if (playbackQueueRef.current.length > 0) {
        const nextId = playbackQueueRef.current.shift()!;
        console.log(`[SpokenTextContext] ${timestamp()} 🎯 Processing next in queue:`, {
          nextId,
          remainingQueue: playbackQueueRef.current,
        });
        setCurrentlySpeakingId(nextId);
      } else {
        console.log(`[SpokenTextContext] ${timestamp()} Queue empty, no more audio to process`);
      }
    } else {
      console.warn(`[SpokenTextContext] ${timestamp()} ❌ IGNORED doneSpeaking for non-current ID:`, {
        calledId: id,
        currentId: currentlySpeakingId,
        queue: playbackQueueRef.current,
      });
    }
  }, [currentlySpeakingId]);

  const registerForAutoPlay = useCallback((id: string) => {
    console.log(`[SpokenTextContext] ${timestamp()} registerForAutoPlay:`, {
      registeringId: id,
      currentQueue: playbackQueueRef.current,
      alreadyInQueue: playbackQueueRef.current.includes(id),
    });
    if (!playbackQueueRef.current.includes(id)) {
      playbackQueueRef.current.push(id);
      console.log(`[SpokenTextContext] ${timestamp()} Added to queue:`, {
        addedId: id,
        newQueue: playbackQueueRef.current,
      });
    }
  }, []);

  const subscribeOnDoneSpeaking = useCallback(
    (callback: OnDoneSpeakingCallback) => {
      subscribersRef.current.add(callback);
    },
    []
  );

  const unsubscribeOnDoneSpeaking = useCallback(
    (callback: OnDoneSpeakingCallback) => {
      subscribersRef.current.delete(callback);
    },
    []
  );

  const resetAudio = useCallback(() => {
    console.log(`[SpokenTextContext] ${timestamp()} 🔄 RESETTING AUDIO:`, {
      clearingId: currentlySpeakingId,
      clearingQueue: playbackQueueRef.current,
      timeoutActive: !!timeoutRef.current,
    });
    setCurrentlySpeakingId(null);
    // Clear the queue as well
    playbackQueueRef.current = [];
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    console.log(`[SpokenTextContext] ${timestamp()} Audio reset complete`);
  }, [currentlySpeakingId]);

  return (
    <SpokenTextContext.Provider
      value={{
        currentlySpeakingId,
        requestToSpeak,
        doneSpeaking,
        registerForAutoPlay,
        resetAudio,
        subscribeOnDoneSpeaking,
        unsubscribeOnDoneSpeaking,
        isAudioGloballyEnabled,
      }}
    >
      {children}
    </SpokenTextContext.Provider>
  );
};

export const useSpokenText = (): SpokenTextContextType => {
  const context = useContext(SpokenTextContext);
  if (context === undefined) {
    throw new Error('useSpokenText must be used within a SpokenTextProvider');
  }
  return context;
};

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
  // Subscriptions might be less relevant now, but keep for potential other uses
  subscribeOnDoneSpeaking: (callback: OnDoneSpeakingCallback) => void;
  unsubscribeOnDoneSpeaking: (callback: OnDoneSpeakingCallback) => void;
  isAudioGloballyEnabled: boolean;
}

const SpokenTextContext = createContext<SpokenTextContextType | undefined>(
  undefined
);

export const SpokenTextProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(
    null
  );
  const playbackQueueRef = useRef<string[]>([]);
  const subscribersRef = useRef<Set<OnDoneSpeakingCallback>>(new Set());
  const [isAudioGloballyEnabled] = useState<boolean>(true);

  // Internal function to start the next item in the queue if possible
  const playNextInQueue = useCallback(() => {
    if (!isAudioGloballyEnabled) {
      return;
    }

    if (currentlySpeakingId === null && playbackQueueRef.current.length > 0) {
      const nextId = playbackQueueRef.current.shift();
      if (nextId) {
        setCurrentlySpeakingId(nextId);
      }
    }
  }, [currentlySpeakingId, isAudioGloballyEnabled]);

  // Effect to kick off the queue
  useEffect(() => {
    if (
      isAudioGloballyEnabled &&
      currentlySpeakingId === null &&
      playbackQueueRef.current.length > 0
    ) {
      playNextInQueue();
    }
  }, [currentlySpeakingId, playNextInQueue, isAudioGloballyEnabled]);

  const registerForAutoPlay = useCallback(
    (id: string) => {
      if (!isAudioGloballyEnabled) {
        return;
      }
      if (!playbackQueueRef.current.includes(id)) {
        playbackQueueRef.current.push(id);
      }
    },
    [isAudioGloballyEnabled]
  );

  // Manual request check
  const requestToSpeak = useCallback(
    (id: string) => {
      if (!isAudioGloballyEnabled) {
        return false;
      }
      if (currentlySpeakingId === null) {
        setCurrentlySpeakingId(id);
        return true;
      }
      return false;
    },
    [currentlySpeakingId, isAudioGloballyEnabled]
  );

  const doneSpeaking = useCallback(
    (id: string) => {
      if (currentlySpeakingId === id) {
        setCurrentlySpeakingId(null);

        for (const callback of subscribersRef.current) {
          try {
            callback(id);
          } catch (error) {
            console.error(
              '[SpokenTextContext] Error in subscriber callback:',
              error
            );
          }
        }

        Promise.resolve().then(() => {
          playNextInQueue();
        });
      }
    },
    [currentlySpeakingId, playNextInQueue]
  );

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

  return (
    <SpokenTextContext.Provider
      value={{
        currentlySpeakingId,
        requestToSpeak,
        doneSpeaking,
        registerForAutoPlay,
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

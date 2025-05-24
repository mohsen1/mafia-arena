import type React from "react";
import {
  createContext,
  useState,
  useContext,
  useCallback,
  type ReactNode,
  useRef,
  useEffect,
} from "react";

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
  undefined,
);

export const SpokenTextProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(
    null,
  );
  const [queueVersion, setQueueVersion] = useState(0);
  const playbackQueueRef = useRef<string[]>([]);
  const subscribersRef = useRef<Set<OnDoneSpeakingCallback>>(new Set());
  const [isAudioGloballyEnabled] = useState<boolean>(true);

  // Internal function to start the next item in the queue if possible
  const playNextInQueue = useCallback(() => {
    // Check if audio is enabled globally before proceeding
    if (!isAudioGloballyEnabled) {
      console.log(
        "[SpokenTextContext] Audio is globally disabled, not playing next in queue.",
      );
      // Optionally, clear the queue if audio is disabled?
      // playbackQueueRef.current = [];
      // setQueueVersion(v => v + 1);
      return;
    }

    if (currentlySpeakingId === null && playbackQueueRef.current.length > 0) {
      const nextId = playbackQueueRef.current.shift(); // Dequeue
      if (nextId) {
        console.log(
          `[SpokenTextContext] Dequeuing and setting next speaker: ${nextId}. Queue size: ${playbackQueueRef.current.length}`,
        );
        setCurrentlySpeakingId(nextId); // Grant speaking slot to the next ID
      } else {
        console.log(
          "[SpokenTextContext] Dequeue failed, queue was likely empty.",
        );
      }
    } else {
      console.log(
        `[SpokenTextContext] playNextInQueue check failed (current: ${currentlySpeakingId}, queue: ${playbackQueueRef.current.length})`,
      );
    }
  }, [currentlySpeakingId, isAudioGloballyEnabled]); // Add isAudioGloballyEnabled dependency

  // Effect to kick off the queue
  useEffect(() => {
    console.log(
      `[SpokenTextContext] Effect check. Speaker ID: ${currentlySpeakingId}, Queue size: ${playbackQueueRef.current.length}, Version: ${queueVersion}`,
    );
    // Add audio enabled check here too
    if (
      isAudioGloballyEnabled &&
      currentlySpeakingId === null &&
      playbackQueueRef.current.length > 0
    ) {
      console.log(
        "[SpokenTextContext] Speaker is null & queue not empty & audio enabled, attempting to play next.",
      );
      playNextInQueue();
    }
  }, [
    currentlySpeakingId,
    playNextInQueue,
    queueVersion,
    isAudioGloballyEnabled,
  ]); // Add dependency

  const registerForAutoPlay = useCallback(
    (id: string) => {
      // If audio is globally disabled, don't even queue it
      if (!isAudioGloballyEnabled) {
        console.log(
          `[SpokenTextContext] Audio disabled, ignoring registration for ${id}.`,
        );
        return;
      }
      // Only add to queue, do not trigger playback here
      if (!playbackQueueRef.current.includes(id)) {
        playbackQueueRef.current.push(id);
        console.log(
          `[SpokenTextContext] Registered ${id}. Queue: [${playbackQueueRef.current.join(", ")}]`,
        );
        // Increment version to trigger effect check
        setQueueVersion((v) => v + 1);
      } else {
        console.log(`[SpokenTextContext] ${id} already registered, ignoring.`);
      }
    },
    [isAudioGloballyEnabled],
  ); // Add dependency

  // Manual request check
  const requestToSpeak = useCallback(
    (id: string) => {
      // If audio is globally disabled, deny the request
      if (!isAudioGloballyEnabled) {
        console.log(
          `[SpokenTextContext] Audio disabled, denying manual speak request for ${id}.`,
        );
        return false;
      }
      if (currentlySpeakingId === null) {
        setCurrentlySpeakingId(id);
        console.log(
          `[SpokenTextContext] Granted manual speak request to ${id}.`,
        );
        return true;
      }
      console.log(
        `[SpokenTextContext] Denied manual speak request to ${id}, ${currentlySpeakingId} is speaking.`,
      );
      return false;
    },
    [currentlySpeakingId, isAudioGloballyEnabled],
  ); // Add dependency

  const doneSpeaking = useCallback(
    (id: string) => {
      if (currentlySpeakingId === id) {
        console.log(
          `[SpokenTextContext] ${id} reported done speaking. Setting speaker to null.`,
        );
        setCurrentlySpeakingId(null);

        // Notify subscribers (optional)
        for (const callback of subscribersRef.current) {
          try {
            callback(id);
          } catch (error) {
            console.error(
              "[SpokenTextContext] Error in subscriber callback:",
              error,
            );
          }
        }

        // Schedule playNextInQueue - it will internally check if audio is enabled
        Promise.resolve().then(() => {
          console.log(
            `[SpokenTextContext] Microtask: Attempting playNextInQueue after ${id} finished.`,
          );
          playNextInQueue();
        });
      } else {
        console.warn(
          `[SpokenTextContext] doneSpeaking called by ${id}, but ${currentlySpeakingId ?? "null"} is the current speaker. Ignoring.`,
        );
      }
    },
    [currentlySpeakingId, playNextInQueue],
  ); // playNextInQueue already depends on isAudioGloballyEnabled

  const subscribeOnDoneSpeaking = useCallback(
    (callback: OnDoneSpeakingCallback) => {
      subscribersRef.current.add(callback);
      console.log(
        "[SpokenTextContext] Subscriber added. Count:",
        subscribersRef.current.size,
      );
    },
    [],
  );

  const unsubscribeOnDoneSpeaking = useCallback(
    (callback: OnDoneSpeakingCallback) => {
      subscribersRef.current.delete(callback);
      console.log(
        "[SpokenTextContext] Subscriber removed. Count:",
        subscribersRef.current.size,
      );
    },
    [],
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
    throw new Error("useSpokenText must be used within a SpokenTextProvider");
  }
  return context;
};

import React, { createContext, useState, useContext, useCallback, ReactNode, useRef, useEffect } from 'react';

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
}

const SpokenTextContext = createContext<SpokenTextContextType | undefined>(undefined);

export const SpokenTextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const playbackQueueRef = useRef<string[]>([]);
  const subscribersRef = useRef<Set<OnDoneSpeakingCallback>>(new Set());

  // Internal function to start the next item in the queue if possible
  const playNextInQueue = useCallback(() => {
    // Check if the slot is free AND the queue has items
    // This check should be reliable now as it's called from useEffect after state updates
    if (currentlySpeakingId === null && playbackQueueRef.current.length > 0) {
      const nextId = playbackQueueRef.current.shift(); // Dequeue
      if (nextId) {
          console.log(`[SpokenTextContext] Dequeuing and setting next speaker: ${nextId}. Queue size: ${playbackQueueRef.current.length}`);
          setCurrentlySpeakingId(nextId); // Grant speaking slot to the next ID
      } else {
           console.log(`[SpokenTextContext] Dequeue failed, queue was likely empty.`);
      }
    } else {
         console.log(`[SpokenTextContext] playNextInQueue check failed (current: ${currentlySpeakingId}, queue: ${playbackQueueRef.current.length})`);
    }
  }, [currentlySpeakingId]); // Add currentlySpeakingId back as dependency

  // Effect to kick off the queue once on initial provider mount OR when speaker becomes null
  useEffect(() => {
    console.log(`[SpokenTextContext] Effect check. Speaker ID: ${currentlySpeakingId}, Queue size: ${playbackQueueRef.current.length}, Version: ${queueVersion}`);
    if (currentlySpeakingId === null && playbackQueueRef.current.length > 0) {
        console.log("[SpokenTextContext] Speaker is null & queue not empty, attempting to play next.");
        playNextInQueue();
    }
  }, [currentlySpeakingId, playNextInQueue, queueVersion]); // Add queueVersion dependency

  const registerForAutoPlay = useCallback((id: string) => {
    // Only add to queue, do not trigger playback here
    if (!playbackQueueRef.current.includes(id)) {
        playbackQueueRef.current.push(id);
        console.log(`[SpokenTextContext] Registered ${id}. Queue: [${playbackQueueRef.current.join(', ')}]`);
        // Increment version to trigger effect check
        setQueueVersion(v => v + 1);
    } else {
        console.log(`[SpokenTextContext] ${id} already registered, ignoring.`);
    }
  // No dependencies needed
  }, []);

  // Manual request check
  const requestToSpeak = useCallback((id: string) => {
    if (currentlySpeakingId === null) {
      setCurrentlySpeakingId(id);
      console.log(`[SpokenTextContext] Granted manual speak request to ${id}.`);
      return true;
    }
    console.log(`[SpokenTextContext] Denied manual speak request to ${id}, ${currentlySpeakingId} is speaking.`);
    return false;
  }, [currentlySpeakingId]);

  const doneSpeaking = useCallback((id: string) => {
    if (currentlySpeakingId === id) {
      console.log(`[SpokenTextContext] ${id} reported done speaking. Setting speaker to null.`);
      setCurrentlySpeakingId(null);

      // Notify subscribers (optional)
      const currentSubscribers = Array.from(subscribersRef.current);
      currentSubscribers.forEach(callback => {
          try { callback(id); } catch (error) { console.error("[SpokenTextContext] Error in subscriber callback:", error); }
      });

      // Schedule playNextInQueue as a microtask AFTER setting state to null
      Promise.resolve().then(() => {
           console.log(`[SpokenTextContext] Microtask: Attempting playNextInQueue after ${id} finished.`);
           playNextInQueue();
      });

    } else {
         console.warn(`[SpokenTextContext] doneSpeaking called by ${id}, but ${currentlySpeakingId ?? 'null'} is the current speaker. Ignoring.`);
    }
  // Add playNextInQueue back to dependencies
  }, [currentlySpeakingId, playNextInQueue]);

  const subscribeOnDoneSpeaking = useCallback((callback: OnDoneSpeakingCallback) => {
    subscribersRef.current.add(callback);
    console.log("[SpokenTextContext] Subscriber added. Count:", subscribersRef.current.size);
  }, []);

  const unsubscribeOnDoneSpeaking = useCallback((callback: OnDoneSpeakingCallback) => {
    subscribersRef.current.delete(callback);
    console.log("[SpokenTextContext] Subscriber removed. Count:", subscribersRef.current.size);
  }, []);

  return (
    <SpokenTextContext.Provider value={{
      currentlySpeakingId,
      requestToSpeak,
      doneSpeaking,
      registerForAutoPlay,
      subscribeOnDoneSpeaking,
      unsubscribeOnDoneSpeaking
    }}>
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

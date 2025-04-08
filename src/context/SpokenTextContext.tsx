import React, { createContext, useState, useContext, useCallback, ReactNode, useRef } from 'react';

// Define the callback function type
type OnDoneSpeakingCallback = (id: string) => void;

interface SpokenTextContextType {
  currentlySpeakingId: string | null;
  requestToSpeak: (id: string) => boolean; // Returns true if request granted, false otherwise
  doneSpeaking: (id: string) => void;
  subscribeOnDoneSpeaking: (callback: OnDoneSpeakingCallback) => void;
  unsubscribeOnDoneSpeaking: (callback: OnDoneSpeakingCallback) => void;
}

const SpokenTextContext = createContext<SpokenTextContextType | undefined>(undefined);

export const SpokenTextProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentlySpeakingId, setCurrentlySpeakingId] = useState<string | null>(null);
  // Use a ref to store subscribers to avoid unnecessary re-renders of consumers
  // when only the subscriber list changes.
  const subscribersRef = useRef<Set<OnDoneSpeakingCallback>>(new Set());

  const requestToSpeak = useCallback((id: string) => {
    if (currentlySpeakingId === null) {
      setCurrentlySpeakingId(id);
      return true;
    }
    return false;
  }, [currentlySpeakingId]);

  const doneSpeaking = useCallback((id: string) => {
    // Only proceed if the ID matches the currently speaking one
    if (currentlySpeakingId === id) {
      setCurrentlySpeakingId(null);
      // Notify subscribers
      // Iterate over a copy in case a callback modifies the set during iteration
      const currentSubscribers = Array.from(subscribersRef.current);
      console.log(`[SpokenTextContext] Notifying ${currentSubscribers.length} subscribers that ${id} is done speaking.`);
      currentSubscribers.forEach(callback => {
          try {
            callback(id); // Pass the ID of the component that finished
          } catch (error) {
            console.error("[SpokenTextContext] Error in subscriber callback:", error);
          }
      });
    }
  }, [currentlySpeakingId]); // Dependency on currentlySpeakingId ensures correct check

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

import type React from "react";
import {
  createContext,
  useState,
  useContext,
  useCallback,
  useRef,
  useEffect,
} from "react";
import type { Dispatch, SetStateAction, ReactNode } from "react";
import { useSpokenText } from "./SpokenTextContext";
import type { FilteredGameState } from "@/lib/interfaces/gameState.types";
import type { HumanActionPayload } from "@/lib/interfaces/actions.types";

// import type { LanguageCode, LanguageName } from "@/lib/translation/languages";
// import { mapLanguageNameToCode } from "@/lib/translation/languages";
// import { getOrGenerateTranslationsAction } from "@/app/actions/index";
// Import the standard hook
// import { useTranslation } from "react-i18next";
// Import the custom client hook
// import { useTranslation } from "@/lib/i18n/client";
// Import mapping function
// import { mapLanguageNameToCode } from "@/lib/i18n/settings";
// Import GameState, ChatMessage, Player
// import { GameState, ChatMessage, Player } from "@/lib/types/game";
// Import GameState
// import type { FilteredGameState } from "@/lib/interfaces/gameState.types";
// Import HumanActionPayload
// import type { HumanActionPayload } from "@/lib/interfaces/actions.types";

// Define the payload type based on the server action - REMOVED Local Definition
// This should match the definition in GameClient.tsx and the expected server action input
// type HumanActionPayload =
//   | { type: "message"; content: string } // Renamed from 'chat' to align with PlayerAction
//   | { type: "vote"; targetPlayerId: string | null } // Allow null for abstain
//   | { type: "mafiaKill"; targetPlayerId: string } // Specific night actions
//   | { type: "doctorSave"; targetPlayerId: string | null }
//   | { type: "seerInvestigate"; targetPlayerId: string | null };

// Define the shape of the context state
interface GameContextState {
  gameState: FilteredGameState | null;
  setGameState: Dispatch<SetStateAction<FilteredGameState | null>>;
  isAutoRunning: boolean;
  toggleAutoRun: () => void;
  isLoadingNextTurn: boolean;
  setIsLoadingNextTurn: Dispatch<SetStateAction<boolean>>;
  runNextTurnAction: () => Promise<FilteredGameState | { error: string }>;
  stopCurrentAudio: () => void; // Function to stop whatever MessageBubble is playing
  registerStopAudio: (messageId: string, stopFn: () => void) => void;
  unregisterStopAudio: (messageId: string) => void;
  isAudioGloballyEnabled: boolean;
  toggleAudioGloballyEnabled: () => void;
  // Add the missing function type
  reportAudioFinished: (messageId: string) => void;
  // Use imported HumanActionPayload type
  submitHumanAction: (payload: HumanActionPayload) => Promise<FilteredGameState | { error: string }>;
}

// Create the context with a default undefined value
const GameContext = createContext<GameContextState | undefined>(undefined);

// Define props for the provider
interface GameProviderProps {
  children: ReactNode;
  initialGameState: FilteredGameState;
  // Update expected return type for bound actions to match server actions
  boundRunGameTurnAction: () => Promise<FilteredGameState | { error: string }>; 
  boundSubmitHumanAction: (payload: HumanActionPayload) => Promise<FilteredGameState | { error: string }>; 
}

// Create the provider component
export const GameProvider: React.FC<GameProviderProps> = ({
  children,
  initialGameState,
  boundRunGameTurnAction,
  boundSubmitHumanAction, // Destructure the new prop
}) => {
  const [gameState, setGameState] = useState<FilteredGameState | null>(
    initialGameState,
  );
  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
  const stopAudioCallbackRef = useRef<(() => void) | null>(null); // Ref to hold the current stop function
  const [isAudioGloballyEnabled, setIsAudioGloballyEnabled] =
    useState<boolean>(false); // Default audio to off

  // --- Remove useTranslation hook call --- 
  // const gameLanguage = gameState?.settings?.language;
  // const languageCode = mapLanguageNameToCode(gameLanguage || 'English') || 'en';
  // const { t, i18n } = useTranslation(languageCode); 
  // --- End removal ---

  // Get currently speaking ID from SpokenTextContext
  const { currentlySpeakingId: spokenTextCurrentlySpeakingId } =
    useSpokenText();

  // --- Ref to track the latest spoken text ID ---
  const spokenTextIdRef = useRef<string | null>(spokenTextCurrentlySpeakingId);
  useEffect(() => {
    spokenTextIdRef.current = spokenTextCurrentlySpeakingId;
  }, [spokenTextCurrentlySpeakingId]);
  // --- End Ref ---

  // --- REMOVED Translation Loading Effect ---
  // useEffect(() => { ... loadTranslations ... }, [gameLanguageCode, gameLanguageName, i18n]);
  // --- End REMOVED Translation Loading Effect ---

  // Instantiate translation hook *within* the provider -- REMOVED
  // const { t } = useTranslation({
  //   translations: translations,
  //   isSourceLanguage: gameLanguageCode === "en",
  // });

  // Function for MessageBubble to register its stop function
  const registerStopAudio = useCallback(
    (messageId: string, stopFn: () => void) => {
      if (messageId === spokenTextCurrentlySpeakingId) {
        stopAudioCallbackRef.current = stopFn;
      }
    },
    [spokenTextCurrentlySpeakingId],
  );

  // Function to be called by MessageBubble to clear the stop function
  const unregisterStopAudio = useCallback(() => {
    stopAudioCallbackRef.current = null;
  }, []);

  const stopCurrentAudio = useCallback(() => {
    stopAudioCallbackRef.current?.(); // Call the registered stop function
    stopAudioCallbackRef.current = null; // Clear the callback ref
  }, []);

  // Toggle global audio enabled state
  const toggleAudioGloballyEnabled = useCallback(() => {
    setIsAudioGloballyEnabled((prev) => {
      const newState = !prev;
      // If disabling audio, stop any currently playing sound
      if (!newState) {
        stopCurrentAudio();
      }
      return newState;
    });
  }, [stopCurrentAudio]);

  // Function to run the next turn in the game
  const runNextTurnAction = useCallback(async (): Promise<FilteredGameState | { error: string }> => {
    // Skip if game is over
    if (gameState?.phase === "GameOver") {
      return gameState ?? { error: "Game is over" };
    }

    // Skip if already loading to prevent double calls
    if (isLoadingNextTurn) {
      return gameState ?? { error: "Already loading" };
    }

    setIsLoadingNextTurn(true);
    try {
      const result = await boundRunGameTurnAction();
      if (result && !('error' in result)) {
        setGameState(result);
      }
      return result;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error" };
    } finally {
      setIsLoadingNextTurn(false);
    }
  }, [gameState, isLoadingNextTurn, boundRunGameTurnAction]);

  const toggleAutoRun = useCallback(() => {
    setIsAutoRunning((prev) => {
      const newState = !prev;
      if (!newState && spokenTextCurrentlySpeakingId) {
        stopCurrentAudio();
      }

      if (
        newState &&
        isAudioGloballyEnabled &&
        spokenTextCurrentlySpeakingId === null &&
        !isLoadingNextTurn &&
        gameState?.phase !== "GameOver"
      ) {
        setTimeout(() => runNextTurnAction(), 0);
      }

      if (
        newState &&
        !isAudioGloballyEnabled &&
        !isLoadingNextTurn &&
        gameState?.phase !== "GameOver"
      ) {
        setTimeout(() => runNextTurnAction(), 0);
      }

      return newState;
    });
  }, [
    stopCurrentAudio,
    isAudioGloballyEnabled,
    isLoadingNextTurn,
    gameState?.phase,
    runNextTurnAction,
    spokenTextCurrentlySpeakingId,
  ]);

  // Update context state if initialGameState prop changes (due to server revalidation)
  useEffect(() => {
    setGameState(initialGameState);
  }, [initialGameState]);

  // --- SEPARATE useEffect for Auto-Run Logic when audio is ENABLED ---
  useEffect(() => {
    // Condition: AutoRun ON, Audio ENABLED, Idle (no audio playing), AND Game Not Over, Not Loading, No Human Action Pending
    if (
        isAutoRunning &&
        isAudioGloballyEnabled &&
        spokenTextCurrentlySpeakingId === null && // Check if audio is IDLE
        !isLoadingNextTurn &&
        gameState && // Ensure gameState is not null
        !gameState.pendingHumanAction &&
        gameState.phase !== 'GameOver'
    ) {
        console.log(
            "[Context useEffect - AutoRun Audio Idle] Triggering next turn after audio finished/idle."
        );
        // Add a small delay to prevent overly rapid turns after audio stops
        const timerId = setTimeout(() => {
            // Re-check conditions before actually running
            if ( isAutoRunning &&
                 isAudioGloballyEnabled &&
                 spokenTextCurrentlySpeakingId === null &&
                 !isLoadingNextTurn &&
                 gameState &&
                 !gameState.pendingHumanAction &&
                 gameState.phase !== 'GameOver')
             {
                 runNextTurnAction();
             }
        }, 500); // 500ms delay
        return () => clearTimeout(timerId);
    }
  }, [
      isAutoRunning,
      isAudioGloballyEnabled,
      spokenTextCurrentlySpeakingId, // Trigger when audio finishes (becomes null)
      isLoadingNextTurn,
      gameState, // Re-check game state conditions
      runNextTurnAction,
  ]);

  // --- SEPARATE useEffect for Auto-Run Logic when audio is DISABLED ---
  useEffect(() => {
     // Condition: AutoRun ON, Audio DISABLED, Not Loading, AND Game Not Over, No Human Action Pending
    if (
        isAutoRunning &&
        !isAudioGloballyEnabled && // Specifically when audio is OFF
        !isLoadingNextTurn &&
        gameState && // Ensure gameState is not null
        !gameState.pendingHumanAction &&
        gameState.phase !== 'GameOver'
    ) {
        console.log(
            "[Context useEffect - AutoRun No Audio] Triggering next turn (audio disabled)."
        );
        // Add a slightly longer delay when audio is off to simulate "reading" time
        const timerId = setTimeout(() => {
             // Re-check conditions before actually running
             if ( isAutoRunning &&
                  !isAudioGloballyEnabled &&
                  !isLoadingNextTurn &&
                  gameState &&
                  !gameState.pendingHumanAction &&
                  gameState.phase !== 'GameOver')
              {
                  runNextTurnAction();
              }
         }, 1500); // 1.5 second delay
        return () => clearTimeout(timerId);
    }
  }, [
      isAutoRunning,
      isAudioGloballyEnabled, // Trigger when audio state changes
      isLoadingNextTurn,
      gameState, // Re-check game state conditions
      runNextTurnAction,
  ]);

  // Function called by MessageBubble (via SpeakText onEnd) when audio finishes
  const reportAudioFinished = useCallback(
    (messageId: string) => {
      console.log(
        `[Context] Audio finished report for messageId (timestamp): ${messageId}`,
      );

      // Get the latest message object
      const latestLogMessage = gameState?.log?.[0];
      // Compare the passed messageId (timestamp) with the latest message's timestamp
      const isLatestMessage = latestLogMessage && messageId === latestLogMessage.timestamp;

      // Pass the original messageId (timestamp) to unregister
      unregisterStopAudio();

      if (
        isAutoRunning &&
        isAudioGloballyEnabled &&
        isLatestMessage && // Use the comparison result here
        !isLoadingNextTurn &&
        !gameState?.pendingHumanAction
      ) {
        if (gameState?.phase !== "GameOver") {
          console.log(
            `[Context reportAudioFinished] AutoRun ON, Audio ON, Finished latest message (${messageId}), scheduling next turn check.`,
          );
          setTimeout(() => {
            // Re-check conditions using the REF for the speaking ID
            if (
              isAutoRunning &&
              isAudioGloballyEnabled &&
              spokenTextIdRef.current === null &&
              !isLoadingNextTurn &&
              !gameState?.pendingHumanAction &&
              gameState?.phase !== "GameOver"
            ) {
              console.log(
                "[Context reportAudioFinished] Running next turn after delay.",
              );
              runNextTurnAction();
            } else {
              // Log using the ref value for clarity
              console.log(
                `[Context reportAudioFinished] Conditions no longer met after delay (AutoRun: ${isAutoRunning}, AudioOn: ${isAudioGloballyEnabled}, SpeakingIDRef: ${spokenTextIdRef.current}, Loading: ${isLoadingNextTurn}, Phase: ${gameState?.phase}, PendingHumanAction: ${gameState?.pendingHumanAction})`,
              );
            }
          }, 500);
        } else {
          console.log(
            "[Context reportAudioFinished] AutoRun ON, Audio ON: Game is over.",
          );
        }
      } else {
        console.log(
          `[Context reportAudioFinished] Audio finished, but not proceeding to next turn (isAutoRunning: ${isAutoRunning}, isAudioEnabled: ${isAudioGloballyEnabled}, messageTimestamp: ${messageId}, isLatest: ${isLatestMessage}, isLoading: ${isLoadingNextTurn}, PendingHumanAction: ${gameState?.pendingHumanAction})`,
        );
      }
    },
    [
      isAutoRunning,
      isLoadingNextTurn,
      gameState?.log,
      gameState?.phase,
      gameState?.pendingHumanAction,
      runNextTurnAction,
      unregisterStopAudio,
      isAudioGloballyEnabled,
    ],
  );

  // --- Define submitHumanAction similarly ---
  const submitHumanActionInternal = useCallback(async (payload: HumanActionPayload) => {
    setIsLoadingNextTurn(true); // Assume submission might trigger loading
    try {
      const result = await boundSubmitHumanAction(payload);
      // Update state if valid result
      if (result && !('error' in result)) {
        setGameState(result);
      }
      return result;
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unknown error" }; 
    } finally {
      setIsLoadingNextTurn(false);
    }
  }, [boundSubmitHumanAction]);

  const value: GameContextState = {
    gameState,
    setGameState, // Provide setter if direct manipulation is needed, though usually avoid
    isAutoRunning,
    toggleAutoRun,
    isLoadingNextTurn,
    setIsLoadingNextTurn,
    // Expose the internal functions with correct return types
    runNextTurnAction: runNextTurnAction, 
    stopCurrentAudio,
    // Expose registration functions for MessageBubble
    registerStopAudio,
    unregisterStopAudio,
    // Expose standard t function from react-i18next
    // t, // Removed
    // Add global audio state and toggle
    isAudioGloballyEnabled,
    toggleAudioGloballyEnabled,
    // Add the missing function
    reportAudioFinished,
    submitHumanAction: submitHumanActionInternal, // Expose the internal function
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

// Custom hook to use the context
export const useGameContext = (): GameContextState => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error("useGameContext must be used within a GameProvider");
  }
  // Ensure GameProvider is wrapped by SpokenTextProvider
  // We could add a check here in development if needed
  return context;
};

// Helper type for the registration part might be needed if context gets complex
// export type StopAudioRegistry = {
//     register: (messageId: string, stopFn: () => void) => void;
//     unregister: (messageId: string) => void;
//     stopCurrent: () => void;
// }

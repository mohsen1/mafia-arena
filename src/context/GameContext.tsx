import type { FilteredGameState } from "@/lib/types/game";
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
// Import translation utilities and types
// import type { LanguageCode, LanguageName } from "@/lib/translation/languages";
// import { mapLanguageNameToCode } from "@/lib/translation/languages";
// import { getOrGenerateTranslationsAction } from "@/app/actions/index";
// Import the standard hook
import { useTranslation } from "react-i18next";
import { useSpokenText } from "./SpokenTextContext"; // Import useSpokenText
import type { TFunction } from "i18next"; // Import TFunction directly
// Import GameState, ChatMessage, Player
// import { GameState, ChatMessage, Player } from "@/lib/types/game";

// Define the shape of the context state
interface GameContextState {
  gameState: FilteredGameState | null;
  setGameState: Dispatch<SetStateAction<FilteredGameState | null>>;
  isAutoRunning: boolean;
  toggleAutoRun: () => void;
  isLoadingNextTurn: boolean;
  setIsLoadingNextTurn: Dispatch<SetStateAction<boolean>>;
  runNextTurnAction: () => Promise<void>; // Function to trigger the server action
  stopCurrentAudio: () => void; // Function to stop whatever MessageBubble is playing
  registerStopAudio: (messageId: string, stopFn: () => void) => void;
  unregisterStopAudio: (messageId: string) => void;
  // Remove custom translation state fields
  // translations: Record<string, string>;
  // isTranslationLoading: boolean;
  // translationError: string | null;
  t: TFunction; // Use imported TFunction type
  // Add global audio state
  isAudioGloballyEnabled: boolean;
  toggleAudioGloballyEnabled: () => void;
  // Add the missing function type
  reportAudioFinished: (messageId: string) => void;
}

// Create the context with a default undefined value
const GameContext = createContext<GameContextState | undefined>(undefined);

// Define props for the provider
interface GameProviderProps {
  children: ReactNode;
  initialGameState: FilteredGameState;
  boundRunGameTurnAction: () => Promise<void>; // Pre-bound server action
}

// Create the provider component
export const GameProvider: React.FC<GameProviderProps> = ({
  children,
  initialGameState,
  boundRunGameTurnAction,
}) => {
  const [gameState, setGameState] = useState<FilteredGameState | null>(
    initialGameState,
  );
  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false);
  const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
  const stopAudioCallbackRef = useRef<(() => void) | null>(null); // Ref to hold the current stop function
  const [isAudioGloballyEnabled, setIsAudioGloballyEnabled] =
    useState<boolean>(false); // Default audio to off

  // --- Use standard useTranslation hook ---
  // Assuming the namespace used in the provider is 'translation'
  const { t, i18n } = useTranslation('translation');
  // --- End standard hook usage ---

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
  const unregisterStopAudio = useCallback(
    (/* messageId: string */) => {
      // Optional: Check messageId if needed, but generally clearing is fine
      stopAudioCallbackRef.current = null;
    },
    [],
  );

  const stopCurrentAudio = useCallback(() => {
    console.log(
      "[Context] Attempting to stop current audio via registered callback",
    );
    stopAudioCallbackRef.current?.(); // Call the registered stop function
    // No need to clear playing message ID here, let reportAudioFinished or unregister handle it?
    // Let's keep it for now, ensures state consistency if stop is called mid-play
    stopAudioCallbackRef.current = null; // Clear the callback ref
  }, []);

  // Toggle global audio enabled state
  const toggleAudioGloballyEnabled = useCallback(() => {
    setIsAudioGloballyEnabled((prev) => {
      const newState = !prev;
      console.log(
        `[Context] Global audio ${newState ? "enabled" : "disabled"}.`,
      );
      // If disabling audio, stop any currently playing sound
      if (!newState) {
        stopCurrentAudio();
      }
      return newState;
    });
  }, [stopCurrentAudio]);

  // --- Moved runNextTurnAction definition UP ---
  const runNextTurnAction = useCallback(async () => {
    if (gameState?.phase === "GameOver") {
      console.log("[Context] Game is over, skipping next turn action trigger.");
      if (isAutoRunning) {
        setIsAutoRunning(false);
      }
      return;
    }

    if (isLoadingNextTurn) {
      console.log("[Context] Next turn already loading, skipping.");
      return;
    }
    console.log("[Context] Running next turn action...");

    if (isAudioGloballyEnabled && spokenTextCurrentlySpeakingId) {
      stopCurrentAudio();
    }

    setIsLoadingNextTurn(true);
    try {
      await boundRunGameTurnAction();
      console.log("[Context] Next turn action triggered.");
    } catch (error) {
      console.error("[Context] Error running next turn action:", error);
    }
  }, [
    gameState?.phase,
    isAutoRunning,
    isLoadingNextTurn,
    boundRunGameTurnAction,
    stopCurrentAudio,
    isAudioGloballyEnabled,
    spokenTextCurrentlySpeakingId,
  ]);
  // --- End moved runNextTurnAction ---

  const toggleAutoRun = useCallback(() => {
    setIsAutoRunning((prev) => {
      const newState = !prev;
      console.log("[Context] Toggle AutoRun:", newState);
      if (!newState && spokenTextCurrentlySpeakingId) {
        console.log(
          `[Context toggleAutoRun] Pausing auto-run, stopping audio for ${spokenTextCurrentlySpeakingId}`,
        );
        stopCurrentAudio();
      }

      if (
        newState &&
        isAudioGloballyEnabled &&
        spokenTextCurrentlySpeakingId === null &&
        !isLoadingNextTurn &&
        gameState?.phase !== "GameOver"
      ) {
        console.log(
          "[Context toggleAutoRun] Kicking off first turn for autoplay with audio enabled.",
        );
        setTimeout(() => runNextTurnAction(), 0);
      }

      if (
        newState &&
        !isAudioGloballyEnabled &&
        !isLoadingNextTurn &&
        gameState?.phase !== "GameOver"
      ) {
        console.log(
          "[Context toggleAutoRun] Kicking off first turn for autoplay with audio disabled.",
        );
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
    console.log("[Context] Game state prop updated, updating context state.");
    setGameState(initialGameState);
    setIsLoadingNextTurn(false); // Assume new state means loading is finished
  }, [initialGameState]);

  // Effect to handle AUTOPLAY when IDLE (conditions depend on audio setting)
  useEffect(() => {
    // Condition 1: AutoRun ON, Audio OFF, Idle -> Run Next
    if (
      isAutoRunning &&
      !isAudioGloballyEnabled &&
      spokenTextCurrentlySpeakingId === null &&
      !isLoadingNextTurn
    ) {
      if (gameState?.phase !== "GameOver") {
        console.log(
          "[Context Effect Idle Check] AutoRun ON, Audio OFF, Idle -> Triggering next turn.",
        );
        const timeoutId = setTimeout(() => {
          // Double-check conditions after delay
          if (
            isAutoRunning &&
            !isAudioGloballyEnabled &&
            spokenTextCurrentlySpeakingId === null &&
            !isLoadingNextTurn &&
            gameState?.phase !== "GameOver"
          ) {
            runNextTurnAction();
          }
        }, 150); // Delay for audio disabled case
        return () => clearTimeout(timeoutId);
      }
    }
    // Dependencies: Check all conditions used
  }, [
    isAutoRunning,
    isAudioGloballyEnabled,
    spokenTextCurrentlySpeakingId,
    isLoadingNextTurn,
    runNextTurnAction,
    gameState?.phase,
  ]);

  // Function called by MessageBubble (via SpeakText onEnd) when audio finishes
  const reportAudioFinished = useCallback(
    (messageId: string) => {
      console.log(
        `[Context] Audio finished report for messageId: ${messageId}`,
      );

      const latestLogMessageId = gameState?.conversationLog?.[0]?.messageId;

      unregisterStopAudio(/* messageId: string */);

      if (
        isAutoRunning &&
        isAudioGloballyEnabled &&
        messageId === latestLogMessageId &&
        !isLoadingNextTurn
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
              gameState?.phase !== "GameOver"
            ) {
              console.log(
                "[Context reportAudioFinished] Running next turn after delay.",
              );
              runNextTurnAction();
            } else {
              // Log using the ref value for clarity
              console.log(
                `[Context reportAudioFinished] Conditions no longer met after delay (AutoRun: ${isAutoRunning}, AudioOn: ${isAudioGloballyEnabled}, SpeakingIDRef: ${spokenTextIdRef.current}, Loading: ${isLoadingNextTurn}, Phase: ${gameState?.phase})`,
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
          `[Context reportAudioFinished] Audio finished, but not proceeding to next turn (isAutoRunning: ${isAutoRunning}, isAudioEnabled: ${isAudioGloballyEnabled}, messageId: ${messageId}, isLatest: ${messageId === latestLogMessageId}, isLoading: ${isLoadingNextTurn})`,
        );
      }
    },
    [
      isAutoRunning,
      isLoadingNextTurn,
      gameState?.conversationLog,
      gameState?.phase,
      runNextTurnAction,
      unregisterStopAudio,
      isAudioGloballyEnabled,
    ],
  );

  const value: GameContextState = {
    gameState,
    setGameState, // Provide setter if direct manipulation is needed, though usually avoid
    isAutoRunning,
    toggleAutoRun,
    isLoadingNextTurn,
    setIsLoadingNextTurn,
    runNextTurnAction,
    stopCurrentAudio,
    // Expose registration functions for MessageBubble
    registerStopAudio,
    unregisterStopAudio,
    // Expose standard t function from react-i18next
    t,
    // Add global audio state and toggle
    isAudioGloballyEnabled,
    toggleAudioGloballyEnabled,
    // Add the missing function
    reportAudioFinished,
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

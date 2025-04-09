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
import type {
  Dispatch,
  SetStateAction,
  ReactNode,
} from "react";
// Import translation utilities and types
import type { LanguageCode, LanguageName } from "@/lib/translation/languages";
import {
  mapLanguageNameToCode,
} from "@/lib/translation/languages";
import { getOrGenerateTranslationsAction } from "@/app/actions/index";
import { useTranslation } from "@/hooks/useTranslation";
import { useSpokenText } from "./SpokenTextContext"; // Import useSpokenText
import { supportedLanguagesInfo } from "@/lib/translation/languages";

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
  // Add translation state and function
  translations: Record<string, string>;
  isTranslationLoading: boolean;
  translationError: string | null;
  t: (phraseKey: string, fallback?: string) => string;
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
  gameId: string;
  boundRunGameTurnAction: () => Promise<void>; // Pre-bound server action
}

// Create the provider component
export const GameProvider: React.FC<GameProviderProps> = ({
  children,
  initialGameState,
  gameId,
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

  // --- Translation State ---
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isTranslationLoading, setIsTranslationLoading] =
    useState<boolean>(true);
  const [translationError, setTranslationError] = useState<string | null>(null);
  // Determine language and code (ensure robust handling for null gameState)
  const gameLanguageName: LanguageName | null =
    (gameState?.language as LanguageName) || null;
  const gameLanguageCode: LanguageCode | null =
    (gameLanguageName ? mapLanguageNameToCode(gameLanguageName) : null) || null;
  // --- End Translation State ---

  // Get currently speaking ID from SpokenTextContext
  const { currentlySpeakingId: spokenTextCurrentlySpeakingId } =
    useSpokenText();

  // --- Ref to track the latest spoken text ID ---
  const spokenTextIdRef = useRef<string | null>(spokenTextCurrentlySpeakingId);
  useEffect(() => {
    spokenTextIdRef.current = spokenTextCurrentlySpeakingId;
  }, [spokenTextCurrentlySpeakingId]);
  // --- End Ref ---

  // --- Translation Loading Effect ---
  useEffect(() => {
    const loadTranslations = async () => {
      setTranslationError(null);
      // Use the derived code
      if (!gameLanguageCode) {
        console.error(
          `[GameContext] Cannot load translations: Language code is null (derived from: ${gameLanguageName})`,
        );
        // Decide default behavior: Empty translations or load English?
        // Loading English might be safer.
        try {
          console.warn(
            "[GameContext] Attempting to load English translations as fallback.",
          );
          const fallbackTranslations = await getOrGenerateTranslationsAction("en");
          setTranslations(fallbackTranslations);
        } catch (fallbackError) {
          console.error(
            "[GameContext] Failed loading fallback English translations:",
            fallbackError,
          );
          setTranslationError(
            `Invalid game language and failed to load fallback: ${gameLanguageName}`,
          );
          setTranslations({});
        } finally {
          setIsTranslationLoading(false);
        }
        return;
      }

      // Use derived name for logging using the map directly
      const targetLanguageName = supportedLanguagesInfo[gameLanguageCode]?.name; 
      console.log(
        `[GameContext] Language is ${targetLanguageName} (${gameLanguageCode}), loading translations...`,
      );
      setIsTranslationLoading(true);
      try {
        const loadedTranslations =
          await getOrGenerateTranslationsAction(gameLanguageCode);
        setTranslations(loadedTranslations);
        console.log(`[GameContext] Translations loaded for ${targetLanguageName}.`);
      } catch (error: unknown) {
        console.error(
          `[GameContext] Failed loading translations for ${targetLanguageName}:`,
          error,
        );
        // Extract error message safely
        const message =
          error instanceof Error ? error.message : "An unknown error occurred";
        setTranslationError(`Failed loading translations: ${message}`);
        setTranslations({});
      } finally {
        setIsTranslationLoading(false);
      }
    };

    // Load when code is available (derived from gameState)
    // If gameState is null initially, this effect might run when it becomes non-null
    loadTranslations();
    // Depend on the language code derived from gameState
  }, [gameLanguageCode, gameLanguageName]);
  // --- End Translation Loading Effect ---

  // Instantiate translation hook *within* the provider
  const { t } = useTranslation({
    translations: translations,
    // Pass the flag based on the current language code
    isSourceLanguage: gameLanguageCode === "en",
  });

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
  const unregisterStopAudio = useCallback((messageId: string) => {
    // Optional: Check messageId if needed, but generally clearing is fine
    stopAudioCallbackRef.current = null;
  }, []);

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

      unregisterStopAudio(messageId);

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
          const timeoutId = setTimeout(() => {
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
            '[Context reportAudioFinished] AutoRun ON, Audio ON: Game is over.'
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
    // Expose translation state and t function
    translations,
    isTranslationLoading,
    translationError,
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

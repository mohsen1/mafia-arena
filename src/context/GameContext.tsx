import { FilteredGameState } from '@/lib/types/game';
import React, { createContext, useState, useContext, useCallback, ReactNode, Dispatch, SetStateAction, useRef, useEffect } from 'react';
// Import translation utilities and types
import { 
    mapLanguageNameToCode, 
    LanguageCode, 
    LanguageName 
} from '@/lib/translation/languages';
import { getOrGenerateTranslationsAction } from '@/app/actions';
import { useTranslation } from '@/hooks/useTranslation';

// Define the shape of the context state
interface GameContextState {
    gameState: FilteredGameState | null;
    setGameState: Dispatch<SetStateAction<FilteredGameState | null>>;
    currentlyPlayingMessageId: string | null;
    setCurrentlyPlayingMessageId: Dispatch<SetStateAction<string | null>>;
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
    boundRunGameTurnAction
}) => {
    const [gameState, setGameState] = useState<FilteredGameState | null>(initialGameState);
    const [currentlyPlayingMessageId, setCurrentlyPlayingMessageId] = useState<string | null>(null);
    const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false); // Default to paused
    const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
    const stopAudioCallbackRef = useRef<(() => void) | null>(null); // Ref to hold the current stop function

    // --- Translation State ---
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [isTranslationLoading, setIsTranslationLoading] = useState<boolean>(true);
    const [translationError, setTranslationError] = useState<string | null>(null);
    const gameLanguage = gameState?.language || 'English'; // Default to English if state is null
    // --- End Translation State ---

    // --- Translation Loading Effect ---
    useEffect(() => {
        const loadTranslations = async () => {
            // Reset error, get code from game state language
            setTranslationError(null);
            const langCode = mapLanguageNameToCode(gameLanguage as LanguageName); // Assert type

            if (!langCode) {
                console.error(`[GameContext] Invalid language in game state: ${gameLanguage}`);
                setTranslationError(`Invalid game language: ${gameLanguage}`);
                setTranslations({});
                setIsTranslationLoading(false);
                return;
            }

            console.log(`[GameContext] Language is ${gameLanguage} (${langCode}), loading translations...`);
            setIsTranslationLoading(true);
            try {
                // Call server action
                const loadedTranslations = await getOrGenerateTranslationsAction(langCode);
                setTranslations(loadedTranslations);
                console.log(`[GameContext] Translations loaded for ${gameLanguage}.`);
            } catch (error: any) {
                console.error(`[GameContext] Failed loading translations for ${gameLanguage}:`, error);
                setTranslationError(`Failed loading translations: ${error.message}`);
                setTranslations({}); 
            } finally {
                setIsTranslationLoading(false);
            }
        };
        
        // Only load if gameState is available
        if (gameState) {
            loadTranslations();
        }
        // Rerun if gameLanguage changes (e.g., initial load or state update)
    }, [gameLanguage, gameState]); // Depend on gameLanguage derived from gameState
    // --- End Translation Loading Effect ---

    // Instantiate translation hook *within* the provider
    const { t } = useTranslation({
         translations: translations, 
         // Pass loading/error state if needed by consumers, but t works regardless
         // isLoading: isTranslationLoading,
         // error: translationError
    });

    // Function for MessageBubble to register its stop function
    const registerStopAudio = useCallback((messageId: string, stopFn: () => void) => {
        if (messageId === currentlyPlayingMessageId) {
            stopAudioCallbackRef.current = stopFn;
        }
    }, [currentlyPlayingMessageId]);

    // Function to be called by MessageBubble to clear the stop function
    const unregisterStopAudio = useCallback((messageId: string) => {
        // Optional: Check messageId if needed, but generally clearing is fine
        stopAudioCallbackRef.current = null;
    }, []);


    const stopCurrentAudio = useCallback(() => {
        console.log("[Context] Attempting to stop current audio");
        stopAudioCallbackRef.current?.(); // Call the registered stop function
        setCurrentlyPlayingMessageId(null); // Clear playing state
        stopAudioCallbackRef.current = null; // Clear the callback ref
    }, []);

    const toggleAutoRun = useCallback(() => {
        setIsAutoRunning(prev => {
            const newState = !prev;
            console.log("[Context] Toggle AutoRun:", newState);
            if (!newState && currentlyPlayingMessageId) {
                // If pausing and audio is playing, stop it
                 stopCurrentAudio();
            }
            return newState;
        });
    }, [currentlyPlayingMessageId, stopCurrentAudio]);


    const runNextTurnAction = useCallback(async () => {
        if (gameState?.phase === 'GameOver') {
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
        
        // Stop any currently playing audio before proceeding
        if (currentlyPlayingMessageId) {
             stopCurrentAudio();
        }

        setIsLoadingNextTurn(true);
        try {
            // We don't directly await server actions here, revalidation handles update
            await boundRunGameTurnAction();
            // Revalidation should trigger a state update via the GameClient useEffect
            // We might set loading false optimistically or wait for state update
            // Let's set it false after triggering, UI should update on revalidation
             console.log("[Context] Next turn action triggered.");
        } catch (error) {
            console.error("[Context] Error running next turn action:", error);
             // Handle error state if needed
        } finally {
             // Setting false here might be too early if revalidation takes time
             // Let GameClient handle setting it false when new state arrives
             // setIsLoadingNextTurn(false);
        }
    }, [gameState?.phase, isAutoRunning, isLoadingNextTurn, boundRunGameTurnAction, stopCurrentAudio, currentlyPlayingMessageId]);

    // Update context state if initialGameState prop changes (due to server revalidation)
     useEffect(() => {
         console.log("[Context] Game state prop updated, updating context state.");
         setGameState(initialGameState);
         setIsLoadingNextTurn(false); // Assume new state means loading is finished
     }, [initialGameState]);

    // Effect to handle resuming/kick-starting auto-run when idle
    useEffect(() => {
        // Check if auto-run is enabled, nothing is currently playing, and not already loading
        if (isAutoRunning && currentlyPlayingMessageId === null && !isLoadingNextTurn) {
             // Check if the game is actually over before trying to run next turn
             if (gameState?.phase !== 'GameOver') {
                console.log("[Context Effect Idle Check] AutoRun enabled and idle, triggering next turn.");
                // Add a small delay to prevent potential rapid loops
                const timeoutId = setTimeout(() => {
                    // Double-check conditions after delay, in case state changed rapidly
                    if (isAutoRunning && currentlyPlayingMessageId === null && !isLoadingNextTurn && gameState?.phase !== 'GameOver') {
                       runNextTurnAction();
                    }
                }, 150); // Slightly longer delay than before?
                return () => clearTimeout(timeoutId); // Cleanup timeout
             } else {
                  console.log("[Context Effect Idle Check] AutoRun enabled but game is over.");
                  // Optionally disable auto-run if game is over
                  // setIsAutoRunning(false);
             }
        }
    }, [isAutoRunning, currentlyPlayingMessageId, isLoadingNextTurn, runNextTurnAction, gameState?.phase]); // Dependencies ensure this runs when state becomes idle

    // --- NEW: Function called by MessageBubble when audio ends ---
    const reportAudioFinished = useCallback((messageId: string) => {
        console.log(`[Context] Audio finished report for messageId: ${messageId}`);

        // Identify the ID of the absolute latest message in the log
        const latestLogMessageId = gameState?.conversationLog && gameState.conversationLog.length > 0
            ? gameState.conversationLog[0].messageId // Log is reversed, [0] is newest
            : null;

        // Clear the currently playing ID *if* it matches the finished one
        let wasPlayingThisMessage = false;
        if (currentlyPlayingMessageId === messageId) {
            wasPlayingThisMessage = true;
            setCurrentlyPlayingMessageId(null); // Clear the playing ID
        }
        unregisterStopAudio(messageId); // Ensure stop callback is cleared regardless

        // Check if auto-run should proceed *specifically because this audio finished*
        // We only proceed if auto-running AND the message that just finished WAS the latest one.
        if (isAutoRunning && wasPlayingThisMessage && messageId === latestLogMessageId && !isLoadingNextTurn) {
             if (gameState?.phase !== 'GameOver') {
                console.log(`[Context reportAudioFinished] Autoplay enabled, finished latest message (${messageId}), triggering next turn.`);
                // Add a slight delay
                const timeoutId = setTimeout(() => {
                     // Re-check conditions after delay
                     if (isAutoRunning && currentlyPlayingMessageId === null && !isLoadingNextTurn && gameState?.phase !== 'GameOver') {
                         runNextTurnAction();
                     }
                }, 500); // Delay before next action after audio
                 // No cleanup needed for this specific timeout instance
             } else if (gameState?.phase === 'GameOver') {
                  console.log(`[Context reportAudioFinished] Autoplay: Game is over.`);
             }
        } else {
             console.log(`[Context reportAudioFinished] Audio finished, but not proceeding (isAutoRunning: ${isAutoRunning}, wasPlayingThis: ${wasPlayingThisMessage}, isLatest: ${messageId === latestLogMessageId}, isLoading: ${isLoadingNextTurn})`);
        }

    }, [
        isAutoRunning,
        isLoadingNextTurn,
        gameState?.conversationLog, 
        gameState?.phase,          
        runNextTurnAction,
        currentlyPlayingMessageId, // Need current value to compare
        setCurrentlyPlayingMessageId, 
        unregisterStopAudio
    ]);

    const value: GameContextState = {
        gameState,
        setGameState, // Provide setter if direct manipulation is needed, though usually avoid
        currentlyPlayingMessageId,
        setCurrentlyPlayingMessageId,
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
    };

    return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

// Custom hook to use the context
export const useGameContext = (): GameContextState => {
    const context = useContext(GameContext);
    if (context === undefined) {
        throw new Error('useGameContext must be used within a GameProvider');
    }
    return context;
};

// Helper type for the registration part might be needed if context gets complex
// export type StopAudioRegistry = {
//     register: (messageId: string, stopFn: () => void) => void;
//     unregister: (messageId: string) => void;
//     stopCurrent: () => void;
// }

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
import { useSpokenText } from './SpokenTextContext'; // Import useSpokenText

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
    boundRunGameTurnAction
}) => {
    const [gameState, setGameState] = useState<FilteredGameState | null>(initialGameState);
    const [isAutoRunning, setIsAutoRunning] = useState<boolean>(false); // Default to paused
    const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
    const stopAudioCallbackRef = useRef<(() => void) | null>(null); // Ref to hold the current stop function
    // Add global audio state
    const [isAudioGloballyEnabled, setIsAudioGloballyEnabled] = useState<boolean>(true);

    // --- Translation State ---
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [isTranslationLoading, setIsTranslationLoading] = useState<boolean>(true);
    const [translationError, setTranslationError] = useState<string | null>(null);
    const gameLanguage = gameState?.language || 'English'; // Default to English if state is null
    // --- End Translation State ---

    // Get currently speaking ID from SpokenTextContext
    const { currentlySpeakingId: spokenTextCurrentlySpeakingId } = useSpokenText();

    // --- Ref to track the latest spoken text ID --- 
    const spokenTextIdRef = useRef<string | null>(spokenTextCurrentlySpeakingId);
    useEffect(() => {
        spokenTextIdRef.current = spokenTextCurrentlySpeakingId;
    }, [spokenTextCurrentlySpeakingId]);
    // --- End Ref --- 

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
        if (messageId === spokenTextCurrentlySpeakingId) {
            stopAudioCallbackRef.current = stopFn;
        }
    }, [spokenTextCurrentlySpeakingId]);

    // Function to be called by MessageBubble to clear the stop function
    const unregisterStopAudio = useCallback((messageId: string) => {
        // Optional: Check messageId if needed, but generally clearing is fine
        stopAudioCallbackRef.current = null;
    }, []);


    const stopCurrentAudio = useCallback(() => {
        console.log("[Context] Attempting to stop current audio via registered callback");
        stopAudioCallbackRef.current?.(); // Call the registered stop function
        // No need to clear playing message ID here, let reportAudioFinished or unregister handle it?
        // Let's keep it for now, ensures state consistency if stop is called mid-play
        stopAudioCallbackRef.current = null; // Clear the callback ref
    }, []);

    // Toggle global audio enabled state
    const toggleAudioGloballyEnabled = useCallback(() => {
         setIsAudioGloballyEnabled(prev => {
             const newState = !prev;
             console.log(`[Context] Global audio ${newState ? 'enabled' : 'disabled'}.`);
             // If disabling audio, stop any currently playing sound
             if (!newState) {
                 stopCurrentAudio();
             }
             return newState;
         });
    }, [stopCurrentAudio]);

    // --- Moved runNextTurnAction definition UP --- 
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
        spokenTextCurrentlySpeakingId,
        isAudioGloballyEnabled
    ]);
    // --- End moved runNextTurnAction --- 

    const toggleAutoRun = useCallback(() => {
        setIsAutoRunning(prev => {
            const newState = !prev;
            console.log("[Context] Toggle AutoRun:", newState);
            if (!newState && spokenTextCurrentlySpeakingId) {
                console.log(`[Context toggleAutoRun] Pausing auto-run, stopping audio for ${spokenTextCurrentlySpeakingId}`);
                stopCurrentAudio();
            } 
            
            if (newState && isAudioGloballyEnabled && spokenTextCurrentlySpeakingId === null && !isLoadingNextTurn && gameState?.phase !== 'GameOver') {
                console.log("[Context toggleAutoRun] Kicking off first turn for autoplay with audio enabled.");
                setTimeout(() => runNextTurnAction(), 0); 
            }

            if (newState && !isAudioGloballyEnabled && !isLoadingNextTurn && gameState?.phase !== 'GameOver') {
                console.log("[Context toggleAutoRun] Kicking off first turn for autoplay with audio disabled.");
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
        spokenTextCurrentlySpeakingId
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
        if (isAutoRunning && !isAudioGloballyEnabled && spokenTextCurrentlySpeakingId === null && !isLoadingNextTurn) {
             if (gameState?.phase !== 'GameOver') {
                console.log("[Context Effect Idle Check] AutoRun ON, Audio OFF, Idle -> Triggering next turn.");
                const timeoutId = setTimeout(() => {
                    // Double-check conditions after delay
                    if (isAutoRunning && !isAudioGloballyEnabled && spokenTextCurrentlySpeakingId === null && !isLoadingNextTurn && gameState?.phase !== 'GameOver') {
                       runNextTurnAction();
                    }
                }, 150); // Delay for audio disabled case
                return () => clearTimeout(timeoutId);
             } else {
                  console.log("[Context Effect Idle Check] AutoRun ON, Audio OFF, but game is over.");
             }
        } else {
            // If Audio is ON, this effect should NOT trigger the next turn.
            // That responsibility shifts to reportAudioFinished.
            // Log if needed for debugging, but no action here for the audio ON case.
            // console.log(`[Context Effect Idle Check] Conditions not met for idle trigger (AutoRun: ${isAutoRunning}, AudioEnabled: ${isAudioGloballyEnabled}, PlayingID: ${currentlyPlayingMessageId}, Loading: ${isLoadingNextTurn})`);
        }
        // Dependencies: Check all conditions used
    }, [isAutoRunning, isAudioGloballyEnabled, spokenTextCurrentlySpeakingId, isLoadingNextTurn, runNextTurnAction, gameState?.phase]);

    // Function called by MessageBubble (via SpeakText onEnd) when audio finishes
    const reportAudioFinished = useCallback((messageId: string) => {
        console.log(`[Context] Audio finished report for messageId: ${messageId}`);

        const latestLogMessageId = gameState?.conversationLog?.[0]?.messageId;

        unregisterStopAudio(messageId); 

        if (isAutoRunning && isAudioGloballyEnabled && messageId === latestLogMessageId && !isLoadingNextTurn) {
             if (gameState?.phase !== 'GameOver') {
                console.log(`[Context reportAudioFinished] AutoRun ON, Audio ON, Finished latest message (${messageId}), scheduling next turn check.`);
                const timeoutId = setTimeout(() => {
                     // Re-check conditions using the REF for the speaking ID
                     if (isAutoRunning && isAudioGloballyEnabled && spokenTextIdRef.current === null && !isLoadingNextTurn && gameState?.phase !== 'GameOver') {
                         console.log('[Context reportAudioFinished] Running next turn after delay.');
                         runNextTurnAction();
                     } else {
                         // Log using the ref value for clarity
                         console.log(`[Context reportAudioFinished] Conditions no longer met after delay (AutoRun: ${isAutoRunning}, AudioOn: ${isAudioGloballyEnabled}, SpeakingIDRef: ${spokenTextIdRef.current}, Loading: ${isLoadingNextTurn}, Phase: ${gameState?.phase})`);
                     }
                }, 500); 
             } else {
                  console.log(`[Context reportAudioFinished] AutoRun ON, Audio ON: Game is over.`);
             }
        } else {
             console.log(`[Context reportAudioFinished] Audio finished, but not proceeding to next turn (isAutoRunning: ${isAutoRunning}, isAudioEnabled: ${isAudioGloballyEnabled}, messageId: ${messageId}, isLatest: ${messageId === latestLogMessageId}, isLoading: ${isLoadingNextTurn})`);
        }

    }, [
        isAutoRunning,
        isLoadingNextTurn,
        gameState?.conversationLog,
        gameState?.phase,
        runNextTurnAction,
        unregisterStopAudio,
        isAudioGloballyEnabled, 
        // We don't strictly need spokenTextCurrentlySpeakingId here anymore because we use the ref inside the timeout,
        // but keeping it won't hurt and might be useful if the outer logic changes.
        spokenTextCurrentlySpeakingId 
    ]);

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
        throw new Error('useGameContext must be used within a GameProvider');
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

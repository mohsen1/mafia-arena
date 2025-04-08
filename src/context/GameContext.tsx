import { FilteredGameState } from '@/lib/types/game';
import React, { createContext, useState, useContext, useCallback, ReactNode, Dispatch, SetStateAction, useRef, useEffect } from 'react';

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
    }, [isLoadingNextTurn, boundRunGameTurnAction, stopCurrentAudio, currentlyPlayingMessageId]);

    // Update context state if initialGameState prop changes (due to server revalidation)
     useEffect(() => {
         console.log("[Context] Game state prop updated, updating context state.");
         setGameState(initialGameState);
         setIsLoadingNextTurn(false); // Assume new state means loading is finished
     }, [initialGameState]);

    // Effect to handle resuming auto-run when toggled to play
    useEffect(() => {
        // Check if auto-run is enabled, nothing is currently playing, and not already loading
        if (isAutoRunning && currentlyPlayingMessageId === null && !isLoadingNextTurn) {
             // Check if the game is actually over before trying to run next turn
             if (gameState?.phase !== 'GameOver') {
                console.log("[Context Effect] AutoRun enabled and idle, triggering next turn.");
                // Add a small delay to prevent potential rapid loops if state updates are immediate
                const timeoutId = setTimeout(() => {
                    runNextTurnAction();
                }, 100); // Short delay
                return () => clearTimeout(timeoutId); // Cleanup timeout on dependency change
             } else {
                  console.log("[Context Effect] AutoRun enabled but game is over.");
                  // Optionally disable auto-run if game is over
                  // setIsAutoRunning(false);
             }
        }
    }, [isAutoRunning, currentlyPlayingMessageId, isLoadingNextTurn, runNextTurnAction, gameState?.phase]); // Dependencies

    const value = {
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

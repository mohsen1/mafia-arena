import type React from 'react';
import {
  createContext,
  useState,
  useContext,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';

export interface GameContextType {
  gameState: FilteredGameState | null;
  isLoadingNextTurn: boolean;
  isAutoRunning: boolean;
  isAudioGloballyEnabled: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;
  clearError: () => void;
  runNextTurn: () => void;
  toggleAutoRun: () => void;
  submitHumanAction: (
    payload: HumanActionPayload
  ) => Promise<FilteredGameState | { error: string }>;
  announceText: (
    messageId: string,
    text: string,
    onFinished?: () => void
  ) => void;
  reportAudioFinished: (messageId: string) => void;
  toggleGlobalAudio: () => void;
  gameSpeed: number;
  setGameSpeed: (speed: number) => void;
}

interface GameContextState {
  gameState: FilteredGameState | null;
  setGameState: Dispatch<SetStateAction<FilteredGameState | null>>;
  isAutoRunning: boolean;
  toggleAutoRun: () => void;
  isLoadingNextTurn: boolean;
  setIsLoadingNextTurn: Dispatch<SetStateAction<boolean>>;
  runNextTurnAction: () => Promise<FilteredGameState | { error: string }>;
  stopCurrentAudio: () => void;
  registerStopAudio: (messageId: string, stopFn: () => void) => void;
  unregisterStopAudio: () => void;
  isAudioGloballyEnabled: boolean;
  toggleAudioGloballyEnabled: () => void;
  reportAudioFinished: (messageId: string) => void;
  submitHumanAction: (
    payload: HumanActionPayload
  ) => Promise<FilteredGameState | { error: string }>;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;
  clearError: () => void;
  runNextTurn: () => void;
  toggleGlobalAudio: () => void;
  gameSpeed: number;
  setGameSpeed: (speed: number) => void;
}

const GameContext = createContext<GameContextState | undefined>(undefined);

interface GameProviderProps {
  children: ReactNode;
  initialGameState: FilteredGameState;
  boundRunGameTurnAction: () => Promise<FilteredGameState | { error: string }>;
  boundSubmitHumanAction: (
    payload: HumanActionPayload
  ) => Promise<FilteredGameState | { error: string }>;
}

// Create the provider component
export const GameProvider: React.FC<GameProviderProps> = ({
  children,
  initialGameState,
  boundRunGameTurnAction,
  boundSubmitHumanAction,
}) => {
  const [gameState, setGameState] = useState<FilteredGameState | null>(
    initialGameState || null
  );
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const [isAudioGloballyEnabled, setIsAudioGloballyEnabled] = useState(() => {
    console.log('[GameContext] Voice mode initialization:', {
      initialGameStateVoiceMode: initialGameState?.voiceModeEnabled,
      gameId: initialGameState?.id,
    });
    
    // Proper implementation: Initialize from game state
    return initialGameState?.voiceModeEnabled ?? false;
  });

  // Initialize audio state from game state
  useEffect(() => {
    if (gameState?.voiceModeEnabled !== undefined) {
      console.log('[GameContext] Updating audio state from game state:', {
        voiceModeEnabled: gameState.voiceModeEnabled,
        currentAudioState: isAudioGloballyEnabled,
      });
      setIsAudioGloballyEnabled(gameState.voiceModeEnabled);
    }
  }, [gameState?.voiceModeEnabled]);

  const updateGameState = useCallback((newState: FilteredGameState) => {
    console.log('[GameContext] updateGameState called:', {
      gameId: newState.id,
      phase: newState.phase,
      round: newState.round,
      messageCount: newState.log?.length || 0,
      voiceModeEnabled: newState.voiceModeEnabled,
    });
    setGameState(newState);
  }, []);

  const toggleGlobalAudio = useCallback(() => {
    console.log('[GameContext] toggleGlobalAudio called, current state:', isAudioGloballyEnabled);
    setIsAudioGloballyEnabled((prev) => {
      const newState = !prev;
      console.log('[GameContext] Audio state changing to:', newState);
      return newState;
    });
  }, [isAudioGloballyEnabled]);

  const toggleAutoRun = useCallback(() => {
    console.log('[GameContext] toggleAutoRun called, current state:', isAutoRunning);
    setIsAutoRunning((prev) => !prev);
  }, [isAutoRunning]);

  const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
  const stopAudioCallbackRef = useRef<(() => void) | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameSpeed, setGameSpeed] = useState<number>(1);

  // Track if audio is currently playing (we'll update this from reportAudioFinished)
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);

  const timestamp = () => new Date().toISOString().split('T')[1].split('.')[0];
  
  console.log(`[GameContext] ${timestamp()} Provider render:`, {
    hasGameState: !!gameState,
    gameId: gameState?.id,
    voiceModeEnabled: gameState?.voiceModeEnabled,
    isAudioGloballyEnabled,
    isAutoRunning,
    isAudioPlaying,
  });

  const registerStopAudio = useCallback(
    (messageId: string, stopFn: () => void) => {
      console.log(`[GameContext] ${timestamp()} 🎵 REGISTER audio:`, {
        messageId,
        wasPlaying: isAudioPlaying,
        previousCallback: !!stopAudioCallbackRef.current,
      });
      stopAudioCallbackRef.current = stopFn;
      setIsAudioPlaying(true);
    },
    []
  );

  const unregisterStopAudio = useCallback(() => {
    console.log(`[GameContext] ${timestamp()} 🎵 UNREGISTER audio:`, {
      wasPlaying: isAudioPlaying,
      hadCallback: !!stopAudioCallbackRef.current,
    });
    stopAudioCallbackRef.current = null;
    setIsAudioPlaying(false);
  }, []);

  const stopCurrentAudio = useCallback(() => {
    stopAudioCallbackRef.current?.();
    stopAudioCallbackRef.current = null;
    setIsAudioPlaying(false);
  }, []);

  const toggleAudioGloballyEnabled = useCallback(() => {
    setIsAudioGloballyEnabled((prev) => {
      const newState = !prev;
      if (!newState) {
        stopCurrentAudio();
      }
      return newState;
    });
  }, [stopCurrentAudio]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const runNextTurnAction = useCallback(async () => {
    setIsLoadingNextTurn(true);
    setIsSaving(true);
    setError(null);
    try {
      const result = await boundRunGameTurnAction();
      if (result && 'error' in result) {
        setError(result.error);
      } else if (result) {
        setGameState(result);
        setLastSaved(new Date());
      }
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
      return { error: errorMessage };
    } finally {
      setIsLoadingNextTurn(false);
      setIsSaving(false);
    }
  }, [boundRunGameTurnAction]);

  useEffect(() => {
    setGameState(initialGameState);
  }, [initialGameState]);

  // Auto-run logic when audio is enabled: wait for audio to finish before next turn
  useEffect(() => {
    if (
      isAutoRunning &&
      isAudioGloballyEnabled &&
      !isAudioPlaying &&
      !isLoadingNextTurn &&
      gameState &&
      !gameState.pendingHumanAction &&
      gameState.phase !== 'GameOver'
    ) {
      const timerId = setTimeout(() => {
        if (
          isAutoRunning &&
          isAudioGloballyEnabled &&
          !isAudioPlaying &&
          !isLoadingNextTurn &&
          gameState &&
          !gameState.pendingHumanAction &&
          gameState.phase !== 'GameOver'
        ) {
          runNextTurnAction();
        }
      }, 500 / gameSpeed);
      return () => clearTimeout(timerId);
    }
  }, [
    isAutoRunning,
    isAudioGloballyEnabled,
    isAudioPlaying,
    isLoadingNextTurn,
    gameState,
    runNextTurnAction,
    gameSpeed,
  ]);

  // Auto-run logic when audio is disabled: run with simulated reading delay
  useEffect(() => {
    if (
      isAutoRunning &&
      !isAudioGloballyEnabled &&
      !isLoadingNextTurn &&
      gameState &&
      !gameState.pendingHumanAction &&
      gameState.phase !== 'GameOver'
    ) {
      const timerId = setTimeout(() => {
        if (
          isAutoRunning &&
          !isAudioGloballyEnabled &&
          !isLoadingNextTurn &&
          gameState &&
          !gameState.pendingHumanAction &&
          gameState.phase !== 'GameOver'
        ) {
          runNextTurnAction();
        }
      }, 1500 / gameSpeed);
      return () => clearTimeout(timerId);
    }
  }, [
    isAutoRunning,
    isAudioGloballyEnabled,
    isLoadingNextTurn,
    gameState,
    runNextTurnAction,
    gameSpeed,
  ]);

  const reportAudioFinished = useCallback(
    (messageId: string) => {
      const latestLogMessage = gameState?.log?.[0];
      const isLatestMessage =
        latestLogMessage && messageId === latestLogMessage.timestamp;

      console.log(`[GameContext] ${timestamp()} 🎵 AUDIO FINISHED:`, {
        messageId,
        latestMessageId: latestLogMessage?.timestamp,
        isLatestMessage,
        isAutoRunning,
        isAudioGloballyEnabled,
        isLoadingNextTurn,
        pendingHumanAction: gameState?.pendingHumanAction,
        phase: gameState?.phase,
        isAudioPlaying,
      });

      unregisterStopAudio();

      if (
        isAutoRunning &&
        isAudioGloballyEnabled &&
        isLatestMessage &&
        !isLoadingNextTurn &&
        !gameState?.pendingHumanAction
      ) {
        if (gameState?.phase !== 'GameOver') {
          console.log(`[GameContext] ${timestamp()} ⏰ SCHEDULING next turn in 500ms...`);
          setTimeout(() => {
            // Re-check conditions
            if (
              isAutoRunning &&
              isAudioGloballyEnabled &&
              !isAudioPlaying &&
              !isLoadingNextTurn &&
              !gameState?.pendingHumanAction &&
              gameState?.phase !== 'GameOver'
            ) {
              console.log(`[GameContext] ${timestamp()} ▶️ TRIGGERING next turn after audio`);
              runNextTurnAction();
            } else {
              console.log(`[GameContext] ${timestamp()} ❌ SKIPPED next turn - conditions changed:`, {
                isAutoRunning,
                isAudioGloballyEnabled,
                isAudioPlaying,
                isLoadingNextTurn,
                pendingHumanAction: gameState?.pendingHumanAction,
                phase: gameState?.phase,
              });
            }
          }, 500);
        } else {
          console.log(`[GameContext] ${timestamp()} 🏁 Game over, no next turn`);
        }
      } else {
        console.log(`[GameContext] ${timestamp()} ⏸️ NOT scheduling next turn:`, {
          autoRunning: isAutoRunning,
          audioEnabled: isAudioGloballyEnabled,
          isLatest: isLatestMessage,
          loading: isLoadingNextTurn,
          pendingAction: gameState?.pendingHumanAction,
        });
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
      isAudioPlaying,
    ]
  );

  const submitHumanActionInternal = useCallback(
    async (payload: HumanActionPayload) => {
      setIsLoadingNextTurn(true);
      setIsSaving(true);
      setError(null);
      try {
        const result = await boundSubmitHumanAction(payload);
        if (result && 'error' in result) {
          setError(result.error);
        } else if (result) {
          setGameState(result);
          setLastSaved(new Date());
        }
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        setError(errorMessage);
        return { error: errorMessage };
      } finally {
        setIsLoadingNextTurn(false);
        setIsSaving(false);
      }
    },
    [boundSubmitHumanAction]
  );

  const value: GameContextState = {
    gameState,
    setGameState,
    isAutoRunning,
    toggleAutoRun,
    isLoadingNextTurn,
    setIsLoadingNextTurn,
    runNextTurnAction,
    stopCurrentAudio,
    registerStopAudio,
    unregisterStopAudio,
    isAudioGloballyEnabled,
    toggleAudioGloballyEnabled,
    reportAudioFinished,
    submitHumanAction: submitHumanActionInternal,
    isSaving,
    lastSaved,
    error,
    clearError,
    runNextTurn: runNextTurnAction,
    toggleGlobalAudio: toggleAudioGloballyEnabled,
    gameSpeed,
    setGameSpeed,
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



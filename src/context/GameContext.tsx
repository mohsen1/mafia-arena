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
import { useSpokenText } from './SpokenTextContext';
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
  unregisterStopAudio: (messageId: string) => void;
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
    initialGameState
  );

  // Auto-enable auto-run for AI-only games (Issue #49)
  const shouldAutoEnableAutoRun = useMemo(() => {
    return initialGameState && !initialGameState.humanPlayerId;
  }, [initialGameState]);

  const [isAutoRunning, setIsAutoRunning] = useState<boolean>(
    shouldAutoEnableAutoRun
  );
  const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
  const stopAudioCallbackRef = useRef<(() => void) | null>(null);
  const [isAudioGloballyEnabled, setIsAudioGloballyEnabled] =
    useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { currentlySpeakingId: spokenTextCurrentlySpeakingId } =
    useSpokenText();

  // Track the latest spoken text ID to avoid stale closures in setTimeout callbacks
  const spokenTextIdRef = useRef<string | null>(spokenTextCurrentlySpeakingId);
  useEffect(() => {
    spokenTextIdRef.current = spokenTextCurrentlySpeakingId;
  }, [spokenTextCurrentlySpeakingId]);

  const registerStopAudio = useCallback(
    (messageId: string, stopFn: () => void) => {
      if (messageId === spokenTextCurrentlySpeakingId) {
        stopAudioCallbackRef.current = stopFn;
      }
    },
    [spokenTextCurrentlySpeakingId]
  );

  const unregisterStopAudio = useCallback(() => {
    stopAudioCallbackRef.current = null;
  }, []);

  const stopCurrentAudio = useCallback(() => {
    stopAudioCallbackRef.current?.();
    stopAudioCallbackRef.current = null;
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
        gameState?.phase !== 'GameOver'
      ) {
        setTimeout(() => runNextTurnAction(), 0);
      }

      if (
        newState &&
        !isAudioGloballyEnabled &&
        !isLoadingNextTurn &&
        gameState?.phase !== 'GameOver'
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

  useEffect(() => {
    setGameState(initialGameState);
  }, [initialGameState]);

  // Auto-run logic when audio is enabled: wait for audio to finish before next turn
  useEffect(() => {
    if (
      isAutoRunning &&
      isAudioGloballyEnabled &&
      spokenTextCurrentlySpeakingId === null &&
      !isLoadingNextTurn &&
      gameState &&
      !gameState.pendingHumanAction &&
      gameState.phase !== 'GameOver'
    ) {
      const timerId = setTimeout(() => {
        if (
          isAutoRunning &&
          isAudioGloballyEnabled &&
          spokenTextCurrentlySpeakingId === null &&
          !isLoadingNextTurn &&
          gameState &&
          !gameState.pendingHumanAction &&
          gameState.phase !== 'GameOver'
        ) {
          runNextTurnAction();
        }
      }, 500);
      return () => clearTimeout(timerId);
    }
  }, [
    isAutoRunning,
    isAudioGloballyEnabled,
    spokenTextCurrentlySpeakingId,
    isLoadingNextTurn,
    gameState,
    runNextTurnAction,
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
      }, 1500);
      return () => clearTimeout(timerId);
    }
  }, [
    isAutoRunning,
    isAudioGloballyEnabled,
    isLoadingNextTurn,
    gameState,
    runNextTurnAction,
  ]);

  const reportAudioFinished = useCallback(
    (messageId: string) => {
      const latestLogMessage = gameState?.log?.[0];
      const isLatestMessage =
        latestLogMessage && messageId === latestLogMessage.timestamp;

      unregisterStopAudio();

      if (
        isAutoRunning &&
        isAudioGloballyEnabled &&
        isLatestMessage &&
        !isLoadingNextTurn &&
        !gameState?.pendingHumanAction
      ) {
        if (gameState?.phase !== 'GameOver') {
          setTimeout(() => {
            // Re-check conditions using ref to avoid stale closure issues
            if (
              isAutoRunning &&
              isAudioGloballyEnabled &&
              spokenTextIdRef.current === null &&
              !isLoadingNextTurn &&
              !gameState?.pendingHumanAction &&
              gameState?.phase !== 'GameOver'
            ) {
              runNextTurnAction();
            }
          }, 500);
        }
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

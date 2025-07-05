import type React from 'react';
import {
  createContext,
  useState,
  useContext,
  useCallback,
  useEffect,
} from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import { useSpokenText } from './SpokenTextContext';

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
  isAudioGloballyEnabled: boolean;
  toggleAudioGloballyEnabled: () => void;
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
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameSpeed, setGameSpeed] = useState<number>(1);

  // Consume audio status from SpokenTextContext
  const { currentlySpeakingId, resetAudio } = useSpokenText();
  const isAudioPlaying = currentlySpeakingId !== null;

  const timestamp = () => new Date().toISOString().split('T')[1].split('.')[0];
  
  console.log(`[GameContext] ${timestamp()} Provider render:`, {
    hasGameState: !!gameState,
    gameId: gameState?.id,
    voiceModeEnabled: gameState?.voiceModeEnabled,
    isAudioGloballyEnabled,
    isAutoRunning,
    isAudioPlaying,
  });

  const toggleAudioGloballyEnabled = useCallback(() => {
    setIsAudioGloballyEnabled((prev) => {
      const newState = !prev;
      if (!newState) {
        // If disabling audio globally, ensure any current audio stops via SpokenTextContext
        resetAudio();
      }
      return newState;
    });
  }, [resetAudio]);

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

  // Unified auto-run logic depending on audio playing status and global settings
  useEffect(() => {
    const shouldRun =
      isAutoRunning &&
      !isLoadingNextTurn &&
      gameState &&
      !gameState.pendingHumanAction &&
      gameState.phase !== 'GameOver' &&
      !isAudioPlaying;

    if (!shouldRun) return;

    // Delay depends on whether voice mode is enabled (shorter delay when voice just finished)
    const delay = isAudioGloballyEnabled ? 500 : 1500;

    const timerId = setTimeout(() => {
      const stillValid =
        isAutoRunning &&
        !isLoadingNextTurn &&
        gameState &&
        !gameState.pendingHumanAction &&
        gameState.phase !== 'GameOver' &&
        !currentlySpeakingId; // ensure no new audio started

      if (stillValid) {
        runNextTurnAction();
      }
    }, delay / gameSpeed);

    return () => clearTimeout(timerId);
  }, [
    isAutoRunning,
    isLoadingNextTurn,
    gameState,
    runNextTurnAction,
    gameSpeed,
    isAudioPlaying,
    isAudioGloballyEnabled,
    currentlySpeakingId,
  ]);

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
    isAudioGloballyEnabled,
    toggleAudioGloballyEnabled,
    submitHumanAction: submitHumanActionInternal,
    isSaving,
    lastSaved,
    error,
    clearError,
    runNextTurn: runNextTurnAction,
    toggleGlobalAudio,
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



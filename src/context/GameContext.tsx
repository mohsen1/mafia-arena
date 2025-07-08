'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  useRef,
} from 'react';

import type { FilteredGameState } from '@/lib/interfaces/gameState.types';
import type { HumanActionPayload } from '@/lib/interfaces/actions.types';
import { addAudioBreadcrumb } from '@/components/AudioDebugOverlay';

// Add comprehensive logging helper
const PHASE_LOG_PREFIX = '[GameContext Phase]';
const log = (phase: string, details: any) => {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  console.log(
    `${PHASE_LOG_PREFIX} ${timestamp} ${phase}: ${JSON.stringify(details)}`
  );
};

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
  runNextTurnAction: () => void;
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
  // Add audio tracking methods
  registerAudioPlayback: (messageId: string) => void;
  reportAudioFinished: (messageId: string) => void;
  activeAudioCount: number;
}

// Removed - now using GameContextType directly

const GameContext = createContext<GameContextType | undefined>(undefined);

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
  const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameSpeed, setGameSpeed] = useState<number>(1);
  const [activeAudioCount, setActiveAudioCount] = useState(0);

  // Initialize audio state from game state
  useEffect(() => {
    if (gameState?.voiceModeEnabled !== undefined) {
      console.log('[GameContext] Updating audio state from game state:', {
        voiceModeEnabled: gameState.voiceModeEnabled,
        currentAudioState: isAudioGloballyEnabled,
      });
      setIsAudioGloballyEnabled(gameState.voiceModeEnabled);
    }
  }, [gameState?.voiceModeEnabled, isAudioGloballyEnabled]);

  const toggleGlobalAudio = useCallback(() => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c[GameContext] ${timestamp} 🔊 TOGGLE GLOBAL AUDIO`,
      'color: #e74c3c; font-weight: bold',
      {
        currentState: isAudioGloballyEnabled,
        gamePhase: gameState?.phase,
        voiceModeEnabled: gameState?.voiceModeEnabled,
      }
    );

    setIsAudioGloballyEnabled((prev) => {
      const newState = !prev;
      console.log(
        `%c[GameContext] ${timestamp} ${newState ? '🔊 UNMUTED' : '🔇 MUTED'}`,
        `color: ${newState ? '#27ae60' : '#e74c3c'}; font-weight: bold`,
        {
          previousState: prev,
          newState,
          action: newState
            ? 'Audio enabled - new messages will have voice'
            : 'Audio muted - audio will be stopped by components',
        }
      );

      return newState;
    });
  }, [isAudioGloballyEnabled, gameState?.phase, gameState?.voiceModeEnabled]);

  const toggleAutoRun = useCallback(() => {
    console.log(
      '[GameContext] toggleAutoRun called, current state:',
      isAutoRunning
    );
    setIsAutoRunning((prev) => !prev);
  }, [isAutoRunning]);

  const timestamp = () => new Date().toISOString().split('T')[1].split('.')[0];

  console.log(`[GameContext] ${timestamp()} Provider render:`, {
    hasGameState: !!gameState,
    gameId: gameState?.id,
    voiceModeEnabled: gameState?.voiceModeEnabled,
    isAudioGloballyEnabled,
    isAutoRunning,
  });

  // Removed - using toggleGlobalAudio instead

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Audio management methods
  const registerAudioPlayback = useCallback((messageId: string) => {
    setActiveAudioCount((prev) => {
      const newCount = prev + 1;
      addAudioBreadcrumb(`Registering audio for message: ${messageId}`, {
        previousCount: prev,
        newCount,
      });
      console.log('[GameContext] Audio registered:', {
        messageId,
        activeAudioCount: newCount,
      });
      return newCount;
    });
  }, []);

  const reportAudioFinished = useCallback((messageId: string) => {
    setActiveAudioCount((prev) => {
      const newCount = Math.max(0, prev - 1);
      addAudioBreadcrumb(`Audio finished for message: ${messageId}`, {
        previousCount: prev,
        newCount,
      });
      console.log('[GameContext] Audio finished:', {
        messageId,
        activeAudioCount: newCount,
      });
      return newCount;
    });
  }, []);

  const runNextTurnAction = useCallback(async () => {
    const oldPhase = gameState?.phase;
    const oldRound = gameState?.round;

    log('🚀 PHASE TRANSITION START', {
      currentPhase: oldPhase,
      round: oldRound,
      isAutoRunning,
    });

    setIsLoadingNextTurn(true);
    setIsSaving(true);
    setError(null);
    try {
      const result = await boundRunGameTurnAction();

      // Enhanced error logging to diagnose structure issues
      if (result && typeof result === 'object') {
        log('📦 PHASE TRANSITION RESULT STRUCTURE', {
          hasError: 'error' in result,
          keys: Object.keys(result),
          playersType:
            'error' in result
              ? 'N/A'
              : Array.isArray((result as FilteredGameState).players)
                ? 'array'
                : typeof (result as FilteredGameState).players,
          playersValue:
            'error' in result ? 'N/A' : (result as FilteredGameState).players,
          resultSample: JSON.stringify(result).substring(0, 200) + '...',
        });
      }

      if (result && 'error' in result) {
        log('❌ PHASE TRANSITION ERROR', {
          error: result.error,
          phase: oldPhase,
          resultType: typeof result,
          resultKeys: Object.keys(result),
        });
        setError(result.error);
      } else if (result && !('error' in result)) {
        const phaseChanged = result.phase !== oldPhase;
        const roundChanged = result.round !== oldRound;

        log('✅ PHASE TRANSITION SUCCESS', {
          oldPhase,
          newPhase: result.phase,
          phaseChanged,
          oldRound,
          newRound: result.round,
          roundChanged,
          livingPlayersCount: Object.values(result.players).filter(
            (p: any) => p.status === 'Alive'
          ).length,
          winner: result.winner,
          winCondition: result.winCondition,
          gamePhase: result.phase,
          messagesAdded:
            (result.log?.length || 0) - (gameState?.log?.length || 0),
        });

        setGameState(result);
        setLastSaved(new Date());

        if (result.phase === 'GameOver') {
          setIsAutoRunning(false);
          log('🏁 GAME ENDED', {
            winner: result.winner,
            phase: result.phase,
          });
        }
      }
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      log('❌ PHASE TRANSITION EXCEPTION', {
        error: errorMessage,
        phase: oldPhase,
      });
      setError(errorMessage);
      return { error: errorMessage };
    } finally {
      setIsLoadingNextTurn(false);
      setIsSaving(false);
    }
  }, [boundRunGameTurnAction, gameState, isAutoRunning]);

  useEffect(() => {
    setGameState(initialGameState);
  }, [initialGameState]);

  // Submit human action
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

  // Audio state
  const autoRunSpeed = 5000; // Fixed speed for auto-run
  const audioStopCallbacksRef = useRef<Set<() => void>>(new Set());

  // Enhanced audio logging
  const logAudio = (action: string, details: any) => {
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c🎮 [GameContext/Audio] ${timestamp} ${action}`,
      'color: #e74c3c; font-weight: bold',
      details
    );
  };

  // Log audio state changes
  React.useEffect(() => {
    logAudio('AUDIO_STATE_CHANGED', {
      isAudioGloballyEnabled,
      currentGameState: gameState?.phase,
      humanPlayerId: gameState?.humanPlayerId,
    });
  }, [isAudioGloballyEnabled, gameState?.phase, gameState?.humanPlayerId]);

  // Enhanced auto-run effect with audio awareness
  useEffect(() => {
    if (!isAutoRunning || !gameState || 'error' in gameState) {
      if (!isAutoRunning) {
        logAudio('AUTO_RUN_DISABLED', {
          reason: 'autoRun is false',
          gamePhase:
            gameState && 'phase' in gameState ? gameState.phase : undefined,
        });
      }
      if (gameState && 'error' in gameState) {
        logAudio('AUTO_RUN_SKIP', {
          reason: 'Game state has error',
          error: gameState.error,
        });
      }
      return;
    }

    // Check game state validity and log appropriately
    if (!gameState || gameState === null) {
      logAudio('AUTO_RUN_SKIP', {
        reason: 'No game state',
      });
      return;
    }

    logAudio('AUTO_RUN_CHECK', {
      autoRun: isAutoRunning,
      autoRunSpeed,
      currentPhase: gameState.phase,
      hasHumanPlayer: !!gameState.humanPlayerId,
      pendingHumanAction: !!gameState.pendingHumanAction,
      isGameOver: gameState.phase === 'GameOver',
      activeAudioCount, // Add audio count to logs
    });

    // Don't auto-run if:
    // 1. Game is over
    if (gameState.phase === 'GameOver') {
      logAudio('AUTO_RUN_SKIP', {
        reason: 'Game is over',
        winCondition: gameState.winCondition,
      });
      return;
    }

    // 2. Human has pending action
    if (gameState.pendingHumanAction) {
      logAudio('AUTO_RUN_SKIP', {
        reason: 'Human has pending action',
        prompt: gameState.pendingHumanAction.prompt,
      });
      return;
    }

    // 3. Character generation phase
    if (gameState.phase === 'CharacterGeneration') {
      logAudio('AUTO_RUN_SKIP', {
        reason: 'Character generation phase',
      });
      return;
    }

    // 4. Audio is still playing - NEW CHECK
    if (activeAudioCount > 0) {
      addAudioBreadcrumb('Auto-run paused, waiting for audio to finish', {
        activeAudioCount,
      });
      logAudio('AUTO_RUN_PAUSED', {
        reason: 'Waiting for audio to finish',
        activeAudioCount,
      });
      return;
    }

    logAudio('AUTO_RUN_SCHEDULING', {
      delayMs: 500, // Short delay after audio finishes
      phase: gameState.phase,
      round: gameState.round,
      alivePlayers: Object.values(gameState.players).filter(
        (p: any) => p.status === 'Alive'
      ).length,
      activeAudioCount,
    });

    const timer = setTimeout(() => {
      // Stop all audio before running next turn
      logAudio('AUTO_RUN_STOPPING_AUDIO', {
        activeAudioCount: audioStopCallbacksRef.current.size,
        callbacks: Array.from(audioStopCallbacksRef.current).length,
      });

      audioStopCallbacksRef.current.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error('[GameContext] Error stopping audio:', error);
        }
      });
      audioStopCallbacksRef.current.clear();

      logAudio('AUTO_RUN_EXECUTING', {
        phase: gameState.phase,
        round: gameState.round,
        timestamp: Date.now(),
      });

      runNextTurnAction();
    }, 500); // Short delay after audio finishes

    return () => {
      logAudio('AUTO_RUN_CLEANUP', {
        reason: 'Effect cleanup',
        hadTimer: true,
      });
      clearTimeout(timer);
    };
  }, [
    isAutoRunning,
    autoRunSpeed,
    gameState,
    runNextTurnAction,
    activeAudioCount,
  ]); // Add activeAudioCount as dependency

  // Removed unused audio callback functions

  // Stub for announceText - can be implemented later if needed
  const announceText = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_messageId: string, _text: string, _onFinished?: () => void) => {
      // Placeholder implementation
    },
    []
  );

  const value: GameContextType = {
    gameState,
    isAutoRunning,
    toggleAutoRun,
    isLoadingNextTurn,
    isAudioGloballyEnabled,
    submitHumanAction: submitHumanActionInternal,
    isSaving,
    lastSaved,
    error,
    clearError,
    runNextTurn: runNextTurnAction,
    runNextTurnAction,
    toggleGlobalAudio,
    gameSpeed,
    setGameSpeed,
    registerAudioPlayback,
    reportAudioFinished,
    activeAudioCount,
    announceText,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

// Custom hook to use the context
export const useGameContext = (): GameContextType => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGameContext must be used within a GameProvider');
  }
  return context;
};

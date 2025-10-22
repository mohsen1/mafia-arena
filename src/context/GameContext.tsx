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
  gameSpeed: number;
  setGameSpeed: (speed: number) => void;
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
  const [isLoadingNextTurn, setIsLoadingNextTurn] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameSpeed, setGameSpeed] = useState<number>(1);


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
    isAutoRunning,
  });

  // Removed - using toggleGlobalAudio instead

  const clearError = useCallback(() => {
    setError(null);
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

  // Auto-run configuration
  const autoRunSpeed = 5000; // Fixed speed for auto-run

  // Auto-run effect
  useEffect(() => {
    if (!isAutoRunning || !gameState || 'error' in gameState) {
      return;
    }

    // Check game state validity
    if (!gameState || gameState === null) {
      return;
    }

    // Don't auto-run if:
    // 1. Game is over
    if (gameState.phase === 'GameOver') {
      return;
    }

    // 2. Human has pending action
    if (gameState.pendingHumanAction) {
      return;
    }

    // 3. Character generation phase
    if (gameState.phase === 'CharacterGeneration') {
      return;
    }

    const timer = setTimeout(() => {
      runNextTurnAction();
    }, autoRunSpeed);

    return () => {
      clearTimeout(timer);
    };
  }, [isAutoRunning, autoRunSpeed, gameState, runNextTurnAction]);

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
    submitHumanAction: submitHumanActionInternal,
    isSaving,
    lastSaved,
    error,
    clearError,
    runNextTurn: runNextTurnAction,
    gameSpeed,
    setGameSpeed,
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

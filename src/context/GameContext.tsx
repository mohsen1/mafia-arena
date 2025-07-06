"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  loadGameState,
  handleNextTurn,
  updateGamePlayer,
  sendGameMessage,
  endGame,
  handleVoteSubmission,
  handleNightAction,
  restartGame,
} from "@/app/actions/gameplay.actions";
import { GameState } from "@/lib/engine/interfaces/GameState";
import { HumanMessage } from "@/lib/interfaces/actions.types";
import { createOrJoinGameSession } from "@/app/actions/management.actions";
import { getUserData } from "@/app/actions/user.actions";
import { User } from "@/lib/db/schema";
import { useSpokenText } from "@/context/SpokenTextContext";

// Add comprehensive logging helper
const PHASE_LOG_PREFIX = "[GameContext Phase]";
const log = (phase: string, details: any) => {
  const timestamp = new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  console.log(`${PHASE_LOG_PREFIX} ${timestamp} ${phase}: ${JSON.stringify(details)}`);
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
    const timestamp = new Date().toLocaleTimeString();
    console.log(
      `%c[GameContext] ${timestamp} 🔊 TOGGLE GLOBAL AUDIO`,
      'color: #e74c3c; font-weight: bold',
      {
        currentState: isAudioGloballyEnabled,
        gamePhase: gameState?.phase,
        currentlySpeakingId: currentlySpeakingId,
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
          action: newState ? 'Audio enabled - new messages will have voice' : 'Audio muted - stopping current playback',
        }
      );
      
      if (!newState && currentlySpeakingId) {
        console.log(`[GameContext] ${timestamp} 🔇 Stopping audio due to mute:`, currentlySpeakingId);
        resetAudio();
      }
      
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
    const oldPhase = gameState?.phase;
    const oldRound = gameState?.round;
    
    log("🚀 PHASE TRANSITION START", {
      currentPhase: oldPhase,
      round: oldRound,
      currentlySpeakingId,
      isAutoRunning,
      isAudioPlaying: !!currentlySpeakingId,
    });
    
    setIsLoadingNextTurn(true);
    setIsSaving(true);
    setError(null);
    try {
      const result = await boundRunGameTurnAction();
      
      // Enhanced error logging to diagnose structure issues
      if (result && typeof result === 'object') {
        log("📦 PHASE TRANSITION RESULT STRUCTURE", {
          hasError: 'error' in result,
          keys: Object.keys(result),
          playersType: Array.isArray(result.players) ? 'array' : typeof result.players,
          playersValue: result.players,
          resultSample: JSON.stringify(result).substring(0, 200) + '...',
        });
      }
      
      if (result && 'error' in result) {
        log("❌ PHASE TRANSITION ERROR", {
          error: result.error,
          phase: oldPhase,
          resultType: typeof result,
          resultKeys: Object.keys(result),
        });
        setError(result.error);
      } else if (result) {
        const phaseChanged = result.phase !== oldPhase;
        const roundChanged = result.round !== oldRound;
        
        log("✅ PHASE TRANSITION SUCCESS", {
          oldPhase,
          newPhase: result.phase,
          phaseChanged,
          oldRound,
          newRound: result.round,
          roundChanged,
                      livingPlayersCount: Object.values(result.players).filter((p: any) => p.status === 'Alive').length,
          winner: result.winner,
          gameOver: result.gameOver,
          messagesAdded: (result.log?.length || 0) - (gameState?.log?.length || 0),
        });
        
        setGameState(result);
        setLastSaved(new Date());
        
        if (result.gameOver) {
          setIsAutoRunning(false);
          log("🏁 GAME ENDED", {
            winner: result.winner,
            phase: result.phase,
          });
        }
      }
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      log("❌ PHASE TRANSITION EXCEPTION", {
        error: errorMessage,
        phase: oldPhase,
      });
      setError(errorMessage);
      return { error: errorMessage };
    } finally {
      setIsLoadingNextTurn(false);
      setIsSaving(false);
    }
  }, [boundRunGameTurnAction, gameState, currentlySpeakingId, isAutoRunning]);

  useEffect(() => {
    setGameState(initialGameState);
  }, [initialGameState]);

  // Enhanced auto-run effect with phase logging
  useEffect(() => {
    if (!isAutoRunning || !gameState || isLoadingNextTurn) {
      log("⏸️ AUTO-RUN BLOCKED", {
        isAutoRunning,
        hasGameState: !!gameState,
        isLoadingNextTurn,
        phase: gameState?.phase,
      });
      return;
    }

    const checkAutoRun = () => {
      const conditions = {
        isAutoRunning,
        isLoadingNextTurn,
        hasGameState: !!gameState,
        pendingHumanAction: gameState?.pendingHumanAction,
        phase: gameState?.phase,
        currentlySpeakingId,
      };

      const canProgress = !gameState?.pendingHumanAction && 
                          gameState?.phase !== 'GameOver' && 
                          !currentlySpeakingId;
      
      if (canProgress) {
        console.log("[GameContext] 16:31:26 Auto-run check PASSED - advancing turn", conditions);
        log("▶️ AUTO-ADVANCING", conditions);
        runNextTurnAction();
      } else {
        console.log("[GameContext] 16:31:26 Auto-run check FAILED:", conditions);
        log("⏳ AUTO-RUN WAITING", conditions);
      }
    };

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    
    const shouldRun =
      isAutoRunning &&
      !isLoadingNextTurn &&
      gameState &&
      !gameState.pendingHumanAction &&
      gameState.phase !== 'GameOver' &&
      !isAudioPlaying;

    if (!shouldRun) {
      console.log(`[GameContext] ${timestamp} Auto-run check FAILED:`, {
        isAutoRunning,
        isLoadingNextTurn,
        hasGameState: !!gameState,
        pendingHumanAction: gameState?.pendingHumanAction,
        phase: gameState?.phase,
        isAudioPlaying,
        currentlySpeakingId,
      });
      return;
    }

    // Delay depends on whether voice mode is enabled (shorter delay when voice just finished)
    const delay = isAudioGloballyEnabled ? 500 : 1500;
    
    console.log(`[GameContext] ${timestamp} Auto-run scheduling next turn:`, {
      delay,
      isAudioGloballyEnabled,
      wasAudioPlaying: isAudioPlaying,
      currentlySpeakingId,
    });

    const timerId = setTimeout(() => {
      const checkTimestamp = new Date().toISOString().split('T')[1].split('.')[0];
      const stillValid =
        isAutoRunning &&
        !isLoadingNextTurn &&
        gameState &&
        !gameState.pendingHumanAction &&
        gameState.phase !== 'GameOver' &&
        !currentlySpeakingId; // ensure no new audio started

      if (stillValid) {
        console.log(`[GameContext] ${checkTimestamp} ✅ AUTO-RUN executing next turn (after ${delay}ms delay)`);
        checkAutoRun();
      } else {
        console.log(`[GameContext] ${checkTimestamp} ❌ AUTO-RUN cancelled, conditions changed:`, {
          isAutoRunning,
          isLoadingNextTurn,
          hasGameState: !!gameState,
          pendingHumanAction: gameState?.pendingHumanAction,
          phase: gameState?.phase,
          currentlySpeakingId,
        });
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

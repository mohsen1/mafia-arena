/**
 * React hook for managing game WebSocket connection with polling fallback.
 * Uses native WebSocket API (React 19 compatible).
 */

import { useReducer, useEffect, useCallback, useRef, useState } from 'react';
import type {
  GameEvent,
  GameState,
  GameAction,
  GameStatus,
  PlayersMap,
  WsMessage,
  HealthCheckResponse,
} from '~/lib/game-types';
import { getEventTokens } from '~/lib/game-types';

// =============================================================================
// Constants
// =============================================================================

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_INTERVAL_MS = 15000;
const HEALTH_CHECK_INTERVAL_MS = 30000;
const HEALTH_CHECK_INTERVAL_STUCK_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;

// =============================================================================
// Initial State
// =============================================================================

const initialGameState: GameState = {
  events: [],
  players: {},
  eliminatedPlayers: new Set<string>(),
  status: 'idle',
  connectionStatus: 'connecting',
  startTime: null,
  durationMs: null,
  totalTokens: 0,
  currentRound: null,
  currentPhase: null,
  winner: null,
  error: null,
  thinkingState: null,
  aiProgress: null,
  suspenseReason: null,
  healthStatus: null,
};

// =============================================================================
// Reducer
// =============================================================================

function buildPlayersFromEvents(events: GameEvent[]): PlayersMap {
  const players: PlayersMap = {};

  for (const event of events) {
    // Handle game_start event to populate all players immediately
    if (event.type === 'game_start' && event.players) {
      for (const p of event.players) {
        if (!players[p.id]) {
          players[p.id] = {
            playerId: p.id,
            playerName: p.persona?.name || p.name || p.id,
            modelId: p.modelId || '',
            team: p.team || 'town',
            isAlive: true,
            persona: p.persona,
          };
        }
      }
    }

    // Handle ai_call events
    if (event.type === 'ai_call' && event.playerId) {
      if (!players[event.playerId]) {
        players[event.playerId] = {
          playerId: event.playerId,
          playerName: event.playerName || event.playerId,
          modelId: event.modelId || '',
          team: event.team || 'town',
          isAlive: true,
        };
      } else {
        const p = players[event.playerId];
        if (!p.modelId) p.modelId = event.modelId || '';
        if (!p.team) p.team = event.team || 'town';
        const currentIsIdName = p.playerName === event.playerId || p.playerName.startsWith('player_');
        if (event.playerName && currentIsIdName && !p.persona) {
          p.playerName = event.playerName;
        }
      }
    }

    // Handle persona_generation events
    if (event.type === 'persona_generation' && event.playerId) {
      if (!players[event.playerId]) {
        players[event.playerId] = {
          playerId: event.playerId,
          playerName: event.playerName || event.playerId,
          team: 'town',
          modelId: '',
          isAlive: true,
        };
      }
      players[event.playerId].persona = event.persona;
      if (event.persona?.name) {
        players[event.playerId].playerName = event.persona.name;
      }
    }

    // Handle elimination events
    if (event.type === 'elimination' && event.playerId) {
      if (players[event.playerId]) {
        players[event.playerId].isAlive = false;
      }
    }
  }

  return players;
}

function calculateTelemetry(events: GameEvent[]): { totalTokens: number; currentRound: number | null; currentPhase: string | null } {
  let totalTokens = 0;
  let currentRound: number | null = null;
  let currentPhase: string | null = null;

  for (const event of events) {
    if (event.round) currentRound = event.round;
    if (event.phase) currentPhase = event.phase;

    if (event.type === 'ai_call' && event.response?.usage) {
      totalTokens += event.response.usage.total_tokens || 0;
    } else if (event.type === 'ai_call' && event.response?.raw) {
      totalTokens += Math.ceil(event.response.raw.length / 4);
    }
  }

  return { totalTokens, currentRound, currentPhase };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SYNC': {
      const events = action.events || [];
      const players = buildPlayersFromEvents(events);
      const eliminated = new Set<string>();
      events.forEach(e => { if (e.type === 'elimination' && e.playerId) eliminated.add(e.playerId); });
      const telemetry = calculateTelemetry(events);
      const gameEndEvent = events.find(e => e.type === 'game_end');

      return {
        ...state,
        events,
        players,
        eliminatedPlayers: eliminated,
        status: action.status || state.status,
        startTime: action.startedAt || state.startTime,
        durationMs: action.durationMs || state.durationMs,
        totalTokens: telemetry.totalTokens,
        currentRound: telemetry.currentRound,
        currentPhase: telemetry.currentPhase,
        winner: gameEndEvent?.winner || null,
        error: action.error || null,
        thinkingState: null, // Clear thinking on sync
      };
    }

    case 'ADD_EVENT': {
      const newEvents = [...state.events, action.event];
      const event = action.event;
      
      // Incremental telemetry update - O(1) instead of O(N)
      const additionalTokens = getEventTokens(event);
      const newTotalTokens = state.totalTokens + additionalTokens;
      const newCurrentRound = event.round || state.currentRound;
      const newCurrentPhase = event.phase || state.currentPhase;
      
      const newPlayers = { ...state.players };
      const newEliminated = new Set(state.eliminatedPlayers);

      // Update player state based on new event
      if (event.type === 'game_start' && event.players) {
        for (const p of event.players) {
          if (!newPlayers[p.id]) {
            newPlayers[p.id] = {
              playerId: p.id,
              playerName: p.persona?.name || p.name || p.id,
              modelId: p.modelId || '',
              team: p.team || 'town',
              isAlive: true,
              persona: p.persona,
            };
          }
        }
      }

      if (event.type === 'ai_call' && event.playerId) {
        if (!newPlayers[event.playerId]) {
          newPlayers[event.playerId] = {
            playerId: event.playerId,
            playerName: event.playerName || event.playerId,
            modelId: event.modelId || '',
            team: event.team || 'town',
            isAlive: true,
          };
        }
      }

      if (event.type === 'persona_generation' && event.playerId) {
        if (!newPlayers[event.playerId]) {
          newPlayers[event.playerId] = {
            playerId: event.playerId,
            playerName: event.playerName || event.playerId,
            team: 'town',
            modelId: '',
            isAlive: true,
          };
        }
        newPlayers[event.playerId].persona = event.persona;
        if (event.persona?.name) {
          newPlayers[event.playerId].playerName = event.persona.name;
        }
      }

      if (event.type === 'elimination' && event.playerId) {
        newEliminated.add(event.playerId);
        if (newPlayers[event.playerId]) {
          newPlayers[event.playerId].isAlive = false;
        }
      }

      return {
        ...state,
        events: newEvents,
        players: newPlayers,
        eliminatedPlayers: newEliminated,
        totalTokens: newTotalTokens,
        currentRound: newCurrentRound,
        currentPhase: newCurrentPhase,
        status: 'running',
        winner: event.type === 'game_end' ? event.winner || null : state.winner,
        thinkingState: null, // Clear thinking when real event arrives
      };
    }

    case 'SET_STATUS':
      return {
        ...state,
        status: action.status,
        error: action.error || state.error,
      };

    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connectionStatus: action.connectionStatus,
      };

    case 'SET_THINKING':
      return {
        ...state,
        thinkingState: action.thinkingState,
      };

    case 'SET_AI_PROGRESS':
      return {
        ...state,
        aiProgress: action.aiProgress,
        suspenseReason: action.suspenseReason,
      };

    case 'SET_HEALTH':
      return {
        ...state,
        healthStatus: action.healthStatus,
      };

    case 'SET_WINNER':
      return {
        ...state,
        winner: action.winner,
        status: 'completed',
      };

    case 'UPDATE_DURATION':
      return {
        ...state,
        durationMs: action.durationMs,
      };

    case 'RESET':
      return initialGameState;

    default:
      return state;
  }
}

// =============================================================================
// Hook
// =============================================================================

export interface UseGameConnectionOptions {
  gameId: string;
  apiUrl: string;
}

export interface UseGameConnectionReturn {
  state: GameState;
  isConnected: boolean;
  isConnecting: boolean;
  isPolling: boolean;
}

export function useGameConnection({ gameId, apiUrl }: UseGameConnectionOptions): UseGameConnectionReturn {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const [isPolling, setIsPolling] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsConnecting, setWsConnecting] = useState(true);
  
  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastEventCountRef = useRef(0);
  const pollDelayRef = useRef(POLL_INTERVAL_MS);
  const isMountedRef = useRef(true);

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((msg: WsMessage) => {
    if (!isMountedRef.current) return;
    
    if (msg.type === 'SYNC') {
      dispatch({
        type: 'SYNC',
        events: msg.events || [],
        status: msg.status,
        startedAt: msg.startedAt,
        durationMs: msg.durationMs,
        error: msg.error,
      });
      lastEventCountRef.current = msg.events?.length || 0;
    } else if (msg.type === 'EVENT' && msg.event) {
      dispatch({ type: 'ADD_EVENT', event: msg.event });
    } else if (msg.type === 'STATUS') {
      if (msg.status) {
        dispatch({ type: 'SET_STATUS', status: msg.status, error: msg.error });
      }
      // Handle AI progress / thinking state
      if (msg.status === 'running' && msg.suspenseReason) {
        const match = msg.suspenseReason.match(/\(([^,]+), ([^)]+)\) in round (\d+) (\w+)/);
        if (match) {
          dispatch({
            type: 'SET_THINKING',
            thinkingState: {
              playerId: match[1],
              actionType: match[2],
              round: parseInt(match[3], 10),
              phase: match[4],
            },
          });
        }
        dispatch({
          type: 'SET_AI_PROGRESS',
          aiProgress: msg.aiProgress || null,
          suspenseReason: msg.suspenseReason,
        });
      } else {
        dispatch({ type: 'SET_THINKING', thinkingState: null });
        dispatch({ type: 'SET_AI_PROGRESS', aiProgress: null, suspenseReason: null });
      }
    } else if (msg.type === 'ERROR') {
      dispatch({ type: 'SET_STATUS', status: 'failed', error: msg.error });
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isMountedRef.current) return;
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setIsPolling(true);
      setWsConnecting(false);
      dispatch({ type: 'SET_CONNECTION_STATUS', connectionStatus: 'polling' });
      return;
    }

    const wsProtocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = apiUrl.replace(/^https?/, wsProtocol) + `/api/games/${gameId}/live`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) return;
        reconnectAttemptsRef.current = 0;
        setWsConnected(true);
        setWsConnecting(false);
        dispatch({ type: 'SET_CONNECTION_STATUS', connectionStatus: 'connected' });
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          const data = JSON.parse(event.data) as WsMessage;
          handleMessage(data);
        } catch (e) {
          console.error('WebSocket parse error:', e);
        }
      };

      ws.onclose = (event) => {
        if (!isMountedRef.current) return;
        setWsConnected(false);
        wsRef.current = null;
        
        if (event.code !== 1000) {
          // Abnormal close - try to reconnect
          reconnectAttemptsRef.current++;
          dispatch({ type: 'SET_CONNECTION_STATUS', connectionStatus: 'reconnecting' });
          const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current), 30000);
          setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        // Fall back to polling on error
        setIsPolling(true);
        setWsConnecting(false);
        setWsConnected(false);
        dispatch({ type: 'SET_CONNECTION_STATUS', connectionStatus: 'polling' });
        ws.close();
      };
    } catch {
      // WebSocket not supported - fall back to polling
      setIsPolling(true);
      setWsConnecting(false);
      dispatch({ type: 'SET_CONNECTION_STATUS', connectionStatus: 'polling' });
    }
  }, [apiUrl, gameId, handleMessage]);

  // Polling fallback
  const poll = useCallback(async () => {
    if (!isMountedRef.current || !isPolling) return;

    try {
      const res = await fetch(`${apiUrl}/api/games/${gameId}/events`);
      if (!res.ok) throw new Error('Failed to fetch events');

      const data = await res.json() as {
        events?: GameEvent[];
        status?: GameStatus;
        startedAt?: number;
        durationMs?: number;
        error?: string;
      };

      if (!isMountedRef.current) return;

      pollDelayRef.current = POLL_INTERVAL_MS;

      if (data.events && data.events.length > lastEventCountRef.current) {
        dispatch({
          type: 'SYNC',
          events: data.events,
          status: data.status,
          startedAt: data.startedAt,
          durationMs: data.durationMs,
          error: data.error,
        });
        lastEventCountRef.current = data.events.length;
      }

      if (data.status === 'completed' || data.status === 'failed') {
        dispatch({ type: 'SET_STATUS', status: data.status, error: data.error });
        setIsPolling(false);
        return;
      }

      // Schedule next poll
      pollIntervalRef.current = setTimeout(poll, pollDelayRef.current);
    } catch (e) {
      console.error('Poll error:', e);
      if (!isMountedRef.current) return;
      pollDelayRef.current = Math.min(pollDelayRef.current * 1.5, POLL_MAX_INTERVAL_MS);
      pollIntervalRef.current = setTimeout(poll, pollDelayRef.current);
    }
  }, [apiUrl, gameId, isPolling]);

  // Health check
  const checkHealth = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const res = await fetch(`${apiUrl}/api/games/${gameId}/health`);
      const data = await res.json() as HealthCheckResponse;
      if (!isMountedRef.current) return;
      dispatch({ type: 'SET_HEALTH', healthStatus: data.healthStatus });
      
      if (data.aiProgress) {
        dispatch({
          type: 'SET_AI_PROGRESS',
          aiProgress: data.aiProgress,
          suspenseReason: data.suspenseReason || null,
        });
      }
    } catch (e) {
      console.warn('Health check error:', e);
    }
  }, [apiUrl, gameId]);

  // Initialize connection
  useEffect(() => {
    isMountedRef.current = true;
    connect();
    
    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
      if (healthCheckRef.current) clearTimeout(healthCheckRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [connect]);

  // Start polling when WebSocket fails
  useEffect(() => {
    if (isPolling) {
      poll();
    }
    return () => {
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
    };
  }, [isPolling, poll]);

  // Duration timer
  useEffect(() => {
    if (state.startTime && (state.status === 'running' || state.status === 'idle')) {
      durationIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          dispatch({ type: 'UPDATE_DURATION', durationMs: Date.now() - state.startTime! });
        }
      }, 1000);
    }
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [state.startTime, state.status]);

  // Periodic health checks when polling
  useEffect(() => {
    if (isPolling && state.status === 'running') {
      const interval = state.events.length === 0 ? HEALTH_CHECK_INTERVAL_STUCK_MS : HEALTH_CHECK_INTERVAL_MS;
      const check = () => {
        checkHealth();
        if (isMountedRef.current && isPolling && state.status === 'running') {
          healthCheckRef.current = setTimeout(check, interval);
        }
      };
      healthCheckRef.current = setTimeout(check, interval);
    }
    return () => {
      if (healthCheckRef.current) clearTimeout(healthCheckRef.current);
    };
  }, [isPolling, state.status, state.events.length, checkHealth]);

  return {
    state,
    isConnected: wsConnected,
    isConnecting: wsConnecting && !isPolling,
    isPolling,
  };
}

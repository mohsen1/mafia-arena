/**
 * Shared types for live game functionality.
 * These types define the structure of game events, players, and WebSocket messages.
 */

// =============================================================================
// Game Event Types
// =============================================================================

export type PhaseType = 'introduction' | 'night' | 'mafia_chat' | 'day_discussion' | 'day_vote';

export interface ParsedVote {
  vote: string;
  reasoning?: string;
}

export interface ParsedAction {
  action: 'kill' | string;
  target: string;
  reasoning?: string;
}

export interface ParsedPersona {
  name?: string;
  background?: string;
  personality?: string;
  occupation?: string;
}

export interface TokenUsage {
  total_tokens?: number;
  input?: number;
  output?: number;
}

export interface GameEvent {
  type: 
    | 'ai_call' 
    | 'elimination' 
    | 'game_end' 
    | 'game_start' 
    | 'persona_generation' 
    | 'persona_generation_start'
    | 'persona_generation_progress'
    | 'summarization' 
    | 'phase_change' 
    | 'phase_start'
    | 'phase_end'
    | 'introduction'
    | 'discussion'
    | 'vote'
    | 'thinking';
  phase?: PhaseType | string;
  round?: number;
  playerId?: string;
  playerName?: string;
  modelId?: string;
  team?: 'mafia' | 'town';
  winner?: 'mafia' | 'town';
  response?: {
    raw?: string;
    parsed?: unknown;
    usage?: TokenUsage;
  };
  tokensUsed?: { input: number; output: number };
  latencyMs?: number;
  rawResponse?: string;
  persona?: ParsedPersona;
  roundRangeSummarized?: [number, number];
  tokensSaved?: number;
  timestamp?: number;
  /** For persona_generation_start */
  playerCount?: number;
  /** For persona_generation_progress */
  completed?: number;
  total?: number;
  /** For game_start events */
  players?: Array<{
    id: string;
    name: string;
    modelId: string;
    team: 'mafia' | 'town';
    persona?: ParsedPersona;
  }>;
}

// =============================================================================
// Player Types
// =============================================================================

export interface PlayerInfo {
  playerId: string;
  playerName: string;
  modelId: string;
  team: 'mafia' | 'town';
  isAlive: boolean;
  persona?: ParsedPersona;
}

export type PlayersMap = Record<string, PlayerInfo>;

// =============================================================================
// WebSocket Message Types
// =============================================================================

export interface AIProgress {
  cachedResponses: number;
  expectedPlayers: number | null;
  progressText: string;
}

/** Progress information from the workflow for UI display */
export interface GameProgress {
  current: number;
  total: number;
  label: string;
  pendingPlayers: string[];
}

/** What the game is currently waiting for */
export interface WaitingFor {
  playerName: string;
  modelId: string;
  actionType: 'introduction' | 'discussion' | 'vote' | 'night_action';
}

/** Batch API status for games using discount pricing */
export interface BatchStatus {
  isWaitingForBatch: boolean;
  provider?: string;
  submittedAt?: number;
  pollCount?: number;
  estimatedWaitHours?: number;
}

/** Player data from API (matches engine Player type) */
export interface APIPlayer {
  id: string;
  name: string;
  modelId: string;
  team: 'mafia' | 'town';
  isAlive: boolean;
  persona?: ParsedPersona;
}

export interface WsMessage {
  type: 'SYNC' | 'EVENT' | 'STATUS' | 'ERROR' | 'PROGRESS';
  events?: GameEvent[];
  event?: GameEvent;
  status?: GameStatus;
  error?: string;
  gameId?: string;
  startedAt?: number;
  durationMs?: number;
  /** Full player data from serialized state (includes personas) */
  players?: APIPlayer[];
  /** Current phase from workflow state (more accurate than deriving from events) */
  currentPhase?: string;
  /** Current round */
  round?: number;
  /** Current phase (for PROGRESS messages) */
  phase?: string;
  /** Current suspense reason - which model/player game is waiting for */
  suspenseReason?: string | null;
  /** When game started waiting for current AI call */
  suspenseStartedAt?: number | null;
  /** AI progress info for UI */
  aiProgress?: AIProgress;
  /** Progress information from workflow (new) */
  progress?: GameProgress;
  /** What game is actively waiting for */
  waitingFor?: WaitingFor | null;
  /** Batch API status for discount pricing games */
  batchStatus?: BatchStatus | null;
}

// =============================================================================
// Game State Types
// =============================================================================

export type GameStatus = 'idle' | 'running' | 'completed' | 'failed' | 'waiting_for_batch';

export type ConnectionStatus = 'connecting' | 'connected' | 'polling' | 'reconnecting' | 'disconnected' | 'error';

export interface HealthCheckResponse {
  healthStatus: 'healthy' | 'warning' | 'critical' | 'idle' | 'completed';
  healthMessage: string;
  aiProgress?: AIProgress;
  execution?: {
    currentPhase: string | null;
    currentRound: number | null;
    startedAt: number | null;
    durationMs: number | null;
  };
  suspenseReason?: string | null;
  recommendedAction?: 'none' | 'punt' | 'fail';
}

export interface ThinkingState {
  playerId: string;
  round: number;
  phase: string;
  actionType: string;
}

export interface GameState {
  events: GameEvent[];
  players: PlayersMap;
  eliminatedPlayers: Set<string>;
  status: GameStatus;
  connectionStatus: ConnectionStatus;
  startTime: number | null;
  durationMs: number | null;
  totalTokens: number;
  currentRound: number | null;
  currentPhase: string | null;
  winner: 'mafia' | 'town' | null;
  error: string | null;
  thinkingState: ThinkingState | null;
  aiProgress: AIProgress | null;
  suspenseReason: string | null;
  healthStatus: HealthCheckResponse['healthStatus'] | null;
  /** Progress information from workflow */
  progress: GameProgress | null;
  /** What game is actively waiting for */
  waitingFor: WaitingFor | null;
  /** Batch API status for discount pricing games */
  batchStatus: BatchStatus | null;
}

// =============================================================================
// Action Types for Reducer
// =============================================================================

export type GameAction =
  | { type: 'SYNC'; events: GameEvent[]; status?: GameStatus; startedAt?: number; durationMs?: number; error?: string; players?: APIPlayer[]; currentPhase?: string; progress?: GameProgress; waitingFor?: WaitingFor | null; batchStatus?: BatchStatus | null }
  | { type: 'ADD_EVENT'; event: GameEvent }
  | { type: 'SET_STATUS'; status: GameStatus; error?: string }
  | { type: 'SET_CONNECTION_STATUS'; connectionStatus: ConnectionStatus }
  | { type: 'SET_THINKING'; thinkingState: ThinkingState | null }
  | { type: 'SET_AI_PROGRESS'; aiProgress: AIProgress | null; suspenseReason: string | null }
  | { type: 'SET_HEALTH'; healthStatus: HealthCheckResponse['healthStatus']; healthMessage?: string }
  | { type: 'SET_WINNER'; winner: 'mafia' | 'town' }
  | { type: 'UPDATE_DURATION'; durationMs: number }
  | { type: 'SET_PROGRESS'; progress: GameProgress | null; waitingFor: WaitingFor | null }
  | { type: 'RESET' };

// =============================================================================
// Utility Types
// =============================================================================

export type ParsedResponse =
  | { type: 'message'; content: string }
  | { type: 'vote'; content: ParsedVote }
  | { type: 'action'; content: ParsedAction }
  | { type: 'persona'; content: ParsedPersona }
  | { type: 'raw'; content: string };

export interface PhaseConfig {
  label: string;
  color: string;
  bgColor: string;
  icon: 'moon' | 'sun' | 'swords' | 'vote' | 'message';
}

// =============================================================================
// Phase Configuration
// =============================================================================

export const PHASE_CONFIG: Record<PhaseType | string, PhaseConfig> = {
  introduction: { label: 'Intro', icon: 'message', color: 'text-foreground', bgColor: 'bg-muted/50' },
  night: { label: 'Night', icon: 'moon', color: 'text-indigo-400', bgColor: 'bg-indigo-500/5' },
  mafia_chat: { label: 'Mafia Chat', icon: 'swords', color: 'text-rose-500', bgColor: 'bg-rose-500/5' },
  day_discussion: { label: 'Discussion', icon: 'sun', color: 'text-amber-500', bgColor: 'bg-amber-500/5' },
  day_vote: { label: 'Vote', icon: 'vote', color: 'text-emerald-500', bgColor: 'bg-emerald-500/5' },
};

export function getPhaseConfig(phase: string | undefined): PhaseConfig {
  if (!phase) return { label: 'Starting', icon: 'message', color: 'text-muted-foreground', bgColor: 'bg-muted/30' };
  return PHASE_CONFIG[phase] || { label: phase, icon: 'message', color: 'text-foreground', bgColor: 'bg-muted/30' };
}

// =============================================================================
// Utility Functions
// =============================================================================

export function getProviderFromModel(modelId: string | undefined): string | null {
  if (!modelId) return null;
  if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3')) return 'OpenAI';
  if (modelId.includes('claude')) return 'Anthropic';
  if (modelId.includes('gemini')) return 'Google';
  if (modelId.includes('deepseek')) return 'DeepSeek';
  if (modelId.includes('llama')) return 'Meta';
  return null;
}

export function getProviderColor(modelId: string | undefined): string {
  if (!modelId) return '#888';
  if (modelId.includes('gpt') || modelId.includes('o1') || modelId.includes('o3')) return '#10a37f';
  if (modelId.includes('claude')) return '#d97706';
  if (modelId.includes('gemini')) return '#4285f4';
  if (modelId.includes('llama') || modelId.includes('deepseek')) return '#6366f1';
  return '#888';
}

export function getShortModelName(modelId: string | undefined): string {
  if (!modelId) return '?';
  let name = modelId.split('/').pop() || modelId;
  if (name.includes(': ')) {
    name = name.split(': ').slice(1).join(': ');
  }
  return name.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/@.*$/, '');
}

export function parseResponse(raw: string | undefined): ParsedResponse {
  if (!raw) return { type: 'raw', content: '' };
  try {
    const parsed = JSON.parse(raw);
    if (parsed.message) return { type: 'message', content: String(parsed.message) };
    if (parsed.vote !== undefined) return { type: 'vote', content: parsed as ParsedVote };
    if (parsed.action && parsed.target) return { type: 'action', content: parsed as ParsedAction };
    if (parsed.name && parsed.background) return { type: 'persona', content: parsed as ParsedPersona };
    return { type: 'raw', content: raw };
  } catch {
    return { type: 'raw', content: raw?.replace(/^["']|["']$/g, '').trim() || '' };
  }
}

/**
 * Get token count from a single event.
 * Used for incremental token calculation to avoid O(N) recalculation.
 */
export function getEventTokens(event: GameEvent): number {
  if (event.type === 'ai_call') {
    if (event.response?.usage?.total_tokens) return event.response.usage.total_tokens;
    if (event.response?.raw) return Math.ceil(event.response.raw.length / 4);
  }
  return 0;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatAiProgress(progress: AIProgress): string {
  if (progress.expectedPlayers !== null && progress.expectedPlayers > 0) {
    const current = Math.min(progress.cachedResponses, progress.expectedPlayers);
    return `${current}/${progress.expectedPlayers} AI responses`;
  }
  return progress.progressText || `${progress.cachedResponses} AI responses`;
}


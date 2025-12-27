/**
 * API client for the Mafia Arena backend.
 */

const API_URL = import.meta.env.PUBLIC_API_URL || 'https://api.mafia-arena.com';

// =============================================================================
// AUTH TYPES
// =============================================================================

export interface User {
  email: string;
  name: string;
  picture?: string;
  isAdmin: boolean;
}

export interface AuthState {
  authenticated: boolean;
  user?: User;
}

// =============================================================================
// AUTH FUNCTIONS (Google OAuth - Primary)
// =============================================================================

/**
 * Check current authentication state via session cookie.
 */
export async function getAuthState(): Promise<AuthState> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      credentials: 'include', // Send cookies
    });
    
    if (!res.ok) {
      return { authenticated: false };
    }
    
    return await res.json();
  } catch {
    return { authenticated: false };
  }
}

/**
 * Logout - clears session cookie.
 */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Ignore errors
  }
  
  // Clear legacy credentials too
  clearAdminCredentials();
  localStorage.removeItem('adminUnlocked');
}

/**
 * Get Google OAuth login URL.
 */
export function getGoogleLoginUrl(redirect = '/admin'): string {
  return `${API_URL}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
}

// =============================================================================
// LEGACY AUTH FUNCTIONS (Basic Auth - Deprecated)
// =============================================================================

/**
 * Get stored admin credentials from session storage (client-side only).
 * @deprecated Use session-based auth with Google OAuth instead.
 */
function getAdminCredentials(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('adminCredentials');
}

/**
 * Set admin credentials in session storage.
 * @deprecated Use session-based auth with Google OAuth instead.
 */
export function setAdminCredentials(username: string, password: string): void {
  if (typeof window === 'undefined') return;
  const credentials = btoa(`${username}:${password}`);
  sessionStorage.setItem('adminCredentials', credentials);
}

/**
 * Clear admin credentials.
 * @deprecated Use logout() instead.
 */
export function clearAdminCredentials(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('adminCredentials');
}

/**
 * Check if admin credentials are set.
 * @deprecated Use getAuthState() instead.
 */
export function hasAdminCredentials(): boolean {
  return !!getAdminCredentials();
}

/**
 * Create headers with admin auth if available.
 * Uses session cookie for auth (with credentials: 'include').
 * Falls back to Basic Auth header if legacy credentials exist.
 */
function getAdminHeaders(): HeadersInit {
  const credentials = getAdminCredentials();
  if (credentials) {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
    };
  }
  return { 'Content-Type': 'application/json' };
}

/**
 * Get fetch options for admin requests.
 * Includes credentials for cookie-based auth.
 */
function getAdminFetchOptions(options: RequestInit = {}): RequestInit {
  return {
    ...options,
    credentials: 'include', // Send session cookie
    headers: {
      ...getAdminHeaders(),
      ...options.headers,
    },
  };
}

export interface LeaderboardEntry {
  model_id: string;
  display_name: string;
  provider: string;
  team: 'mafia' | 'town';
  games_played: number;
  games_won: number;
  win_rate: number;
  total_tokens: number;
}

export interface GameSummary {
  id: string;
  batch_id: string | null;
  winner: 'mafia' | 'town' | null;
  rounds: number;
  duration_ms: number;
  total_tokens: number;
  persona_theme: 'noir' | 'victorian' | 'modern' | 'fantasy' | null;
  status: 'running' | 'completed' | 'failed';
  created_at: number;
}

export interface GameDetail extends GameSummary {
  config_hash: string;
  player_count: number;
  mafia_count: number;
  participants: Array<{
    model_id: string;
    model_name: string;
    team: 'mafia' | 'town';
    player_count: number;
    won: number;
  }>;
  transcriptUrl: string;
}

export interface Model {
  id: string;
  provider: string;
  display_name: string;
}

export interface GamePersona {
  playerId: string;
  modelId: string;
  modelName: string;
  team: 'mafia' | 'town';
  persona: {
    name: string;
    background: string;
    personality: string;
    occupation?: string;
  };
  consistency: {
    score: number | null;
    nameUsageCount: number;
    personalityAlignment: number | null;
    inconsistencies: string[];
  };
}

export interface PersonaAnalysis {
  averageScore: number;
  mafiaAvgConsistency: number;
  townAvgConsistency: number;
}

export interface GamePersonasResponse {
  gameId: string;
  personaEnabled: boolean;
  personas: GamePersona[];
  analysis: PersonaAnalysis | null;
}

export interface PersonaCorrelation {
  model_id: string;
  display_name: string;
  team: 'mafia' | 'town';
  personality_type: string;
  usage_count: number;
  win_rate: number;
  avg_consistency: number | null;
}

export interface TeamPattern {
  personality: string;
  count: number;
  percentage: string;
}

export interface WinRateByPersonality {
  personality: string;
  games: number;
  wins: number;
  winRate: number;
}

// Stats types
export interface StatsOverview {
  totals: {
    games: number;
    tokens: number;
    mafiaWins: number;
    townWins: number;
    avgRounds: number;
    avgDurationMs: number;
  };
  byProvider: Array<{
    provider: string;
    games: number;
    wins: number;
    tokens: number;
  }>;
  topModels: Array<{
    model_id: string;
    display_name: string;
    provider: string;
    games: number;
    wins: number;
    win_rate: number;
  }>;
}

export interface ModelMatchup {
  model_a: string;
  model_a_name: string;
  model_b: string;
  model_b_name: string;
  games: number;
  model_a_wins: number;
}

export interface SelfPlayStats {
  model_id: string;
  games: number;
  mafia_wins: number;
  town_wins: number;
}

export interface MatchupsResponse {
  matchups: ModelMatchup[];
  selfPlay: SelfPlayStats[];
  models: Array<{
    id: string;
    display_name: string;
    provider: string;
  }>;
  filter: { team: 'mafia' | 'town' | null };
}

export interface CostStats {
  byModel: Array<{
    model_id: string;
    display_name: string;
    provider: string;
    games: number;
    wins: number;
    tokens: number;
    win_rate: number;
    tokens_per_game: number;
  }>;
  byProvider: Array<{
    provider: string;
    games: number;
    wins: number;
    tokens: number;
    win_rate: number;
    tokens_per_game: number;
  }>;
}

export interface TrendsData {
  daily: Array<{
    date: string;
    games: number;
    mafia_wins: number;
    town_wins: number;
    tokens: number;
  }>;
  recent: Array<{
    id: string;
    winner: 'mafia' | 'town';
    rounds: number;
    total_tokens: number;
    created_at: number;
    models: string;
  }>;
  period: { days: number; cutoff: number };
}

/**
 * Fetch leaderboard rankings.
 */
export async function getLeaderboard(team?: 'mafia' | 'town'): Promise<LeaderboardEntry[]> {
  const url = team
    ? `${API_URL}/api/leaderboard?team=${team}`
    : `${API_URL}/api/leaderboard`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');

  const data = await res.json();
  return data.rankings;
}

export interface GameFilters {
  model?: string;
  winner?: 'mafia' | 'town';
  theme?: 'noir' | 'victorian' | 'modern' | 'fantasy';
}

export interface GamesResponse {
  games: GameSummary[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
  filters: {
    model: string | null;
    winner: 'mafia' | 'town' | null;
    theme: 'noir' | 'victorian' | 'modern' | 'fantasy' | null;
  };
}

/**
 * Fetch list of games with optional filters.
 */
export async function getGames(
  limit = 20,
  offset = 0,
  status: 'completed' | 'running' | 'failed' = 'completed',
  filters?: GameFilters
): Promise<GamesResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    status,
  });
  
  if (filters?.model) params.set('model', filters.model);
  if (filters?.winner) params.set('winner', filters.winner);
  if (filters?.theme) params.set('theme', filters.theme);

  const res = await fetch(`${API_URL}/api/games?${params}`);
  if (!res.ok) throw new Error('Failed to fetch games');

  return res.json();
}

/**
 * Fetch running/live games.
 */
export async function getLiveGames(): Promise<{ games: GameSummary[]; total: number }> {
  const res = await fetch(`${API_URL}/api/games?status=running&limit=50`);
  if (!res.ok) throw new Error('Failed to fetch live games');

  return res.json();
}

/**
 * Fetch a single game's details.
 */
export async function getGame(id: string): Promise<GameDetail> {
  const res = await fetch(`${API_URL}/api/games/${id}`);
  if (!res.ok) throw new Error('Failed to fetch game');

  return res.json();
}

/**
 * Fetch available models from DB.
 */
export async function getModels(): Promise<Model[]> {
  const res = await fetch(`${API_URL}/api/models`);
  if (!res.ok) throw new Error('Failed to fetch models');

  const data = await res.json();
  return data.models;
}

// =============================================================================
// OPENROUTER MODELS
// =============================================================================

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  pricing: {
    inputPer1M: number;
    outputPer1M: number;
  };
}

export interface OpenRouterModelsResponse {
  providers: string[];
  modelsByProvider: Record<string, OpenRouterModel[]>;
  totalModels: number;
  cachedAt: number;
}

/**
 * Fetch available models from OpenRouter API.
 */
export async function getOpenRouterModels(): Promise<OpenRouterModelsResponse> {
  const res = await fetch(`${API_URL}/api/models/openrouter`);
  if (!res.ok) throw new Error('Failed to fetch OpenRouter models');

  return res.json();
}

/**
 * Sync models from OpenRouter to database.
 */
export async function syncModels(): Promise<{
  success: boolean;
  added: number;
  updated: number;
  total: number;
  message: string;
}> {
  const res = await fetch(`${API_URL}/api/admin/models/sync`, 
    getAdminFetchOptions({ method: 'POST' })
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to sync models');

  return res.json();
}

/**
 * Get models in database (admin).
 */
export async function getDbModels(): Promise<{
  models: Array<{
    id: string;
    provider: string;
    display_name: string;
    config: string | null;
    created_at: number;
  }>;
  total: number;
}> {
  const res = await fetch(`${API_URL}/api/admin/models`, 
    getAdminFetchOptions()
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to fetch DB models');

  return res.json();
}

/**
 * Fetch game transcript.
 */
export async function getTranscript(gameId: string): Promise<unknown> {
  const res = await fetch(`${API_URL}/api/games/${gameId}/transcript`);
  if (!res.ok) throw new Error('Failed to fetch transcript');

  return res.json();
}

/**
 * Fetch game personas.
 */
export async function getGamePersonas(gameId: string): Promise<GamePersonasResponse> {
  const res = await fetch(`${API_URL}/api/games/${gameId}/personas`);
  if (!res.ok) throw new Error('Failed to fetch personas');

  return res.json();
}

/**
 * Fetch persona correlations.
 */
export async function getPersonaCorrelations(options?: {
  model?: string;
  team?: 'mafia' | 'town';
  minUsage?: number;
}): Promise<{ correlations: PersonaCorrelation[] }> {
  const params = new URLSearchParams();
  if (options?.model) params.set('model', options.model);
  if (options?.team) params.set('team', options.team);
  if (options?.minUsage) params.set('minUsage', String(options.minUsage));

  const url = `${API_URL}/api/analysis/persona-correlations${params.toString() ? `?${params}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch persona correlations');

  return res.json();
}

/**
 * Fetch team persona patterns.
 */
export async function getTeamPatterns(): Promise<{
  mafia: TeamPattern[];
  town: TeamPattern[];
  totals: { mafia: number; town: number };
}> {
  const res = await fetch(`${API_URL}/api/analysis/team-patterns`);
  if (!res.ok) throw new Error('Failed to fetch team patterns');

  return res.json();
}

/**
 * Fetch model persona fingerprint.
 */
export async function getModelPatterns(modelId: string): Promise<{
  model: Model;
  mafia: any[];
  town: any[];
  summary: {
    totalGames: number;
    overallWinRate: string;
    avgConsistency: string | null;
    dominantMafiaPersonality: any;
    dominantTownPersonality: any;
  };
}> {
  const res = await fetch(`${API_URL}/api/analysis/model-patterns/${modelId}`);
  if (!res.ok) throw new Error('Failed to fetch model patterns');

  return res.json();
}

/**
 * Fetch win rate by personality.
 */
export async function getWinRateByPersonality(team?: 'mafia' | 'town'): Promise<{
  results: WinRateByPersonality[];
  team: string;
}> {
  const url = team
    ? `${API_URL}/api/analysis/win-rate-by-personality?team=${team}`
    : `${API_URL}/api/analysis/win-rate-by-personality`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch win rate by personality');

  return res.json();
}

/**
 * Fetch stats overview.
 */
export async function getStatsOverview(): Promise<StatsOverview> {
  const res = await fetch(`${API_URL}/api/stats/overview`);
  if (!res.ok) throw new Error('Failed to fetch stats overview');
  return res.json();
}

/**
 * Fetch model matchups.
 */
export async function getMatchups(team?: 'mafia' | 'town'): Promise<MatchupsResponse> {
  const url = team
    ? `${API_URL}/api/stats/matchups?team=${team}`
    : `${API_URL}/api/stats/matchups`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch matchups');
  return res.json();
}

/**
 * Fetch cost stats.
 */
export async function getCostStats(): Promise<CostStats> {
  const res = await fetch(`${API_URL}/api/stats/costs`);
  if (!res.ok) throw new Error('Failed to fetch cost stats');
  return res.json();
}

/**
 * Fetch trends data.
 */
export async function getTrends(days = 30): Promise<TrendsData> {
  const res = await fetch(`${API_URL}/api/stats/trends?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch trends');
  return res.json();
}

/**
 * ELO ranking entry.
 */
export interface EloRanking {
  display_name: string;
  model_ids: string[];
  elo: number;
  games: number;
  wins: number;
  losses: number;
  win_rate: number;
  peak_elo: number;
}

/**
 * ELO rankings response.
 */
export interface EloResponse {
  rankings: EloRanking[];
  metadata: {
    initial_rating: number;
    games_processed: number;
    models_ranked: number;
  };
}

/**
 * Fetch ELO ratings.
 */
export async function getEloRatings(): Promise<EloResponse> {
  const res = await fetch(`${API_URL}/api/stats/elo`);
  if (!res.ok) throw new Error('Failed to fetch ELO ratings');
  return res.json();
}

/**
 * Format duration in milliseconds to human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format duration in seconds to human-readable string (e.g., "4m 13s").
 */
export function formatDurationSeconds(seconds: number): string {
  const secs = Math.round(seconds);
  if (secs < 60) return `${secs}s`;
  const minutes = Math.floor(secs / 60);
  const remainingSeconds = secs % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Format relative time.
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Format number with commas.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format win rate as percentage.
 */
export function formatWinRate(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

// =============================================================================
// ADMIN API
// =============================================================================

export interface Batch {
  id: string;
  name: string | null;
  status: 'queued' | 'processing' | 'completed' | 'cancelled' | 'paused';
  totalGames: number;
  completedGames: number;
  failedGames: number;
  estimatedCostUsd: number | null;
  actualCostUsd: number;
  createdBy: string;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  progress: string;
}

export interface BatchDetail extends Batch {
  errorMessage: string | null;
  config: {
    name?: string;
    totalGames: number;
    gameConfig: {
      playerCount: number;
      mafiaCount: number;
      teams: Array<{ modelId: string; team: string; count: number }>;
    };
  };
  recentGames: Array<{
    id: string;
    status: string;
    winner: string;
    rounds: number;
    duration_ms: number;
    created_at: number;
  }>;
}

export interface AdminStats {
  gamesRunning: number;
  gamesQueued: number;
  batchesActive: number;
  costToday: number;
  systemPaused: boolean;
}

export interface CostEstimate {
  estimatedCostUsd: number;
  tokensPerGame: number;
  totalTokens: number;
  timeEstimateMinutes: number;
  useBatchAPI: boolean;
  savings: number;
}

/**
 * Create a new batch of games.
 */
export async function createBatch(data: {
  name?: string;
  totalGames: number;
  config: {
    playerCount: number;
    mafiaCount: number;
    teams: Array<{ modelId: string; team: 'mafia' | 'town'; count: number }>;
    discussionEnabled?: boolean;
    contextLevel?: 'full' | 'windowed' | 'summary';
  };
  useBatchAPI?: boolean;
}): Promise<{ success: boolean; batchId: string; estimatedCostUsd: number }> {
  const res = await fetch(`${API_URL}/api/admin/batches`, 
    getAdminFetchOptions({
      method: 'POST',
      body: JSON.stringify(data),
    })
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to create batch');
  }
  return res.json();
}

/**
 * List all batches.
 */
export async function listBatches(options?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ batches: Batch[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));

  const res = await fetch(`${API_URL}/api/admin/batches?${params}`, 
    getAdminFetchOptions()
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to fetch batches');
  return res.json();
}

/**
 * Get batch details.
 */
export async function getBatchAdmin(batchId: string): Promise<BatchDetail> {
  const res = await fetch(`${API_URL}/api/admin/batches/${batchId}`, 
    getAdminFetchOptions()
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to fetch batch');
  return res.json();
}

/**
 * Cancel a batch.
 */
export async function cancelBatch(batchId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/admin/batches/${batchId}/cancel`, 
    getAdminFetchOptions({ method: 'POST' })
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to cancel batch');
  return res.json();
}

/**
 * Pause system processing.
 */
export async function pauseSystem(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/admin/system/pause`, 
    getAdminFetchOptions({ method: 'POST' })
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to pause system');
  return res.json();
}

/**
 * Resume system processing.
 */
export async function resumeSystem(): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/api/admin/system/resume`, 
    getAdminFetchOptions({ method: 'POST' })
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to resume system');
  return res.json();
}

/**
 * Get live admin stats.
 */
export async function getAdminStats(): Promise<AdminStats> {
  const res = await fetch(`${API_URL}/api/admin/stats/live`, 
    getAdminFetchOptions()
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to fetch admin stats');
  return res.json();
}

/**
 * Get cost estimate for a batch.
 */
export async function getCostEstimate(data: {
  totalGames: number;
  config: {
    playerCount: number;
    mafiaCount: number;
    teams: Array<{ modelId: string; team: 'mafia' | 'town'; count: number }>;
    discussionEnabled?: boolean;
    contextLevel?: 'full' | 'windowed' | 'summary';
  };
  useBatchAPI?: boolean;
}): Promise<CostEstimate> {
  const res = await fetch(`${API_URL}/api/admin/estimate`, 
    getAdminFetchOptions({
      method: 'POST',
      body: JSON.stringify(data),
    })
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) throw new Error('Failed to get cost estimate');
  return res.json();
}

/**
 * Game configuration for running a live game.
 */
export interface LiveGameConfig {
  playerCount: number;
  mafiaCount: number;
  teams: Array<{ modelId: string; team: 'mafia' | 'town'; count: number }>;
  maxRounds?: number;
  discussionEnabled?: boolean;
  personaConstraints?: 'strict' | 'moderate' | 'free';
  contextLevel?: 'full' | 'windowed' | 'summary';
  contextWindowSize?: number;
}

/**
 * Response from running a live game.
 */
export interface LiveGameResponse {
  success: boolean;
  gameId: string;
  batchId: string;
  seed: number;
  status: string;
  liveUrl: string;
  message: string;
}

/**
 * Run a single game with live streaming.
 * Starts the game in background mode and returns immediately.
 * Use the returned liveUrl to connect via WebSocket for real-time updates.
 */
export async function runLiveGame(config: LiveGameConfig): Promise<LiveGameResponse> {
  const res = await fetch(`${API_URL}/api/admin/games/run-live`, 
    getAdminFetchOptions({
      method: 'POST',
      body: JSON.stringify({ config }),
    })
  );
  if (res.status === 401) throw new Error('AUTH_REQUIRED');
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || 'Failed to start live game');
  }
  return res.json();
}


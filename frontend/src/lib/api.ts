/**
 * API client for the Mafia Arena backend.
 */

const API_URL = import.meta.env.PUBLIC_API_URL || 'https://mafia-arena.me-f9a.workers.dev';

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
  winner: 'mafia' | 'town';
  rounds: number;
  duration_ms: number;
  total_tokens: number;
  created_at: number;
}

export interface GameDetail extends GameSummary {
  config_hash: string;
  player_count: number;
  mafia_count: number;
  status: string;
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

/**
 * Fetch list of games.
 */
export async function getGames(
  limit = 20,
  offset = 0
): Promise<{ games: GameSummary[]; total: number; hasMore: boolean }> {
  const res = await fetch(`${API_URL}/api/games?limit=${limit}&offset=${offset}`);
  if (!res.ok) throw new Error('Failed to fetch games');

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
 * Fetch available models.
 */
export async function getModels(): Promise<Model[]> {
  const res = await fetch(`${API_URL}/api/models`);
  if (!res.ok) throw new Error('Failed to fetch models');

  const data = await res.json();
  return data.models;
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


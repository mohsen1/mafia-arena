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


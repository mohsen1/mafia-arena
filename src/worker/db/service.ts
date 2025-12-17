/**
 * Database service for D1 operations.
 */

export interface Model {
  id: string;
  provider: string;
  display_name: string;
  config: string | null;
  created_at: number;
}

export interface Game {
  id: string;
  batch_id: string | null;
  config_hash: string;
  player_count: number;
  mafia_count: number;
  winner: 'mafia' | 'town';
  rounds: number;
  duration_ms: number;
  total_tokens: number;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  created_at: number;
}

export interface GameParticipant {
  id: string;
  game_id: string;
  model_id: string;
  team: 'mafia' | 'town';
  player_count: number;
  won: number;
}

export interface LeaderboardEntry {
  model_id: string;
  team: 'mafia' | 'town';
  games_played: number;
  games_won: number;
  total_tokens: number;
  win_rate: number;
  display_name?: string;
  provider?: string;
  updated_at: number;
}

/**
 * Database service class.
 */
export class DatabaseService {
  constructor(private readonly db: D1Database) {}

  // Models
  async getModels(): Promise<Model[]> {
    const result = await this.db
      .prepare('SELECT * FROM models ORDER BY display_name')
      .all<Model>();
    return result.results;
  }

  async getModel(id: string): Promise<Model | null> {
    return this.db
      .prepare('SELECT * FROM models WHERE id = ?')
      .bind(id)
      .first<Model>();
  }

  // Games
  async getGames(options: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<{ games: Game[]; total: number }> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const status = options.status ?? 'completed';

    const countResult = await this.db
      .prepare('SELECT COUNT(*) as count FROM games WHERE status = ?')
      .bind(status)
      .first<{ count: number }>();

    const gamesResult = await this.db
      .prepare(
        `SELECT * FROM games WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(status, limit, offset)
      .all<Game>();

    return {
      games: gamesResult.results,
      total: countResult?.count ?? 0,
    };
  }

  async getGame(id: string): Promise<Game | null> {
    return this.db
      .prepare('SELECT * FROM games WHERE id = ?')
      .bind(id)
      .first<Game>();
  }

  async getGameParticipants(gameId: string): Promise<GameParticipant[]> {
    const result = await this.db
      .prepare('SELECT * FROM game_participants WHERE game_id = ?')
      .bind(gameId)
      .all<GameParticipant>();
    return result.results;
  }

  // Leaderboard
  async getLeaderboard(team?: 'mafia' | 'town'): Promise<LeaderboardEntry[]> {
    let query = `
      SELECT 
        l.model_id,
        l.team,
        l.games_played,
        l.games_won,
        l.total_tokens,
        l.updated_at,
        CASE WHEN l.games_played > 0 
          THEN CAST(l.games_won AS REAL) / l.games_played 
          ELSE 0 
        END as win_rate,
        m.display_name,
        m.provider
      FROM leaderboard l
      LEFT JOIN models m ON l.model_id = m.id
    `;

    if (team) {
      query += ` WHERE l.team = ?`;
    }

    query += ' ORDER BY win_rate DESC, games_played DESC';

    const result = team
      ? await this.db.prepare(query).bind(team).all<LeaderboardEntry>()
      : await this.db.prepare(query).all<LeaderboardEntry>();

    return result.results;
  }
}


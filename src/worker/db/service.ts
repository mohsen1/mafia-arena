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

export interface GamePersona {
  id: string;
  game_id: string;
  player_id: string;
  model_id: string;
  team: 'mafia' | 'town';
  persona_name: string;
  persona_background: string;
  persona_personality: string;
  persona_occupation: string | null;
  consistency_score: number | null;
  name_usage_count: number;
  personality_alignment_score: number | null;
  inconsistencies: string | null;
  created_at: number;
}

export interface GamePersonaAnalysis {
  game_id: string;
  average_consistency_score: number;
  mafia_avg_consistency: number;
  town_avg_consistency: number;
  created_at: number;
}

export interface PersonaPattern {
  model_id: string;
  team: 'mafia' | 'town';
  personality_type: string;
  usage_count: number;
  avg_consistency_score: number | null;
  win_count: number;
  updated_at: number;
}

export interface PersonaCorrelation {
  model_id: string;
  display_name?: string;
  team: 'mafia' | 'town';
  personality_type: string;
  usage_count: number;
  win_rate: number;
  avg_consistency: number | null;
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
        m.family as provider
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

  // Persona operations
  async getGamePersonas(gameId: string): Promise<GamePersona[]> {
    const result = await this.db
      .prepare('SELECT * FROM game_personas WHERE game_id = ? ORDER BY created_at')
      .bind(gameId)
      .all<GamePersona>();
    return result.results;
  }

  async getGamePersonaAnalysis(gameId: string): Promise<GamePersonaAnalysis | null> {
    return this.db
      .prepare('SELECT * FROM game_persona_analysis WHERE game_id = ?')
      .bind(gameId)
      .first<GamePersonaAnalysis>();
  }

  async getPersonaCorrelations(options?: {
    modelId?: string;
    team?: 'mafia' | 'town';
    minUsageCount?: number;
  }): Promise<PersonaCorrelation[]> {
    let query = `
      SELECT 
        p.model_id,
        m.display_name,
        p.team,
        p.personality_type,
        p.usage_count,
        CASE WHEN p.usage_count > 0 
          THEN CAST(p.win_count AS REAL) / p.usage_count 
          ELSE 0 
        END as win_rate,
        p.avg_consistency_score as avg_consistency
      FROM persona_patterns p
      LEFT JOIN models m ON p.model_id = m.id
      WHERE p.usage_count >= ?
    `;

    const params: (string | number)[] = [options?.minUsageCount ?? 1];

    if (options?.modelId) {
      query += ` AND p.model_id = ?`;
      params.push(options.modelId);
    }

    if (options?.team) {
      query += ` AND p.team = ?`;
      params.push(options.team);
    }

    query += ' ORDER BY p.usage_count DESC, win_rate DESC';

    const stmt = this.db.prepare(query);
    const result = await stmt.bind(...params).all<PersonaCorrelation>();
    return result.results;
  }

  async getModelPersonaFingerprint(modelId: string): Promise<{
    mafia: PersonaPattern[];
    town: PersonaPattern[];
    avgConsistency: number | null;
  }> {
    const mafiaResult = await this.db
      .prepare(
        'SELECT * FROM persona_patterns WHERE model_id = ? AND team = ? ORDER BY usage_count DESC'
      )
      .bind(modelId, 'mafia')
      .all<PersonaPattern>();

    const townResult = await this.db
      .prepare(
        'SELECT * FROM persona_patterns WHERE model_id = ? AND team = ? ORDER BY usage_count DESC'
      )
      .bind(modelId, 'town')
      .all<PersonaPattern>();

    // Calculate overall average consistency
    const allPatterns = [...mafiaResult.results, ...townResult.results];
    let avgConsistency: number | null = null;
    if (allPatterns.length > 0) {
      const scores = allPatterns
        .filter(p => p.avg_consistency_score !== null)
        .map(p => p.avg_consistency_score!);
      if (scores.length > 0) {
        avgConsistency = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    }

    return {
      mafia: mafiaResult.results,
      town: townResult.results,
      avgConsistency,
    };
  }

  async getTeamPersonaDivergence(): Promise<{
    mafia: { personality: string; percentage: number }[];
    town: { personality: string; percentage: number }[];
  }> {
    const mafiaResult = await this.db
      .prepare(`
        SELECT 
          personality_type as personality,
          SUM(usage_count) as total_usage
        FROM persona_patterns 
        WHERE team = 'mafia'
        GROUP BY personality_type
        ORDER BY total_usage DESC
      `)
      .all<{ personality: string; total_usage: number }>();

    const townResult = await this.db
      .prepare(`
        SELECT 
          personality_type as personality,
          SUM(usage_count) as total_usage
        FROM persona_patterns 
        WHERE team = 'town'
        GROUP BY personality_type
        ORDER BY total_usage DESC
      `)
      .all<{ personality: string; total_usage: number }>();

    const mafiaTotal = mafiaResult.results.reduce((sum, r) => sum + r.total_usage, 0);
    const townTotal = townResult.results.reduce((sum, r) => sum + r.total_usage, 0);

    return {
      mafia: mafiaResult.results.map(r => ({
        personality: r.personality,
        percentage: mafiaTotal > 0 ? (r.total_usage / mafiaTotal) * 100 : 0,
      })),
      town: townResult.results.map(r => ({
        personality: r.personality,
        percentage: townTotal > 0 ? (r.total_usage / townTotal) * 100 : 0,
      })),
    };
  }

  async getWinRateByPersonality(options?: { team?: 'mafia' | 'town' }): Promise<
    { personality: string; win_rate: number; games: number }[]
  > {
    let query = `
      SELECT 
        personality_type as personality,
        SUM(usage_count) as games,
        CASE WHEN SUM(usage_count) > 0
          THEN CAST(SUM(win_count) AS REAL) / SUM(usage_count)
          ELSE 0
        END as win_rate
      FROM persona_patterns
    `;

    if (options?.team) {
      query += ` WHERE team = ?`;
    }

    query += ` GROUP BY personality_type ORDER BY win_rate DESC`;

    const result = options?.team
      ? await this.db.prepare(query).bind(options.team).all<{
          personality: string;
          win_rate: number;
          games: number;
        }>()
      : await this.db.prepare(query).all<{
          personality: string;
          win_rate: number;
          games: number;
        }>();

    return result.results;
  }
}


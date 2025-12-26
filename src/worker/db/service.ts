/**
 * Database service for D1 operations.
 * 
 * MIGRATION NOTE: This service now uses Drizzle ORM for type-safe queries.
 * Types are inferred from the schema - see schema.ts for definitions.
 */

import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { createDb, type Database } from './drizzle.js';
import * as schema from './schema.js';

// Re-export types from schema for backwards compatibility
export type {
  Model,
  Game,
  GameParticipant,
  LeaderboardEntry,
  GamePersona,
  GamePersonaAnalysisEntry as GamePersonaAnalysis,
  PersonaPattern,
} from './schema.js';

/**
 * Extended leaderboard entry with computed win_rate and joined model info.
 */
export interface LeaderboardEntryWithStats {
  model_id: string;
  team: 'mafia' | 'town';
  games_played: number;
  games_won: number;
  total_tokens: number;
  win_rate: number;
  display_name?: string;
  provider?: string;
  updated_at: Date | null;
}

/**
 * Persona correlation data for analysis.
 */
export interface PersonaCorrelation {
  model_id: string;
  display_name?: string | null;
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
  private readonly db: Database;

  constructor(d1: D1Database) {
    this.db = createDb(d1);
  }

  // Models
  async getModels(): Promise<schema.Model[]> {
    return this.db.query.models.findMany({
      orderBy: [schema.models.displayName],
    });
  }

  async getModel(id: string): Promise<schema.Model | undefined> {
    return this.db.query.models.findFirst({
      where: eq(schema.models.id, id),
    });
  }

  // Games
  async getGames(options: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<{ games: schema.Game[]; total: number }> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const status = (options.status ?? 'completed') as 'running' | 'completed' | 'failed';

    const [games, countResult] = await Promise.all([
      this.db.query.games.findMany({
        where: eq(schema.games.status, status),
        orderBy: [desc(schema.games.createdAt)],
        limit,
        offset,
      }),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.games)
        .where(eq(schema.games.status, status)),
    ]);

    return {
      games,
      total: countResult[0]?.count ?? 0,
    };
  }

  async getGame(id: string): Promise<schema.Game | undefined> {
    return this.db.query.games.findFirst({
      where: eq(schema.games.id, id),
    });
  }

  async getGameParticipants(gameId: string): Promise<schema.GameParticipant[]> {
    return this.db.query.gameParticipants.findMany({
      where: eq(schema.gameParticipants.gameId, gameId),
    });
  }

  // Leaderboard
  async getLeaderboard(team?: 'mafia' | 'town'): Promise<LeaderboardEntryWithStats[]> {
    const result = await this.db
      .select({
        model_id: schema.leaderboard.modelId,
        team: schema.leaderboard.team,
        games_played: schema.leaderboard.gamesPlayed,
        games_won: schema.leaderboard.gamesWon,
        total_tokens: schema.leaderboard.totalTokens,
        updated_at: schema.leaderboard.updatedAt,
        win_rate: sql<number>`CASE WHEN ${schema.leaderboard.gamesPlayed} > 0 
          THEN CAST(${schema.leaderboard.gamesWon} AS REAL) / ${schema.leaderboard.gamesPlayed} 
          ELSE 0 END`,
        display_name: schema.models.displayName,
        provider: schema.models.family,
      })
      .from(schema.leaderboard)
      .leftJoin(schema.models, eq(schema.leaderboard.modelId, schema.models.id))
      .where(team ? eq(schema.leaderboard.team, team) : undefined)
      .orderBy(
        sql`win_rate DESC`,
        desc(schema.leaderboard.gamesPlayed)
      );

    return result as LeaderboardEntryWithStats[];
  }

  // Persona operations
  async getGamePersonas(gameId: string): Promise<schema.GamePersona[]> {
    return this.db.query.gamePersonas.findMany({
      where: eq(schema.gamePersonas.gameId, gameId),
      orderBy: [schema.gamePersonas.createdAt],
    });
  }

  async getGamePersonaAnalysis(gameId: string): Promise<schema.GamePersonaAnalysisEntry | undefined> {
    return this.db.query.gamePersonaAnalysis.findFirst({
      where: eq(schema.gamePersonaAnalysis.gameId, gameId),
    });
  }

  async getPersonaCorrelations(options?: {
    modelId?: string;
    team?: 'mafia' | 'town';
    minUsageCount?: number;
  }): Promise<PersonaCorrelation[]> {
    const minUsageCount = options?.minUsageCount ?? 1;
    
    const conditions = [gte(schema.personaPatterns.usageCount, minUsageCount)];
    
    if (options?.modelId) {
      conditions.push(eq(schema.personaPatterns.modelId, options.modelId));
    }
    
    if (options?.team) {
      conditions.push(eq(schema.personaPatterns.team, options.team));
    }

    const result = await this.db
      .select({
        model_id: schema.personaPatterns.modelId,
        display_name: schema.models.displayName,
        team: schema.personaPatterns.team,
        personality_type: schema.personaPatterns.personalityType,
        usage_count: schema.personaPatterns.usageCount,
        win_rate: sql<number>`CASE WHEN ${schema.personaPatterns.usageCount} > 0 
          THEN CAST(${schema.personaPatterns.winCount} AS REAL) / ${schema.personaPatterns.usageCount} 
          ELSE 0 END`,
        avg_consistency: schema.personaPatterns.avgConsistencyScore,
      })
      .from(schema.personaPatterns)
      .leftJoin(schema.models, eq(schema.personaPatterns.modelId, schema.models.id))
      .where(and(...conditions))
      .orderBy(desc(schema.personaPatterns.usageCount), sql`win_rate DESC`);

    return result as PersonaCorrelation[];
  }

  async getModelPersonaFingerprint(modelId: string): Promise<{
    mafia: schema.PersonaPattern[];
    town: schema.PersonaPattern[];
    avgConsistency: number | null;
  }> {
    const [mafia, town] = await Promise.all([
      this.db.query.personaPatterns.findMany({
        where: and(
          eq(schema.personaPatterns.modelId, modelId),
          eq(schema.personaPatterns.team, 'mafia')
        ),
        orderBy: [desc(schema.personaPatterns.usageCount)],
      }),
      this.db.query.personaPatterns.findMany({
        where: and(
          eq(schema.personaPatterns.modelId, modelId),
          eq(schema.personaPatterns.team, 'town')
        ),
        orderBy: [desc(schema.personaPatterns.usageCount)],
      }),
    ]);

    // Calculate overall average consistency
    const allPatterns = [...mafia, ...town];
    let avgConsistency: number | null = null;
    if (allPatterns.length > 0) {
      const scores = allPatterns
        .filter(p => p.avgConsistencyScore !== null)
        .map(p => p.avgConsistencyScore!);
      if (scores.length > 0) {
        avgConsistency = scores.reduce((a, b) => a + b, 0) / scores.length;
      }
    }

    return { mafia, town, avgConsistency };
  }

  async getTeamPersonaDivergence(): Promise<{
    mafia: { personality: string; percentage: number }[];
    town: { personality: string; percentage: number }[];
  }> {
    const [mafiaResult, townResult] = await Promise.all([
      this.db
        .select({
          personality: schema.personaPatterns.personalityType,
          total_usage: sql<number>`SUM(${schema.personaPatterns.usageCount})`,
        })
        .from(schema.personaPatterns)
        .where(eq(schema.personaPatterns.team, 'mafia'))
        .groupBy(schema.personaPatterns.personalityType)
        .orderBy(sql`total_usage DESC`),
      this.db
        .select({
          personality: schema.personaPatterns.personalityType,
          total_usage: sql<number>`SUM(${schema.personaPatterns.usageCount})`,
        })
        .from(schema.personaPatterns)
        .where(eq(schema.personaPatterns.team, 'town'))
        .groupBy(schema.personaPatterns.personalityType)
        .orderBy(sql`total_usage DESC`),
    ]);

    const mafiaTotal = mafiaResult.reduce((sum, r) => sum + r.total_usage, 0);
    const townTotal = townResult.reduce((sum, r) => sum + r.total_usage, 0);

    return {
      mafia: mafiaResult.map(r => ({
        personality: r.personality,
        percentage: mafiaTotal > 0 ? (r.total_usage / mafiaTotal) * 100 : 0,
      })),
      town: townResult.map(r => ({
        personality: r.personality,
        percentage: townTotal > 0 ? (r.total_usage / townTotal) * 100 : 0,
      })),
    };
  }

  async getWinRateByPersonality(options?: { team?: 'mafia' | 'town' }): Promise<
    { personality: string; win_rate: number; games: number }[]
  > {
    const baseQuery = this.db
      .select({
        personality: schema.personaPatterns.personalityType,
        games: sql<number>`SUM(${schema.personaPatterns.usageCount})`,
        win_rate: sql<number>`CASE WHEN SUM(${schema.personaPatterns.usageCount}) > 0
          THEN CAST(SUM(${schema.personaPatterns.winCount}) AS REAL) / SUM(${schema.personaPatterns.usageCount})
          ELSE 0 END`,
      })
      .from(schema.personaPatterns);

    const result = options?.team
      ? await baseQuery
          .where(eq(schema.personaPatterns.team, options.team))
          .groupBy(schema.personaPatterns.personalityType)
          .orderBy(sql`win_rate DESC`)
      : await baseQuery
          .groupBy(schema.personaPatterns.personalityType)
          .orderBy(sql`win_rate DESC`);

    return result;
  }
}

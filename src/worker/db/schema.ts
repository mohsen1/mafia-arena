/**
 * Drizzle ORM Schema for Mafia Arena D1 Database
 * 
 * This file is the single source of truth for database types.
 * Generated via introspection, refined with proper type mappings.
 */

import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// =============================================================================
// MODELS & PROVIDERS
// =============================================================================

/**
 * AI model registry with ELO ratings and multi-provider support.
 */
export const models = sqliteTable('models', {
  id: text('id').primaryKey(),
  family: text('family').notNull(), // Model family (google, openai, anthropic, meta)
  displayName: text('display_name').notNull(),
  config: text('config', { mode: 'json' }).$type<{
    contextLength?: number;
    pricing?: { inputPer1K: number; outputPer1K: number };
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
  // Multi-provider support (migration 0025)
  apiProvider: text('api_provider').default('openrouter'),
  apiModelId: text('api_model_id'),
  // ELO rating system (migration 0024)
  eloRating: integer('elo_rating').default(1500),
  eloGamesPlayed: integer('elo_games_played').default(0),
  eloPeak: integer('elo_peak').default(1500),
  eloUpdatedAt: integer('elo_updated_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('idx_models_elo').on(table.eloRating),
  index('idx_models_api_provider').on(table.apiProvider),
]);

/**
 * API provider registry for multi-provider architecture.
 */
export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  apiType: text('api_type').$type<'openai_compatible' | 'anthropic' | 'google' | 'custom'>().notNull(),
  baseUrl: text('base_url'),
  isAggregator: integer('is_aggregator', { mode: 'boolean' }).default(false),
  supportsStreaming: integer('supports_streaming', { mode: 'boolean' }).default(true),
  supportsFunctionCalling: integer('supports_function_calling', { mode: 'boolean' }).default(true),
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
});

// =============================================================================
// GAMES
// =============================================================================

/**
 * Game metadata - core game records.
 */
export const games = sqliteTable('games', {
  id: text('id').primaryKey(),
  batchId: text('batch_id'),
  configHash: text('config_hash').notNull(),
  playerCount: integer('player_count').notNull(),
  mafiaCount: integer('mafia_count').notNull(),
  winner: text('winner').$type<'mafia' | 'town'>(),
  rounds: integer('rounds').default(0),
  durationMs: integer('duration_ms').default(0),
  totalTokens: integer('total_tokens').default(0),
  /** Calculated cost in USD based on actual model pricing */
  costUsd: real('cost_usd').default(0),
  status: text('status').$type<'running' | 'completed' | 'failed'>().default('completed').notNull(),
  errorMessage: text('error_message'),
  seed: integer('seed'),
  personaEnabled: integer('persona_enabled', { mode: 'boolean' }).default(false),
  personaTheme: text('persona_theme').$type<'noir' | 'victorian' | 'modern' | 'fantasy'>(),
  traceId: text('trace_id'),
  discountPricing: integer('discount_pricing', { mode: 'boolean' }).default(false).notNull(),
  lastActivity: integer('last_activity', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
}, (table) => [
  index('idx_games_created').on(table.createdAt),
  index('idx_games_batch').on(table.batchId),
  index('idx_games_status').on(table.status),
  index('idx_games_persona_theme').on(table.personaTheme),
  index('idx_games_trace_id').on(table.traceId),
  index('idx_games_running_activity').on(table.status, table.discountPricing, table.lastActivity),
]);

/**
 * Game participants - which models played in each game.
 */
export const gameParticipants = sqliteTable('game_participants', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull().references(() => models.id),
  team: text('team').$type<'mafia' | 'town'>().notNull(),
  playerCount: integer('player_count').notNull(),
  won: integer('won', { mode: 'boolean' }).notNull(),
  consistencyScore: real('consistency_score'),
  /** Input tokens used by this participant (for accurate cost calculation) */
  inputTokens: integer('input_tokens').default(0),
  /** Output tokens used by this participant (for accurate cost calculation) */
  outputTokens: integer('output_tokens').default(0),
}, (table) => [
  index('idx_participants_game').on(table.gameId),
  index('idx_participants_model').on(table.modelId),
]);

/**
 * Game summaries for context compression.
 */
export const gameSummaries = sqliteTable('game_summaries', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(),
  roundStart: integer('round_start').notNull(),
  roundEnd: integer('round_end').notNull(),
  summaryType: text('summary_type').$type<'conversation' | 'votes' | 'full'>().notNull(),
  summaryText: text('summary_text').notNull(),
  tokenCount: integer('token_count').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  index('idx_summaries_game_model').on(table.gameId, table.modelId),
  index('idx_summaries_game_rounds').on(table.gameId, table.roundStart, table.roundEnd),
]);

// =============================================================================
// LEADERBOARD & STATS
// =============================================================================

/**
 * Aggregated leaderboard - win/loss stats per model per team.
 */
export const leaderboard = sqliteTable('leaderboard', {
  modelId: text('model_id').notNull().references(() => models.id),
  team: text('team').$type<'mafia' | 'town'>().notNull(),
  gamesPlayed: integer('games_played').default(0).notNull(),
  gamesWon: integer('games_won').default(0).notNull(),
  totalTokens: integer('total_tokens').default(0).notNull(),
  /** Aggregated cost in USD for all games by this model/team */
  costUsd: real('cost_usd').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  primaryKey({ columns: [table.modelId, table.team] }),
]);

/**
 * Daily statistics for trends.
 */
export const dailyStats = sqliteTable('daily_stats', {
  date: text('date').primaryKey(), // YYYY-MM-DD format
  gamesCompleted: integer('games_completed').default(0),
  gamesFailed: integer('games_failed').default(0),
  tokensUsed: integer('tokens_used').default(0),
  costUsd: real('cost_usd'),
  mafiaWins: integer('mafia_wins').default(0),
  townWins: integer('town_wins').default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`),
}, (table) => [
  index('idx_daily_stats_date').on(table.date),
]);

/**
 * ELO rating history for tracking rating changes over time.
 */
export const eloHistory = sqliteTable('elo_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  modelId: text('model_id').notNull().references(() => models.id),
  gameId: text('game_id').notNull().references(() => games.id),
  ratingBefore: integer('rating_before').notNull(),
  ratingAfter: integer('rating_after').notNull(),
  ratingChange: integer('rating_change').notNull(),
  opponentRating: integer('opponent_rating').notNull(),
  won: integer('won', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  index('idx_elo_history_model').on(table.modelId),
  index('idx_elo_history_game').on(table.gameId),
]);

// =============================================================================
// PERSONAS
// =============================================================================

/**
 * Generated personas for each player in each game.
 */
export const gamePersonas = sqliteTable('game_personas', {
  id: text('id').primaryKey(),
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  playerId: text('player_id').notNull(),
  modelId: text('model_id').notNull().references(() => models.id),
  team: text('team').$type<'mafia' | 'town'>().notNull(),
  personaName: text('persona_name').notNull(),
  personaBackground: text('persona_background').notNull(),
  personaPersonality: text('persona_personality').notNull(),
  personaOccupation: text('persona_occupation'),
  consistencyScore: real('consistency_score'),
  nameUsageCount: integer('name_usage_count').default(0),
  personalityAlignmentScore: real('personality_alignment_score'),
  inconsistencies: text('inconsistencies', { mode: 'json' }).$type<string[]>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  index('idx_game_personas_game').on(table.gameId),
  index('idx_game_personas_model').on(table.modelId),
  index('idx_game_personas_personality').on(table.personaPersonality),
]);

/**
 * Game-level persona analysis summary.
 */
export const gamePersonaAnalysis = sqliteTable('game_persona_analysis', {
  gameId: text('game_id').primaryKey().references(() => games.id, { onDelete: 'cascade' }),
  averageConsistencyScore: real('average_consistency_score').notNull(),
  mafiaAvgConsistency: real('mafia_avg_consistency').notNull(),
  townAvgConsistency: real('town_avg_consistency').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
});

/**
 * Aggregated persona patterns per model for bias analysis.
 */
export const personaPatterns = sqliteTable('persona_patterns', {
  modelId: text('model_id').notNull().references(() => models.id),
  team: text('team').$type<'mafia' | 'town'>().notNull(),
  personalityType: text('personality_type').notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  avgConsistencyScore: real('avg_consistency_score'),
  winCount: integer('win_count').default(0).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  primaryKey({ columns: [table.modelId, table.team, table.personalityType] }),
  index('idx_persona_patterns_model').on(table.modelId),
]);

/**
 * Aggregated name patterns for detecting bias in name choices.
 */
export const personaNamePatterns = sqliteTable('persona_name_patterns', {
  modelId: text('model_id').notNull().references(() => models.id),
  team: text('team').$type<'mafia' | 'town'>().notNull(),
  namePattern: text('name_pattern').notNull(),
  usageCount: integer('usage_count').default(0).notNull(),
  winCount: integer('win_count').default(0).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  primaryKey({ columns: [table.modelId, table.team, table.namePattern] }),
  index('idx_persona_name_patterns_model').on(table.modelId),
]);

// =============================================================================
// BATCHES & QUEUES
// =============================================================================

/**
 * Batch job tracking.
 */
export const batches = sqliteTable('batches', {
  id: text('id').primaryKey(),
  name: text('name'),
  status: text('status').$type<'queued' | 'processing' | 'completed' | 'cancelled' | 'paused'>().default('queued'),
  totalGames: integer('total_games').notNull(),
  completedGames: integer('completed_games').default(0),
  failedGames: integer('failed_games').default(0),
  configJson: text('config_json', { mode: 'json' }).$type<{
    playerCount: number;
    mafiaCount: number;
    teams: Array<{ modelId: string; team: 'mafia' | 'town'; count: number }>;
    [key: string]: unknown;
  }>().notNull(),
  estimatedCostUsd: real('estimated_cost_usd'),
  actualCostUsd: real('actual_cost_usd'),
  createdBy: text('created_by').default('api'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  errorMessage: text('error_message'),
}, (table) => [
  index('idx_batches_status').on(table.status),
  index('idx_batches_created').on(table.createdAt),
]);

/**
 * Dead letter queue entries for failed messages.
 */
export const dlqEntries = sqliteTable('dlq_entries', {
  id: text('id').primaryKey(),
  queueName: text('queue_name').notNull(),
  messageBody: text('message_body', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
  attempts: integer('attempts').default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`),
  retriedAt: integer('retried_at', { mode: 'timestamp_ms' }),
  status: text('status').$type<'pending' | 'retried' | 'discarded'>().default('pending'),
}, (table) => [
  index('idx_dlq_status').on(table.status, table.createdAt),
  index('idx_dlq_queue').on(table.queueName, table.status),
]);

// =============================================================================
// SYSTEM
// =============================================================================

/**
 * Error log for debugging.
 */
export const errorLog = sqliteTable('error_log', {
  id: text('id').primaryKey(),
  level: text('level').$type<'error' | 'warn' | 'info'>().notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
  context: text('context', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`).notNull(),
}, (table) => [
  index('idx_error_log_level').on(table.level),
  index('idx_error_log_created').on(table.createdAt),
]);

/**
 * System state key-value store.
 */
export const systemState = sqliteTable('system_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).default(sql`(unixepoch() * 1000)`),
});

/**
 * D1 migration tracking (internal).
 */
export const d1Migrations = sqliteTable('d1_migrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  appliedAt: text('applied_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Inferred types for selects (reading from DB)
export type Model = typeof models.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Game = typeof games.$inferSelect;
export type GameParticipant = typeof gameParticipants.$inferSelect;
export type GameSummary = typeof gameSummaries.$inferSelect;
export type LeaderboardEntry = typeof leaderboard.$inferSelect;
export type DailyStat = typeof dailyStats.$inferSelect;
export type EloHistoryEntry = typeof eloHistory.$inferSelect;
export type GamePersona = typeof gamePersonas.$inferSelect;
export type GamePersonaAnalysisEntry = typeof gamePersonaAnalysis.$inferSelect;
export type PersonaPattern = typeof personaPatterns.$inferSelect;
export type PersonaNamePattern = typeof personaNamePatterns.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type DlqEntry = typeof dlqEntries.$inferSelect;
export type ErrorLogEntry = typeof errorLog.$inferSelect;
export type SystemStateEntry = typeof systemState.$inferSelect;

// Inferred types for inserts (writing to DB)
export type NewModel = typeof models.$inferInsert;
export type NewProvider = typeof providers.$inferInsert;
export type NewGame = typeof games.$inferInsert;
export type NewGameParticipant = typeof gameParticipants.$inferInsert;
export type NewGameSummary = typeof gameSummaries.$inferInsert;
export type NewLeaderboardEntry = typeof leaderboard.$inferInsert;
export type NewDailyStat = typeof dailyStats.$inferInsert;
export type NewEloHistoryEntry = typeof eloHistory.$inferInsert;
export type NewGamePersona = typeof gamePersonas.$inferInsert;
export type NewGamePersonaAnalysis = typeof gamePersonaAnalysis.$inferInsert;
export type NewPersonaPattern = typeof personaPatterns.$inferInsert;
export type NewPersonaNamePattern = typeof personaNamePatterns.$inferInsert;
export type NewBatch = typeof batches.$inferInsert;
export type NewDlqEntry = typeof dlqEntries.$inferInsert;
export type NewErrorLogEntry = typeof errorLog.$inferInsert;
export type NewSystemStateEntry = typeof systemState.$inferInsert;


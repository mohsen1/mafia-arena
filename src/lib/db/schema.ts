import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  primaryKey,
} from 'drizzle-orm/pg-core';
import type { AdapterAccount } from 'next-auth/adapters';
import { relations } from 'drizzle-orm';

// NextAuth.js required tables
export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  password: text('password'), // For username/password authentication
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccount['type']>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// Application-specific tables
export const games = pgTable('games', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  themeKey: text('theme_key').notNull(),
  language: text('language').notNull().default('en'),
  round: integer('round').notNull().default(0),
  phase: text('phase').notNull().default('Init'),
  status: text('status').notNull().default('active'), // active, completed, abandoned
  winCondition: text('win_condition'), // null, 'Mafia', 'Town'
  isPublic: boolean('is_public').notNull().default(false),
  gameState: jsonb('game_state').notNull(), // Full serializable game state
  version: integer('version').notNull().default(1), // Optimistic locking version
});

export const gameParticipants = pgTable('game_participants', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // null for AI players
  playerId: text('player_id').notNull(), // In-game player identifier
  playerName: text('player_name').notNull(),
  roleName: text('role_name').notNull(),
  allegiance: text('allegiance').notNull(), // 'Mafia' | 'Town'
  isHuman: boolean('is_human').notNull().default(false),
  isAlive: boolean('is_alive').notNull().default(true),
  imageUrl: text('image_url'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const userPreferences = pgTable('user_preferences', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  preferredLanguage: text('preferred_language').notNull().default('en'),
  preferredTheme: text('preferred_theme').notNull().default('system'), // light, dark, system
  defaultGameTheme: text('default_game_theme')
    .notNull()
    .default('UK_VILLAGE_1900S'),
  preferredAiModel: text('preferred_ai_model')
    .notNull()
    .default('gemma2-9b-it'),
  enableSoundEffects: boolean('enable_sound_effects').notNull().default(true),
  enableTTS: boolean('enable_tts').notNull().default(false),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

export const userApiKeys = pgTable('user_api_keys', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // e.g., 'openai', 'anthropic', 'gemini', 'groq'
  keyName: text('key_name').notNull(), // User-friendly name like "My OpenAI Key"
  encryptedApiKey: text('encrypted_api_key').notNull(), // Encrypted API key
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// User Achievements table
export const userAchievements = pgTable('user_achievements', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  achievementId: text('achievement_id').notNull(),
  progress: integer('progress').notNull().default(0),
  maxProgress: integer('max_progress').notNull().default(1),
  unlockedAt: timestamp('unlocked_at', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// Game Statistics table
export const gameStatistics = pgTable('game_statistics', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  gameId: text('game_id')
    .notNull()
    .references(() => games.id, { onDelete: 'cascade' }),
  participantId: text('participant_id')
    .notNull()
    .references(() => gameParticipants.id, { onDelete: 'cascade' }),

  // Game outcome
  won: boolean('won').notNull(),
  survived: boolean('survived').notNull(),
  roundsPlayed: integer('rounds_played').notNull(),
  gameDuration: integer('game_duration').notNull(), // in seconds

  // Performance metrics
  messagesCount: integer('messages_count').notNull().default(0),
  votesCount: integer('votes_count').notNull().default(0),
  correctVotes: integer('correct_votes').notNull().default(0), // votes for actual mafia
  votesReceived: integer('votes_received').notNull().default(0),

  // Role-specific stats
  roleActions: integer('role_actions').notNull().default(0), // seer investigations, doctor saves, mafia kills
  successfulActions: integer('successful_actions').notNull().default(0), // successful saves, correct investigations

  // Social metrics
  trustScore: integer('trust_score'), // calculated based on voting patterns
  influenceScore: integer('influence_score'), // how often others followed their voting lead

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// Aggregated User Statistics table (for fast queries)
export const userStatsSummary = pgTable('user_stats_summary', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),

  // Overall stats
  totalGames: integer('total_games').notNull().default(0),
  totalWins: integer('total_wins').notNull().default(0),
  winRate: integer('win_rate').notNull().default(0), // stored as percentage (0-100)

  // Role-specific stats
  gamesAsVillager: integer('games_as_villager').notNull().default(0),
  winsAsVillager: integer('wins_as_villager').notNull().default(0),
  gamesAsMafia: integer('games_as_mafia').notNull().default(0),
  winsAsMafia: integer('wins_as_mafia').notNull().default(0),
  gamesAsSeer: integer('games_as_seer').notNull().default(0),
  winsAsSeer: integer('wins_as_seer').notNull().default(0),
  gamesAsDoctor: integer('games_as_doctor').notNull().default(0),
  winsAsDoctor: integer('wins_as_doctor').notNull().default(0),

  // Streaks
  currentWinStreak: integer('current_win_streak').notNull().default(0),
  longestWinStreak: integer('longest_win_streak').notNull().default(0),

  // Activity metrics
  totalPlayTime: integer('total_play_time').notNull().default(0), // in seconds
  averageGameDuration: integer('average_game_duration').notNull().default(0), // in seconds
  lastPlayedAt: timestamp('last_played_at', { mode: 'date' }),

  // Social metrics
  averageTrustScore: integer('average_trust_score').notNull().default(0),
  averageInfluenceScore: integer('average_influence_score')
    .notNull()
    .default(0),
  favoriteRole: text('favorite_role'), // most played role

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// Relations
export const userAchievementsRelations = relations(
  userAchievements,
  ({ one }) => ({
    user: one(users, {
      fields: [userAchievements.userId],
      references: [users.id],
    }),
  })
);

export const gamesRelations = relations(games, ({ many }) => ({
  participants: many(gameParticipants),
}));

export const gameStatisticsRelations = relations(gameStatistics, ({ one }) => ({
  user: one(users, {
    fields: [gameStatistics.userId],
    references: [users.id],
  }),
  game: one(games, {
    fields: [gameStatistics.gameId],
    references: [games.id],
  }),
  participant: one(gameParticipants, {
    fields: [gameStatistics.participantId],
    references: [gameParticipants.id],
  }),
}));

export const userStatsSummaryRelations = relations(
  userStatsSummary,
  ({ one }) => ({
    user: one(users, {
      fields: [userStatsSummary.userId],
      references: [users.id],
    }),
  })
);

// Types for easier usage
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GameParticipant = typeof gameParticipants.$inferSelect;
export type NewGameParticipant = typeof gameParticipants.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
export type UserApiKey = typeof userApiKeys.$inferSelect;
export type NewUserApiKey = typeof userApiKeys.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
export type GameStatistics = typeof gameStatistics.$inferSelect;
export type NewGameStatistics = typeof gameStatistics.$inferInsert;
export type UserStatsSummary = typeof userStatsSummary.$inferSelect;
export type NewUserStatsSummary = typeof userStatsSummary.$inferInsert;

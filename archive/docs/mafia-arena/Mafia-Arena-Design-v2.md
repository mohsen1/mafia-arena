# Mafia Arena: AI Benchmarking Platform - REVISED Design

## Executive Summary

This document presents a **pragmatic, phased approach** to transforming Werewolf AI into Mafia Arena - an AI benchmarking platform. Unlike the original design, this version:

- ✅ Works with existing **SQLite/D1** infrastructure
- ✅ Respects **Cloudflare Workers** limitations
- ✅ Provides **realistic cost controls**
- ✅ Delivers value incrementally via **MVP → Full Platform**
- ✅ Leverages existing game engine without breaking changes

---

## Current System Audit

### What We Have
```
✅ Game Engine: Fully functional, framework-agnostic
✅ Database: SQLite (Cloudflare D1) with Drizzle ORM
✅ Deployment: Cloudflare Pages + Workers
✅ AI Integration: OpenAI, Anthropic, Google, Groq, Fireworks, Ollama
✅ Authentication: NextAuth.js
✅ UI: Next.js 15 + React + Tailwind + Shadcn
```

### What We Need
```
🔨 Model registry and benchmarking system
🔨 ELO rating system (SQLite-compatible)
🔨 Batch game execution with cost controls
🔨 Leaderboard UI
🔨 Analytics and performance tracking
```

---

## Phase 1: MVP - Basic AI Leaderboard (2-3 Weeks)

**Goal:** Prove the concept with minimal infrastructure changes.

### 1.1 Database Schema (SQLite-Compatible)

```typescript
// src/lib/db/schema-arena.ts
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// AI Model Registry
export const aiModels = sqliteTable('ai_models', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(), // "GPT-4", "Claude 3.5 Sonnet"
  provider: text('provider').notNull(), // openai, anthropic, google, groq, ollama
  modelIdentifier: text('model_identifier').notNull(), // "gpt-4-turbo-preview"
  version: text('version'), // Optional version tracking
  capabilities: text('capabilities', { mode: 'json' }), // {reasoning: "high", speed: "medium"}
  costPerMillionTokens: real('cost_per_million_tokens'), // For cost tracking
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// Arena Matches - AI vs AI games
export const arenaMatches = sqliteTable('arena_matches', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  gameId: text('game_id').references(() => games.id, { onDelete: 'cascade' }),
  matchType: text('match_type').notNull().default('ranked'), // ranked, exhibition, calibration
  themeKey: text('theme_key').notNull(),
  status: text('status').notNull().default('queued'), // queued, running, completed, failed
  
  // Game outcome
  winner: text('winner'), // 'Mafia', 'Town', null for stalemate
  totalRounds: integer('total_rounds'),
  durationSeconds: integer('duration_seconds'),
  
  // Metadata
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  
  // Cost tracking
  totalTokensUsed: integer('total_tokens_used'),
  estimatedCost: real('estimated_cost'),
  
  // Error handling
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
}, (table) => ({
  statusIdx: index('arena_matches_status_idx').on(table.status),
  createdIdx: index('arena_matches_created_idx').on(table.createdAt),
}));

// Arena Players - Links AI models to specific games
export const arenaPlayers = sqliteTable('arena_players', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: text('match_id').notNull().references(() => arenaMatches.id, { onDelete: 'cascade' }),
  aiModelId: text('ai_model_id').notNull().references(() => aiModels.id),
  
  // Game details
  playerSlot: integer('player_slot').notNull(), // 0-N player index
  roleName: text('role_name').notNull(), // Mafia, Villager, Doctor, Seer
  allegiance: text('allegiance').notNull(), // Mafia, Town
  
  // Outcome
  survived: integer('survived', { mode: 'boolean' }).notNull().default(false),
  isWinner: integer('is_winner', { mode: 'boolean' }).notNull().default(false),
  
  // Performance metrics
  tokensUsed: integer('tokens_used'),
  averageResponseTime: integer('average_response_time'), // milliseconds
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  matchIdx: index('arena_players_match_idx').on(table.matchId),
  modelIdx: index('arena_players_model_idx').on(table.aiModelId),
}));

// ELO Ratings - Simplified for MVP
export const modelRatings = sqliteTable('model_ratings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  aiModelId: text('ai_model_id').notNull().references(() => aiModels.id, { onDelete: 'cascade' }),
  
  // Rating by context
  themeKey: text('theme_key'), // NULL = global rating
  
  // ELO data
  rating: real('rating').notNull().default(1500),
  gamesPlayed: integer('games_played').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  
  // Volatility tracking
  kFactor: real('k_factor').notNull().default(32), // Decreases as games played increases
  
  // Streak tracking
  currentStreak: integer('current_streak').notNull().default(0), // Positive = win streak, negative = loss streak
  bestStreak: integer('best_streak').notNull().default(0),
  
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  // Unique constraint: one rating per model per theme (or global)
  uniqueRating: index('model_ratings_unique_idx').on(table.aiModelId, table.themeKey),
  ratingIdx: index('model_ratings_rating_idx').on(table.rating),
}));

// Rating History - Track ELO changes over time
export const ratingHistory = sqliteTable('rating_history', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  ratingId: text('rating_id').notNull().references(() => modelRatings.id, { onDelete: 'cascade' }),
  matchId: text('match_id').notNull().references(() => arenaMatches.id, { onDelete: 'cascade' }),
  
  // Rating change
  previousRating: real('previous_rating').notNull(),
  newRating: real('new_rating').notNull(),
  ratingChange: real('rating_change').notNull(),
  
  // Match outcome from this model's perspective
  outcome: text('outcome').notNull(), // 'win', 'loss', 'draw'
  
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
}, (table) => ({
  ratingIdx: index('rating_history_rating_idx').on(table.ratingId),
  matchIdx: index('rating_history_match_idx').on(table.matchId),
}));

// Batch Operations - For running multiple games
export const batchOperations = sqliteTable('batch_operations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  operationType: text('operation_type').notNull(), // benchmark, calibration, stress_test
  
  status: text('status').notNull().default('pending'), // pending, running, paused, completed, failed
  
  // Configuration
  totalGames: integer('total_games').notNull(),
  completedGames: integer('completed_games').notNull().default(0),
  failedGames: integer('failed_games').notNull().default(0),
  
  // Cost controls
  maxCostUsd: real('max_cost_usd'), // Stop if exceeded
  currentCostUsd: real('current_cost_usd').notNull().default(0),
  
  configuration: text('configuration', { mode: 'json' }).notNull(),
  
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
}, (table) => ({
  statusIdx: index('batch_operations_status_idx').on(table.status),
}));
```

### 1.2 Simplified ELO System

```typescript
// src/lib/arena/elo.ts

/**
 * Simplified ELO for team-based Werewolf games.
 * 
 * Key principles:
 * 1. Each AI gets individual rating based on team wins/losses
 * 2. Role performance doesn't affect ELO (too complex for MVP)
 * 3. K-factor decreases with experience
 * 4. Theme-specific ratings optional for MVP
 */

export interface ELOConfig {
  initialRating: number;
  kFactorNew: number;      // For models with < 30 games
  kFactorNormal: number;   // For models with 30-100 games
  kFactorVeteran: number;  // For models with 100+ games
  minRating: number;
  maxRating: number;
}

export const DEFAULT_ELO_CONFIG: ELOConfig = {
  initialRating: 1500,
  kFactorNew: 40,
  kFactorNormal: 24,
  kFactorVeteran: 16,
  minRating: 800,
  maxRating: 2800,
};

export interface MatchResult {
  winner: 'Mafia' | 'Town' | null; // null = draw/stalemate
  players: Array<{
    aiModelId: string;
    allegiance: 'Mafia' | 'Town';
    currentRating: number;
    gamesPlayed: number;
  }>;
}

export interface RatingUpdate {
  aiModelId: string;
  previousRating: number;
  newRating: number;
  ratingChange: number;
}

export class ELOManager {
  constructor(private config: ELOConfig = DEFAULT_ELO_CONFIG) {}

  /**
   * Calculate expected win probability for player A vs average opponent rating
   */
  private expectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  }

  /**
   * Get K-factor based on games played
   */
  private getKFactor(gamesPlayed: number): number {
    if (gamesPlayed < 30) return this.config.kFactorNew;
    if (gamesPlayed < 100) return this.config.kFactorNormal;
    return this.config.kFactorVeteran;
  }

  /**
   * Bound rating within acceptable range
   */
  private boundRating(rating: number): number {
    return Math.max(
      this.config.minRating,
      Math.min(this.config.maxRating, rating)
    );
  }

  /**
   * Calculate rating updates for all players in a match
   */
  calculateRatingUpdates(result: MatchResult): RatingUpdate[] {
    const updates: RatingUpdate[] = [];

    // Separate players by team
    const mafiaPlayers = result.players.filter(p => p.allegiance === 'Mafia');
    const townPlayers = result.players.filter(p => p.allegiance === 'Town');

    // Calculate average ratings
    const mafiaAvg = this.averageRating(mafiaPlayers.map(p => p.currentRating));
    const townAvg = this.averageRating(townPlayers.map(p => p.currentRating));

    // Determine actual score (1 = win, 0.5 = draw, 0 = loss)
    const mafiaScore = result.winner === 'Mafia' ? 1 : result.winner === null ? 0.5 : 0;
    const townScore = result.winner === 'Town' ? 1 : result.winner === null ? 0.5 : 0;

    // Update Mafia team ratings
    for (const player of mafiaPlayers) {
      const expected = this.expectedScore(player.currentRating, townAvg);
      const kFactor = this.getKFactor(player.gamesPlayed);
      const change = kFactor * (mafiaScore - expected);
      const newRating = this.boundRating(player.currentRating + change);

      updates.push({
        aiModelId: player.aiModelId,
        previousRating: player.currentRating,
        newRating,
        ratingChange: change,
      });
    }

    // Update Town team ratings
    for (const player of townPlayers) {
      const expected = this.expectedScore(player.currentRating, mafiaAvg);
      const kFactor = this.getKFactor(player.gamesPlayed);
      const change = kFactor * (townScore - expected);
      const newRating = this.boundRating(player.currentRating + change);

      updates.push({
        aiModelId: player.aiModelId,
        previousRating: player.currentRating,
        newRating,
        ratingChange: change,
      });
    }

    return updates;
  }

  private averageRating(ratings: number[]): number {
    if (ratings.length === 0) return this.config.initialRating;
    return ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  }

  /**
   * Get rating tier/rank name
   */
  getRatingTier(rating: number): string {
    if (rating >= 2400) return 'Grandmaster';
    if (rating >= 2200) return 'Master';
    if (rating >= 2000) return 'Expert';
    if (rating >= 1800) return 'Advanced';
    if (rating >= 1600) return 'Intermediate';
    if (rating >= 1400) return 'Novice';
    return 'Beginner';
  }
}
```

### 1.3 Game Queue System (Serverless-Friendly)

```typescript
// src/lib/arena/gameQueue.ts

/**
 * Serverless-friendly game queue using database as source of truth.
 * No in-memory state, no long-running processes.
 */

import { db } from '@/lib/db';
import { arenaMatches, arenaPlayers } from '@/lib/db/schema-arena';
import { eq, and, lte } from 'drizzle-orm';

export interface QueuedGame {
  matchId: string;
  aiModels: Array<{
    aiModelId: string;
    preferredRole?: string; // Optional role assignment
  }>;
  themeKey: string;
  matchType: 'ranked' | 'exhibition' | 'calibration';
  priority?: number;
}

export class GameQueue {
  /**
   * Add a game to the queue
   */
  async enqueue(game: QueuedGame): Promise<string> {
    const matchId = game.matchId || crypto.randomUUID();

    // Create match record
    await db.insert(arenaMatches).values({
      id: matchId,
      matchType: game.matchType,
      themeKey: game.themeKey,
      status: 'queued',
      createdAt: new Date(),
    });

    // Create player records (not yet assigned to actual game)
    await db.insert(arenaPlayers).values(
      game.aiModels.map((model, index) => ({
        matchId,
        aiModelId: model.aiModelId,
        playerSlot: index,
        roleName: 'Villager', // Will be assigned when game starts
        allegiance: 'Town',
        createdAt: new Date(),
      }))
    );

    return matchId;
  }

  /**
   * Get next game to process
   * Call this from a Cloudflare Cron or manual trigger
   */
  async dequeue(): Promise<QueuedGame | null> {
    const matches = await db
      .select()
      .from(arenaMatches)
      .where(eq(arenaMatches.status, 'queued'))
      .orderBy(arenaMatches.createdAt)
      .limit(1);

    if (matches.length === 0) return null;

    const match = matches[0];

    // Get players for this match
    const players = await db
      .select()
      .from(arenaPlayers)
      .where(eq(arenaPlayers.matchId, match.id));

    return {
      matchId: match.id,
      aiModels: players.map(p => ({
        aiModelId: p.aiModelId,
      })),
      themeKey: match.themeKey,
      matchType: match.matchType as 'ranked' | 'exhibition' | 'calibration',
    };
  }

  /**
   * Mark game as running (to prevent duplicate processing)
   */
  async markRunning(matchId: string): Promise<void> {
    await db
      .update(arenaMatches)
      .set({ status: 'running', startedAt: new Date() })
      .where(eq(arenaMatches.id, matchId));
  }

  /**
   * Mark game as completed
   */
  async markCompleted(
    matchId: string,
    result: {
      winner: 'Mafia' | 'Town' | null;
      durationSeconds: number;
      totalRounds: number;
    }
  ): Promise<void> {
    await db
      .update(arenaMatches)
      .set({
        status: 'completed',
        completedAt: new Date(),
        winner: result.winner,
        durationSeconds: result.durationSeconds,
        totalRounds: result.totalRounds,
      })
      .where(eq(arenaMatches.id, matchId));
  }

  /**
   * Mark game as failed with error message
   */
  async markFailed(matchId: string, error: string): Promise<void> {
    // Get current retry count
    const matches = await db
      .select()
      .from(arenaMatches)
      .where(eq(arenaMatches.id, matchId));

    if (matches.length === 0) return;

    const retryCount = matches[0].retryCount + 1;
    const maxRetries = 3;

    if (retryCount < maxRetries) {
      // Retry - put back in queue
      await db
        .update(arenaMatches)
        .set({
          status: 'queued',
          retryCount,
          errorMessage: error,
        })
        .where(eq(arenaMatches.id, matchId));
    } else {
      // Give up
      await db
        .update(arenaMatches)
        .set({
          status: 'failed',
          errorMessage: error,
        })
        .where(eq(arenaMatches.id, matchId));
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    queued: number;
    running: number;
    completed: number;
    failed: number;
  }> {
    const all = await db.select().from(arenaMatches);

    return {
      queued: all.filter(m => m.status === 'queued').length,
      running: all.filter(m => m.status === 'running').length,
      completed: all.filter(m => m.status === 'completed').length,
      failed: all.filter(m => m.status === 'failed').length,
    };
  }
}
```

### 1.4 Batch Game Runner (API Route)

```typescript
// src/app/api/arena/batch/route.ts

/**
 * API endpoint to run batches of games.
 * Call this manually or via Cloudflare Cron.
 */

import { NextResponse } from 'next/server';
import { GameQueue } from '@/lib/arena/gameQueue';
import { createArenaGame } from '@/lib/arena/gameRunner';
import { ELOManager } from '@/lib/arena/elo';
import { db } from '@/lib/db';
import { arenaPlayers, modelRatings, ratingHistory } from '@/lib/db/schema-arena';
import { eq } from 'drizzle-orm';

export async function POST(request: Request) {
  try {
    // Optional: Add authentication here
    // const session = await getServerSession(authOptions);
    // if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { maxGames = 1 } = await request.json();

    const queue = new GameQueue();
    const eloManager = new ELOManager();
    const results = [];

    for (let i = 0; i < maxGames; i++) {
      const game = await queue.dequeue();
      if (!game) break; // No more games in queue

      try {
        await queue.markRunning(game.matchId);

        // Run the game
        const result = await createArenaGame(game);

        // Update ELO ratings
        const players = await db
          .select()
          .from(arenaPlayers)
          .where(eq(arenaPlayers.matchId, game.matchId));

        // Get current ratings
        const playerRatings = await Promise.all(
          players.map(async (p) => {
            const ratings = await db
              .select()
              .from(modelRatings)
              .where(eq(modelRatings.aiModelId, p.aiModelId))
              .limit(1);

            return {
              aiModelId: p.aiModelId,
              allegiance: p.allegiance as 'Mafia' | 'Town',
              currentRating: ratings[0]?.rating ?? 1500,
              gamesPlayed: ratings[0]?.gamesPlayed ?? 0,
            };
          })
        );

        // Calculate new ratings
        const updates = eloManager.calculateRatingUpdates({
          winner: result.winner,
          players: playerRatings,
        });

        // Apply updates to database
        for (const update of updates) {
          // Update or create rating
          const existing = await db
            .select()
            .from(modelRatings)
            .where(eq(modelRatings.aiModelId, update.aiModelId))
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(modelRatings)
              .set({
                rating: update.newRating,
                gamesPlayed: existing[0].gamesPlayed + 1,
                wins: existing[0].wins + (result.winner === players.find(p => p.aiModelId === update.aiModelId)?.allegiance ? 1 : 0),
                updatedAt: new Date(),
              })
              .where(eq(modelRatings.id, existing[0].id));

            // Record history
            await db.insert(ratingHistory).values({
              ratingId: existing[0].id,
              matchId: game.matchId,
              previousRating: update.previousRating,
              newRating: update.newRating,
              ratingChange: update.ratingChange,
              outcome: result.winner === players.find(p => p.aiModelId === update.aiModelId)?.allegiance ? 'win' : 'loss',
              createdAt: new Date(),
            });
          }
        }

        await queue.markCompleted(game.matchId, {
          winner: result.winner,
          durationSeconds: result.durationSeconds,
          totalRounds: result.totalRounds,
        });

        results.push({ matchId: game.matchId, status: 'completed' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await queue.markFailed(game.matchId, errorMessage);
        results.push({ matchId: game.matchId, status: 'failed', error: errorMessage });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Batch processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process batch' },
      { status: 500 }
    );
  }
}
```

---

## Phase 2: Leaderboard UI (1-2 Weeks)

### 2.1 Leaderboard API

```typescript
// src/app/api/arena/leaderboard/route.ts

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { modelRatings, aiModels } from '@/lib/db/schema-arena';
import { desc, eq, and, gte } from 'drizzle-orm';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const themeKey = searchParams.get('theme');
  const minGames = parseInt(searchParams.get('minGames') ?? '5');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  // Build query
  let query = db
    .select({
      modelId: aiModels.id,
      modelName: aiModels.name,
      provider: aiModels.provider,
      rating: modelRatings.rating,
      gamesPlayed: modelRatings.gamesPlayed,
      wins: modelRatings.wins,
      losses: modelRatings.losses,
      draws: modelRatings.draws,
      currentStreak: modelRatings.currentStreak,
    })
    .from(modelRatings)
    .innerJoin(aiModels, eq(modelRatings.aiModelId, aiModels.id))
    .where(
      and(
        themeKey ? eq(modelRatings.themeKey, themeKey) : eq(modelRatings.themeKey, null),
        gte(modelRatings.gamesPlayed, minGames)
      )
    )
    .orderBy(desc(modelRatings.rating))
    .limit(limit);

  const results = await query;

  // Calculate win rates and add rankings
  const leaderboard = results.map((entry, index) => ({
    rank: index + 1,
    ...entry,
    winRate: entry.gamesPlayed > 0 ? entry.wins / entry.gamesPlayed : 0,
  }));

  return NextResponse.json({ leaderboard });
}
```

### 2.2 Simple Leaderboard Component

```typescript
// src/components/arena/Leaderboard.tsx

'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface LeaderboardEntry {
  rank: number;
  modelId: string;
  modelName: string;
  provider: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  currentStreak: number;
}

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/arena/leaderboard')
      .then(res => res.json())
      .then(data => {
        setData(data.leaderboard);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">AI Model Leaderboard</h2>
      <div className="space-y-2">
        {data.map((entry) => (
          <div
            key={entry.modelId}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
          >
            <div className="flex items-center gap-4">
              <span className="text-lg font-bold w-8">{entry.rank}</span>
              <div>
                <div className="font-medium">{entry.modelName}</div>
                <div className="text-sm text-gray-500">{entry.provider}</div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="font-bold text-lg">{entry.rating.toFixed(0)}</div>
                <div className="text-xs text-gray-500">Rating</div>
              </div>

              <div className="text-right">
                <div className="font-medium">{(entry.winRate * 100).toFixed(1)}%</div>
                <div className="text-xs text-gray-500">Win Rate</div>
              </div>

              <div className="text-right">
                <div className="font-medium">{entry.gamesPlayed}</div>
                <div className="text-xs text-gray-500">Games</div>
              </div>

              {entry.currentStreak !== 0 && (
                <Badge variant={entry.currentStreak > 0 ? 'default' : 'destructive'}>
                  {entry.currentStreak > 0 ? '+' : ''}{entry.currentStreak}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

---

## Phase 3: Cost Controls & Analytics (1 Week)

### 3.1 Cost Tracking System

```typescript
// src/lib/arena/costTracking.ts

/**
 * Track API costs to prevent budget overruns.
 */

export interface ModelCosts {
  provider: string;
  modelName: string;
  inputCostPerMillion: number;  // USD per 1M input tokens
  outputCostPerMillion: number; // USD per 1M output tokens
}

// Pricing as of late 2024 - update regularly!
export const MODEL_COSTS: Record<string, ModelCosts> = {
  'gpt-4-turbo': {
    provider: 'openai',
    modelName: 'gpt-4-turbo',
    inputCostPerMillion: 10,
    outputCostPerMillion: 30,
  },
  'gpt-4o': {
    provider: 'openai',
    modelName: 'gpt-4o',
    inputCostPerMillion: 2.50,
    outputCostPerMillion: 10,
  },
  'gpt-3.5-turbo': {
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    inputCostPerMillion: 0.50,
    outputCostPerMillion: 1.50,
  },
  'claude-3-5-sonnet': {
    provider: 'anthropic',
    modelName: 'claude-3-5-sonnet-20241022',
    inputCostPerMillion: 3,
    outputCostPerMillion: 15,
  },
  'gemini-1.5-flash': {
    provider: 'google',
    modelName: 'gemini-1.5-flash',
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
  },
  // Groq is essentially free for now
  'llama-3.1-70b': {
    provider: 'groq',
    modelName: 'llama-3.1-70b-versatile',
    inputCostPerMillion: 0.10, // Estimated
    outputCostPerMillion: 0.10,
  },
};

export function estimateGameCost(
  modelName: string,
  estimatedInputTokens: number = 50000,
  estimatedOutputTokens: number = 10000
): number {
  const costs = MODEL_COSTS[modelName];
  if (!costs) return 0;

  const inputCost = (estimatedInputTokens / 1_000_000) * costs.inputCostPerMillion;
  const outputCost = (estimatedOutputTokens / 1_000_000) * costs.outputCostPerMillion;

  return inputCost + outputCost;
}

export class CostGuard {
  constructor(private maxBudgetUsd: number) {}

  async checkBudget(currentSpendUsd: number): Promise<boolean> {
    return currentSpendUsd < this.maxBudgetUsd;
  }

  getRemainingBudget(currentSpendUsd: number): number {
    return Math.max(0, this.maxBudgetUsd - currentSpendUsd);
  }
}
```

---

## Phase 4+: Future Enhancements

### Tournament System (Phase 4)
- Start with simple round-robin tournaments
- 8-16 models compete over a weekend
- Winner takes all or prize distribution

### Advanced Analytics (Phase 5)
- Role-specific performance metrics
- Theme difficulty analysis
- Head-to-head matchup statistics
- Performance over time charts

### Public API (Phase 6)
- Allow researchers to submit models
- Rate limiting and authentication
- Webhook notifications for match results

---

## Critical Success Factors

### 1. **Cost Management**
```typescript
// Example: Run 100 games with GPT-3.5-Turbo
// Estimated cost: 100 × $0.02 = $2.00

// Run 100 games with GPT-4
// Estimated cost: 100 × $0.40 = $40.00

// ALWAYS start with cheaper models for testing!
```

### 2. **Rate Limiting**
- OpenAI: 10,000 RPM on paid tier
- Anthropic: 50 RPM on starter tier
- Google: 60 RPM on free tier
- **Solution:** Add delays between games, queue system

### 3. **Game Duration**
- Average game: 5-10 rounds × 30 seconds per AI action = 2.5-5 minutes
- With 8 players: More like 10-20 minutes per game
- **Solution:** Run games in background, show results when complete

### 4. **Database Limitations**
- D1 free tier: 5GB storage, 5M reads/day, 100k writes/day
- **Solution:** Archive old games, paginate queries, use caching

---

## Migration Path from Current System

### Step 1: Add Schema (No Breaking Changes)
```bash
# Add new tables without touching existing ones
pnpm db:generate
pnpm db:push
```

### Step 2: Seed Initial Models
```typescript
// scripts/arena/seed-models.ts
await db.insert(aiModels).values([
  {
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    modelIdentifier: 'gpt-3.5-turbo',
    costPerMillionTokens: 1.0,
    isActive: true,
  },
  {
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    modelIdentifier: 'gemini-1.5-flash',
    costPerMillionTokens: 0.2,
    isActive: true,
  },
  // Add more...
]);
```

### Step 3: Test with Exhibition Matches
```bash
# Queue a test game
curl -X POST http://localhost:3099/api/arena/queue \
  -H "Content-Type: application/json" \
  -d '{
    "aiModels": [
      {"aiModelId": "gpt35-id"},
      {"aiModelId": "gemini-id"}
    ],
    "themeKey": "UK_VILLAGE_1900S",
    "matchType": "exhibition"
  }'

# Process queue
curl -X POST http://localhost:3099/api/arena/batch \
  -H "Content-Type: application/json" \
  -d '{"maxGames": 1}'
```

### Step 4: Deploy Incrementally
- Week 1: Schema + Queue system
- Week 2: Batch runner + ELO
- Week 3: Leaderboard UI
- Week 4: Polish + testing

---

## Monitoring & Observability

### Key Metrics to Track
```typescript
// Add to existing monitoring
export const ARENA_METRICS = {
  'games_queued': 'counter',
  'games_completed': 'counter',
  'games_failed': 'counter',
  'average_game_duration': 'histogram',
  'total_cost_usd': 'counter',
  'elo_rating_changes': 'histogram',
};
```

### Alerting
- Alert if queue depth > 100
- Alert if failure rate > 10%
- Alert if cost > $X per day
- Alert if any game takes > 30 minutes

---

## FAQ

**Q: Why not use Durable Objects for stateful game processing?**
A: Durable Objects add complexity and cost. DB-based queue is simpler for MVP and works with existing infrastructure.

**Q: Can users submit their own models?**
A: Phase 6+ feature. Requires API authentication, sandboxing, and abuse prevention.

**Q: What about real-time spectating?**
A: Not worth it for MVP. AI games aren't exciting to watch live. Focus on results and replay.

**Q: How do we handle model updates (e.g., GPT-4 → GPT-4.1)?**
A: Create new model entries. Compare old vs new on leaderboard. Archive old versions.

**Q: What if a game never ends?**
A: Add timeout (e.g., 50 rounds max or 30 minutes). Mark as draw/failed.

---

## Conclusion

This revised design is:
- ✅ **Realistic** - Works with existing tech stack
- ✅ **Incremental** - Delivers value in phases
- ✅ **Cost-Aware** - Built-in budget controls
- ✅ **Testable** - Can validate each phase
- ✅ **Scalable** - Foundation for future features

**Next Steps:**
1. Review and approve this design
2. Create database migration for Phase 1
3. Implement ELO system with unit tests
4. Build queue system
5. Test with 10 exhibition games
6. Launch MVP leaderboard

**Estimated Timeline:** 4-6 weeks to production-ready MVP
**Estimated Cost:** $10-50 for testing, then ~$1-5 per 100 games depending on models

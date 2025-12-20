/**
 * GameRunner Durable Object
 * Runs a single Mafia game, handling AI calls with retry logic
 * and persisting results to D1 and R2.
 * 
 * BENCHMARK INTEGRITY:
 * - Uses ctx.storage to persist state across DO evictions
 * - Idempotent result persistence to prevent double-counting
 * - Records seed for game reproducibility
 */

import { DurableObject } from 'cloudflare:workers';
import type { Env, GameQueueConfig } from './types.js';
import { Game, validateConfig, type GameConfig, type GameResult } from '../engine/index.js';
import { createProvidersForGame, GameAIAdapter } from './ai/index.js';
import { generateSeed } from '../engine/utils/random.js';

/** Storage keys for DO state persistence */
const STORAGE_KEYS = {
  STATUS: 'status',
  GAME_ID: 'gameId',
  BATCH_ID: 'batchId',
  STARTED_AT: 'startedAt',
  COMPLETED_AT: 'completedAt',
  ERROR: 'error',
  CONFIG: 'config',
  SEED: 'seed',
} as const;

interface GameRunnerState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  gameId: string | null;
  batchId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  seed: number | null;
}

export class GameRunner extends DurableObject<Env> {
  private stateCache: GameRunnerState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  /**
   * Load state from storage or return cached state.
   */
  private async loadState(): Promise<GameRunnerState> {
    if (this.stateCache) {
      return this.stateCache;
    }

    const storage = this.ctx.storage;
    
    const [status, gameId, batchId, startedAt, completedAt, error, seed] = await Promise.all([
      storage.get<GameRunnerState['status']>(STORAGE_KEYS.STATUS),
      storage.get<string>(STORAGE_KEYS.GAME_ID),
      storage.get<string>(STORAGE_KEYS.BATCH_ID),
      storage.get<number>(STORAGE_KEYS.STARTED_AT),
      storage.get<number>(STORAGE_KEYS.COMPLETED_AT),
      storage.get<string>(STORAGE_KEYS.ERROR),
      storage.get<number>(STORAGE_KEYS.SEED),
    ]);

    this.stateCache = {
      status: status ?? 'idle',
      gameId: gameId ?? null,
      batchId: batchId ?? null,
      startedAt: startedAt ?? null,
      completedAt: completedAt ?? null,
      error: error ?? null,
      seed: seed ?? null,
    };

    return this.stateCache;
  }

  /**
   * Save state to storage.
   */
  private async saveState(state: Partial<GameRunnerState>): Promise<void> {
    const storage = this.ctx.storage;
    const updates: Promise<void>[] = [];

    if (state.status !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.STATUS, state.status));
      if (this.stateCache) this.stateCache.status = state.status;
    }
    if (state.gameId !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.GAME_ID, state.gameId));
      if (this.stateCache) this.stateCache.gameId = state.gameId;
    }
    if (state.batchId !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.BATCH_ID, state.batchId));
      if (this.stateCache) this.stateCache.batchId = state.batchId;
    }
    if (state.startedAt !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.STARTED_AT, state.startedAt));
      if (this.stateCache) this.stateCache.startedAt = state.startedAt;
    }
    if (state.completedAt !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.COMPLETED_AT, state.completedAt));
      if (this.stateCache) this.stateCache.completedAt = state.completedAt;
    }
    if (state.error !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.ERROR, state.error));
      if (this.stateCache) this.stateCache.error = state.error;
    }
    if (state.seed !== undefined) {
      updates.push(storage.put(STORAGE_KEYS.SEED, state.seed));
      if (this.stateCache) this.stateCache.seed = state.seed;
    }

    await Promise.all(updates);
  }

  /**
   * Handle incoming fetch requests.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/start':
        return this.handleStart(request);

      case '/status':
        return this.handleStatus();

      default:
        return new Response('Not found', { status: 404 });
    }
  }

  /**
   * Start a new game.
   */
  private async handleStart(request: Request): Promise<Response> {
    const currentState = await this.loadState();
    
    if (currentState.status === 'running') {
      return Response.json(
        { error: 'Game already running', gameId: currentState.gameId },
        { status: 409 }
      );
    }

    try {
      const body = await request.json() as {
        gameId: string;
        batchId: string;
        config: GameQueueConfig;
      };

      const { gameId, batchId, config } = body;

      // Generate seed for reproducibility if not provided
      const seed = config.seed ?? generateSeed();

      // Validate configuration
      const gameConfig = this.toGameConfig(config, seed);
      const validation = validateConfig(gameConfig);
      if (!validation.valid) {
        return Response.json(
          { error: 'Invalid configuration', details: validation.errors },
          { status: 400 }
        );
      }

      // Persist state to storage BEFORE starting
      await this.saveState({
        status: 'running',
        gameId,
        batchId,
        startedAt: Date.now(),
        completedAt: null,
        error: null,
        seed,
      });

      // Run the game synchronously so errors are properly surfaced
      try {
        await this.runGame(gameId, batchId, gameConfig);
        return Response.json({ success: true, gameId, seed, status: 'completed' });
      } catch (error) {
        console.error(`Game ${gameId} failed:`, error);
        await this.saveState({
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          completedAt: Date.now(),
        });
        return Response.json(
          { 
            success: false, 
            gameId, 
            seed, 
            status: 'failed',
            error: error instanceof Error ? error.message : String(error)
          },
          { status: 500 }
        );
      }
    } catch (error) {
      console.error('Failed to start game:', error);
      return Response.json(
        { error: 'Failed to start game', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  /**
   * Get the current game status.
   */
  private async handleStatus(): Promise<Response> {
    const state = await this.loadState();
    return Response.json(state);
  }

  /**
   * Run the game to completion.
   */
  private async runGame(gameId: string, batchId: string, config: GameConfig): Promise<void> {
    console.log(`Starting game ${gameId} (batch: ${batchId}, seed: ${config.seed})`);

    // Get all unique model IDs from the config
    const modelIds = config.teams.map((t) => t.modelId);

    // Create AI providers for all models
    const providers = createProvidersForGame(modelIds, this.env);
    const aiAdapter = new GameAIAdapter(providers);

    // Create and run the game
    const game = new Game(config, aiAdapter, { gameId });
    const result = await game.run();

    console.log(`Game ${gameId} completed: ${result.winner} wins in ${result.rounds} rounds`);

    // Persist results (idempotent)
    await this.persistResults(result, batchId);

    // Update state
    await this.saveState({
      status: 'completed',
      completedAt: Date.now(),
    });
  }

  /**
   * Persist game results to D1 and R2.
   * IDEMPOTENT: Checks if game already exists before inserting.
   */
  private async persistResults(result: GameResult, batchId: string): Promise<void> {
    const db = this.env.DB;
    const transcripts = this.env.TRANSCRIPTS;

    // Check if this game was already persisted (idempotency check)
    const existingGame = await db
      .prepare('SELECT id FROM games WHERE id = ?')
      .bind(result.id)
      .first();

    if (existingGame) {
      console.log(`Game ${result.id} already persisted, skipping to avoid double-counting`);
      return;
    }

    // Estimate cost (simplified - uses average token pricing)
    const costUsd = (result.tokenUsage.total / 1000) * 0.002;

    // Write to D1 - games table
    await db
      .prepare(
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, seed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        result.id,
        batchId,
        this.hashConfig(result.config),
        result.config.playerCount,
        result.config.mafiaCount,
        result.winner,
        result.rounds,
        result.durationMs,
        result.tokenUsage.total,
        'completed',
        result.config.seed ?? null,
        Date.now()
      )
      .run();

    // Log to Analytics Engine for real-time metrics (if available)
    if (this.env.ANALYTICS) {
      const modelIds = result.participants.map(p => p.modelId);
      this.env.ANALYTICS.writeDataPoint({
        blobs: [
          modelIds[0] ?? 'unknown',
          modelIds[1] ?? 'unknown',
          result.winner,
          batchId,
        ],
        doubles: [
          result.rounds,
          result.durationMs,
          result.tokenUsage.total,
          costUsd,
        ],
        indexes: [batchId],
      });
    }

    // Update batch progress (if part of a batch)
    if (batchId && !batchId.includes('direct')) {
      await this.updateBatchProgress(batchId, costUsd);
    }

    // Update daily stats
    await this.updateDailyStats(result, costUsd);

    // Write to D1 - game_participants table
    for (const participant of result.participants) {
      await db
        .prepare(
          `INSERT INTO game_participants (id, game_id, model_id, team, player_count, won)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          `${result.id}_${participant.modelId}_${participant.team}`,
          result.id,
          participant.modelId,
          participant.team,
          participant.playerCount,
          participant.won ? 1 : 0
        )
        .run();
    }

    // Update leaderboard (using proper aggregation)
    await this.updateLeaderboard(result);

    // Write full transcript to R2
    const transcript = {
      gameId: result.id,
      batchId,
      seed: result.config.seed,
      config: result.config,
      events: result.events,
      result: {
        winner: result.winner,
        rounds: result.rounds,
        participants: result.participants,
      },
      metadata: {
        totalTokens: result.tokenUsage,
        durationMs: result.durationMs,
        createdAt: Date.now(),
      },
    };

    await transcripts.put(
      `games/${result.id}/transcript.json`,
      JSON.stringify(transcript, null, 2),
      {
        httpMetadata: { contentType: 'application/json' },
      }
    );

    console.log(`Persisted results for game ${result.id}`);
  }

  /**
   * Update the leaderboard with game results.
   * Uses INSERT OR IGNORE + UPDATE pattern for idempotency.
   */
  private async updateLeaderboard(result: GameResult): Promise<void> {
    const db = this.env.DB;

    for (const participant of result.participants) {
      // Use a transaction-like pattern: INSERT if not exists, then UPDATE
      // This ensures we don't double-count even if called multiple times
      await db
        .prepare(
          `INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens, updated_at)
           VALUES (?, ?, 1, ?, ?, ?)
           ON CONFLICT (model_id, team) DO UPDATE SET
             games_played = games_played + 1,
             games_won = games_won + excluded.games_won,
             total_tokens = total_tokens + excluded.total_tokens,
             updated_at = excluded.updated_at`
        )
        .bind(
          participant.modelId,
          participant.team,
          participant.won ? 1 : 0,
          participant.tokensUsed,
          Date.now()
        )
        .run();
    }
  }

  /**
   * Convert queue config to game engine config.
   */
  private toGameConfig(config: GameQueueConfig, seed: number): GameConfig {
    return {
      playerCount: config.playerCount,
      mafiaCount: config.mafiaCount,
      teams: config.teams.map((t) => ({
        modelId: t.modelId,
        team: t.team,
        count: t.count,
      })),
      maxRounds: config.maxRounds,
      discussionEnabled: config.discussionEnabled,
      personaConstraints: config.personaConstraints,
      seed, // Include seed for reproducibility
      contextLevel: config.contextLevel ?? 'summary',
      contextWindowSize: config.contextWindowSize ?? 3,
    };
  }

  /**
   * Update batch progress after game completion.
   */
  private async updateBatchProgress(batchId: string, costUsd: number): Promise<void> {
    try {
      await this.env.DB.prepare(`
        UPDATE batches 
        SET completed_games = completed_games + 1,
            actual_cost_usd = actual_cost_usd + ?
        WHERE id = ?
      `).bind(costUsd, batchId).run();

      // Check if batch is complete
      const batch = await this.env.DB.prepare(`
        SELECT total_games, completed_games, failed_games, status
        FROM batches WHERE id = ?
      `).bind(batchId).first<{
        total_games: number;
        completed_games: number;
        failed_games: number;
        status: string;
      }>();

      if (batch && batch.status === 'processing') {
        const totalProcessed = batch.completed_games + batch.failed_games;
        if (totalProcessed >= batch.total_games) {
          await this.env.DB.prepare(`
            UPDATE batches 
            SET status = 'completed', completed_at = unixepoch()
            WHERE id = ?
          `).bind(batchId).run();
          console.log(`Batch ${batchId} completed`);
        }
      }
    } catch (error) {
      console.error(`Failed to update batch progress for ${batchId}:`, error);
    }
  }

  /**
   * Update daily statistics.
   */
  private async updateDailyStats(result: GameResult, costUsd: number): Promise<void> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const mafiaWon = result.winner === 'mafia' ? 1 : 0;
      const townWon = result.winner === 'town' ? 1 : 0;

      await this.env.DB.prepare(`
        INSERT INTO daily_stats (date, games_completed, games_failed, tokens_used, cost_usd, mafia_wins, town_wins)
        VALUES (?, 1, 0, ?, ?, ?, ?)
        ON CONFLICT (date) DO UPDATE SET
          games_completed = games_completed + 1,
          tokens_used = tokens_used + excluded.tokens_used,
          cost_usd = cost_usd + excluded.cost_usd,
          mafia_wins = mafia_wins + excluded.mafia_wins,
          town_wins = town_wins + excluded.town_wins,
          updated_at = unixepoch()
      `).bind(today, result.tokenUsage.total, costUsd, mafiaWon, townWon).run();
    } catch (error) {
      console.error('Failed to update daily stats:', error);
    }
  }

  /**
   * Create a hash of the game configuration for grouping.
   */
  private hashConfig(config: GameConfig): string {
    const key = JSON.stringify({
      playerCount: config.playerCount,
      mafiaCount: config.mafiaCount,
      teams: config.teams.map((t) => ({ modelId: t.modelId, team: t.team })).sort((a, b) =>
        `${a.modelId}:${a.team}`.localeCompare(`${b.modelId}:${b.team}`)
      ),
      discussionEnabled: config.discussionEnabled,
    });

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(16);
  }
}

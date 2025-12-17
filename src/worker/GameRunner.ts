/**
 * GameRunner Durable Object
 * Runs a single Mafia game, handling AI calls with retry logic
 * and persisting results to D1 and R2.
 */

import { DurableObject } from 'cloudflare:workers';
import type { Env, GameQueueConfig } from './types.js';
import { Game, validateConfig, type GameConfig, type GameResult } from '../engine/index.js';
import { createProvidersForGame, GameAIAdapter } from './ai/index.js';

interface GameRunnerState {
  status: 'idle' | 'running' | 'completed' | 'failed';
  gameId: string | null;
  batchId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

export class GameRunner extends DurableObject<Env> {
  private state: GameRunnerState = {
    status: 'idle',
    gameId: null,
    batchId: null,
    startedAt: null,
    completedAt: null,
    error: null,
  };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
    if (this.state.status === 'running') {
      return Response.json(
        { error: 'Game already running', gameId: this.state.gameId },
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

      // Validate configuration
      const gameConfig = this.toGameConfig(config);
      const validation = validateConfig(gameConfig);
      if (!validation.valid) {
        return Response.json(
          { error: 'Invalid configuration', details: validation.errors },
          { status: 400 }
        );
      }

      // Update state
      this.state = {
        status: 'running',
        gameId,
        batchId,
        startedAt: Date.now(),
        completedAt: null,
        error: null,
      };

      // Run the game asynchronously
      this.runGame(gameId, batchId, gameConfig).catch((error) => {
        console.error(`Game ${gameId} failed:`, error);
        this.state.status = 'failed';
        this.state.error = error instanceof Error ? error.message : String(error);
        this.state.completedAt = Date.now();
      });

      return Response.json({ success: true, gameId, status: 'started' });
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
  private handleStatus(): Response {
    return Response.json(this.state);
  }

  /**
   * Run the game to completion.
   */
  private async runGame(gameId: string, batchId: string, config: GameConfig): Promise<void> {
    console.log(`Starting game ${gameId} (batch: ${batchId})`);

    // Get all unique model IDs from the config
    const modelIds = config.teams.map((t) => t.modelId);

    // Create AI providers for all models
    const providers = createProvidersForGame(modelIds, this.env);
    const aiAdapter = new GameAIAdapter(providers);

    // Create and run the game
    const game = new Game(config, aiAdapter, { gameId });
    const result = await game.run();

    console.log(`Game ${gameId} completed: ${result.winner} wins in ${result.rounds} rounds`);

    // Persist results
    await this.persistResults(result, batchId);

    // Update state
    this.state.status = 'completed';
    this.state.completedAt = Date.now();
  }

  /**
   * Persist game results to D1 and R2.
   */
  private async persistResults(result: GameResult, batchId: string): Promise<void> {
    const db = this.env.DB;
    const transcripts = this.env.TRANSCRIPTS;

    // Write to D1 - games table
    await db
      .prepare(
        `INSERT INTO games (id, batch_id, config_hash, player_count, mafia_count, winner, rounds, duration_ms, total_tokens, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        Date.now()
      )
      .run();

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

    // Update leaderboard
    await this.updateLeaderboard(result);

    // Write full transcript to R2
    const transcript = {
      gameId: result.id,
      batchId,
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
   */
  private async updateLeaderboard(result: GameResult): Promise<void> {
    const db = this.env.DB;

    for (const participant of result.participants) {
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
  private toGameConfig(config: GameQueueConfig): GameConfig {
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
    };
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


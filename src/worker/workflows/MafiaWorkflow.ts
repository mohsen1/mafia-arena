/**
 * MafiaWorkflow - Cloudflare Workflow for Mafia game orchestration.
 * 
 * This workflow replaces the complex GameRunner Durable Object with native
 * Cloudflare Workflow primitives (step.do, step.sleep) for:
 * - Automatic checkpointing and resumption
 * - Native retry handling
 * - No SuspenseError pattern needed
 * - Better observability via Workflow dashboard
 * 
 * ARCHITECTURE:
 * - WorkflowAIProvider wraps AI calls in step.do() for idempotency
 * - State is synced to KV after each phase for frontend visibility
 * - GameRunner DO is used ONLY for WebSocket broadcasting
 * - Results are persisted to D1/R2 on completion
 */

import { WorkflowEntrypoint, type WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import type { Env } from '../types.js';
import type { WorkflowParams, WorkflowResult, BroadcastMessage } from './types.js';
import type { GameConfig, GameEvent, Team } from '../../engine/types.js';
import type { ModelContext, ModelPricing } from '../ai/types.js';
import { 
  GameState,
  executeIntroductionPhase,
  executeDiscussionPhase,
  executeVotePhase,
  executeNightPhase,
  checkWinCondition,
  generateSeed,
} from '../../engine/index.js';
import { WorkflowAIProvider } from '../providers/WorkflowAIProvider.js';
import { 
  saveGameStateToKV, 
  saveErrorStateToKV,
  getRecentEvents,
  saveCheckpointToR2,
  loadCheckpointFromR2,
  cleanupCheckpoints,
} from '../utils/workflow-sync.js';
import { calculateExactCost } from '../utils/budget.js';
import { DEFAULT_PRICING } from '../ai/models.js';
import { ModelRegistry } from '../services/ModelRegistry.js';
import { createLogger, type Logger } from '../utils/logger.js';

/**
 * MafiaWorkflow - Main game orchestration workflow.
 */
export class MafiaWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  private log: Logger;
  private gameId!: string;
  private modelRegistry: ModelRegistry;
  /** Cached model contexts, hydrated at workflow start */
  private modelContexts: Map<string, ModelContext> = new Map();

  constructor(ctx: ExecutionContext, env: Env) {
    super(ctx, env);
    this.log = createLogger('MafiaWorkflow');
    this.modelRegistry = new ModelRegistry(env.DB);
  }

  /**
   * Main workflow execution entry point.
   */
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<WorkflowResult> {
    const { gameId, config, traceId, batchId, discountPricing } = event.payload;
    this.gameId = gameId;
    
    const startTime = Date.now();
    this.log.info('Starting workflow', { gameId, traceId, batchId });

    // Generate seed if not provided
    const seed = config.seed ?? generateSeed();

    // Convert GameQueueConfig to GameConfig
    const gameConfig: GameConfig = {
      playerCount: config.playerCount,
      mafiaCount: config.mafiaCount,
      teams: config.teams,
      maxRounds: config.maxRounds,
      discussionEnabled: config.discussionEnabled,
      personaConstraints: config.personaConstraints,
      seed,
      contextLevel: config.contextLevel,
      contextWindowSize: config.contextWindowSize,
      personaTheme: config.personaTheme,
    };

    // Initialize game state
    let state = GameState.create(gameId, gameConfig);

    // Hydrate model contexts at workflow start for pricing lookups
    // This single batch fetch prevents repeated D1 queries during the game
    const modelIds = config.teams.map(t => t.modelId);
    this.modelContexts = await step.do('hydrate-models', async () => {
      const contexts = await this.modelRegistry.getMany(modelIds);
      // Convert to serializable format for workflow checkpointing
      return Object.fromEntries(contexts);
    }).then(entries => new Map(Object.entries(entries) as [string, ModelContext][]));

    this.log.debug('Hydrated model contexts', { 
      modelCount: this.modelContexts.size,
      models: modelIds.join(', '),
    });

    // Create AI provider with pre-loaded contexts (avoids redundant D1 queries)
    const aiProvider = new WorkflowAIProvider(step, this.env, gameId, {
      discountPricing: discountPricing ?? false,
      preloadedContexts: this.modelContexts,
      ...(traceId && { traceId }),
    });

    try {
      // Step 1: Ensure game record exists in D1 and update with seed
      // The API route creates the record before starting the workflow, but we use
      // ON CONFLICT to handle edge cases and update the seed (which is generated here).
      await step.do('create-game-record', async () => {
        const configHash = `${config.playerCount}-${config.mafiaCount}-${config.teams.map(t => `${t.modelId}:${t.count}`).join(',')}`;
        
        await this.env.DB.prepare(`
          INSERT INTO games (id, status, batch_id, config_hash, player_count, mafia_count, seed, trace_id, persona_theme, discount_pricing, created_at)
          VALUES (?, 'running', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            seed = excluded.seed,
            status = excluded.status,
            updated_at = ?
        `).bind(
          gameId,
          batchId ?? null,
          configHash,
          gameConfig.playerCount,
          gameConfig.mafiaCount,
          seed,
          traceId ?? null,
          gameConfig.personaTheme ?? 'noir',
          discountPricing ? 1 : 0,
          Date.now(),
          Date.now()
        ).run();
      });

      // Step 2: Introduction Phase (persona generation + introductions)
      // IMPORTANT: Do NOT wrap phase execution in step.do() - the AI calls inside
      // already use step.do() and nested step.do() is not supported by Cloudflare Workflows.
      // The WorkflowAIProvider checkpoints each AI call individually.
      const introResult = await executeIntroductionPhase(
        state,
        aiProvider,
        this.createStateUpdater(step, 'introduction')
      );
      // Save checkpoint to R2 separately (small reference avoids SQLITE_TOOBIG)
      const introCheckpoint = await step.do('save-intro', async () => {
        return await saveCheckpointToR2(this.env, gameId, 'introduction', introResult.state);
      });
      state = await loadCheckpointFromR2(this.env, introCheckpoint);

      await this.syncAndBroadcast(step, state, 'introduction');

      // Step 3: Main game loop
      while (state.round <= gameConfig.maxRounds) {
        const currentRound = state.round; // Capture for step names
        
        // Discussion Phase (if enabled)
        // IMPORTANT: Do NOT wrap phase execution in step.do() - nested step.do() is not supported
        if (gameConfig.discussionEnabled) {
          const discussionResult = await executeDiscussionPhase(
            state,
            aiProvider,
            this.createStateUpdater(step, 'day_discussion')
          );
          const discussionCheckpoint = await step.do(`save-discussion-r${currentRound}`, async () => {
            return await saveCheckpointToR2(this.env, gameId, `discussion-r${currentRound}`, discussionResult.state);
          });
          state = await loadCheckpointFromR2(this.env, discussionCheckpoint);

          await this.syncAndBroadcast(step, state, 'day_discussion');
        }

        // Vote Phase
        const voteResult = await executeVotePhase(
          state,
          aiProvider,
          this.createStateUpdater(step, 'day_vote')
        );
        const voteCheckpoint = await step.do(`save-vote-r${currentRound}`, async () => {
          return await saveCheckpointToR2(this.env, gameId, `vote-r${currentRound}`, voteResult.state);
        });
        state = await loadCheckpointFromR2(this.env, voteCheckpoint);

        await this.syncAndBroadcast(step, state, 'day_vote');

        // Check win condition after vote
        const winnerAfterVote = checkWinCondition(state);
        if (winnerAfterVote) {
          return await this.finalize(step, state, winnerAfterVote, startTime, batchId);
        }

        // Night Phase
        const nightResult = await executeNightPhase(
          state,
          aiProvider,
          this.createStateUpdater(step, 'night')
        );
        const nightCheckpoint = await step.do(`save-night-r${currentRound}`, async () => {
          return await saveCheckpointToR2(this.env, gameId, `night-r${currentRound}`, nightResult.state);
        });
        state = await loadCheckpointFromR2(this.env, nightCheckpoint);

        await this.syncAndBroadcast(step, state, 'night');

        // Check win condition after night
        const winnerAfterNight = checkWinCondition(state);
        if (winnerAfterNight) {
          return await this.finalize(step, state, winnerAfterNight, startTime, batchId);
        }

        // Advance to next round
        state = state.withNextRound();
      }

      // Max rounds reached - determine winner by count
      const winner = this.determineWinnerByCount(state);
      return await this.finalize(step, state, winner, startTime, batchId);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.log.error('Workflow failed', { gameId, error: errorMessage });

      // Save error state
      await step.do('handle-error', async () => {
        await saveErrorStateToKV(
          this.env,
          gameId,
          errorMessage,
          state
        );

        await this.env.DB.prepare(`
          UPDATE games SET status = 'failed', error_message = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          errorMessage,
          Date.now(),
          gameId
        ).run();
      });

      // Broadcast error
      await this.broadcastToViewLayer(state, 'failed', errorMessage);

      throw err;
    }
  }

  /**
   * Create a state updater callback for phase execution.
   * This captures state updates during phase execution for incremental progress.
   */
  private createStateUpdater(_step: WorkflowStep, _phase: string) {
    return async (_event: GameEvent, _newState: GameState) => {
      // State is captured by the phase executor
      // We could add incremental sync here if needed
    };
  }

  /**
   * Sync state to KV and broadcast to WebSocket clients.
   */
  private async syncAndBroadcast(
    step: WorkflowStep,
    state: GameState,
    phase: string
  ): Promise<void> {
    await step.do(`sync-${phase}-r${state.round}`, async () => {
      await saveGameStateToKV(this.env, this.gameId, state, 'running', phase);
    });

    await this.broadcastToViewLayer(state, 'running');
  }

  /**
   * Broadcast state to WebSocket clients via GameRunner DO.
   */
  private async broadcastToViewLayer(
    state: GameState,
    status: 'running' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    try {
      const id = this.env.GAME_RUNNER.idFromName(this.gameId);
      const stub = this.env.GAME_RUNNER.get(id);

      const lastEventType = state.events.length > 0 
        ? state.events[state.events.length - 1]!.type 
        : undefined;

      const message: BroadcastMessage = {
        type: status === 'failed' ? 'ERROR' : 'SYNC',
        gameId: this.gameId,
        status,
        events: getRecentEvents(state.events, 50),
        round: state.round,
        ...(lastEventType && { phase: lastEventType as string }),
        ...(error && { error }),
      };

      await stub.fetch('http://internal/internal/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      // Non-fatal - broadcasting is best effort
      this.log.warn('Failed to broadcast to view layer', { 
        gameId: this.gameId, 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }

  /**
   * Finalize the game - persist results to D1/R2.
   */
  private async finalize(
    step: WorkflowStep,
    state: GameState,
    winner: Team,
    startTime: number,
    batchId?: string
  ): Promise<WorkflowResult> {
    const durationMs = Date.now() - startTime;

    // Add game_end event
    const gameEndEvent: GameEvent = {
      type: 'game_end',
      winner,
      round: state.round,
      finalState: {
        mafiaAlive: state.aliveMafia.length,
        townAlive: state.aliveTown.length,
      },
      timestamp: Date.now(),
    };
    state = state.withEvent(gameEndEvent);

    await step.do('persist-results', async () => {
      // Save transcript to R2 (wrapped in object for frontend compatibility)
      const transcript = {
        gameId: this.gameId,
        winner,
        rounds: state.round,
        events: state.events,
        durationMs,
        timestamp: Date.now(),
      };
      await this.env.TRANSCRIPTS.put(
        `games/${this.gameId}/transcript.json`,
        JSON.stringify(transcript, null, 2),
        { customMetadata: { gameId: this.gameId, winner, rounds: String(state.round) } }
      );

      // Calculate token usage and costs
      const tokenUsage = this.calculateTokenUsage(state);
      const participants = this.createParticipantResults(state, winner);
      const totalCost = await this.calculateTotalCost(participants);

      // Update games table
      await this.env.DB.prepare(`
        UPDATE games SET 
          status = 'completed',
          winner = ?,
          rounds = ?,
          total_tokens = ?,
          cost_usd = ?,
          duration_ms = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        winner,
        state.round,
        tokenUsage.total,
        totalCost,
        durationMs,
        Date.now(),
        this.gameId
      ).run();

      // Insert game_participants (idempotent with ON CONFLICT)
      for (const p of participants) {
        const participantId = `${this.gameId}_${p.modelId}_${p.team}`;
        await this.env.DB.prepare(`
          INSERT INTO game_participants (id, game_id, model_id, team, player_count, won, input_tokens, output_tokens)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            player_count = excluded.player_count,
            won = excluded.won,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens
        `).bind(
          participantId,
          this.gameId,
          p.modelId,
          p.team,
          p.playerCount,
          p.won ? 1 : 0,
          p.tokensUsed.input,
          p.tokensUsed.output
        ).run();
      }

      // Update leaderboard
      for (const p of participants) {
        await this.env.DB.prepare(`
          INSERT INTO leaderboard (model_id, team, games_played, games_won, total_tokens)
          VALUES (?, ?, 1, ?, ?)
          ON CONFLICT(model_id, team) DO UPDATE SET
            games_played = games_played + 1,
            games_won = games_won + ?,
            total_tokens = total_tokens + ?
        `).bind(
          p.modelId,
          p.team,
          p.won ? 1 : 0,
          p.tokensUsed.total,
          p.won ? 1 : 0,
          p.tokensUsed.total
        ).run();
      }

      // Update batch progress if part of a batch
      if (batchId) {
        await this.env.DB.prepare(`
          UPDATE batches SET 
            completed_games = completed_games + 1,
            actual_cost_usd = actual_cost_usd + ?
          WHERE id = ?
        `).bind(totalCost, batchId).run();
      }

      // Update daily stats
      const today = new Date().toISOString().split('T')[0]!;
      await this.env.DB.prepare(`
        INSERT INTO daily_stats (date, games_completed, tokens_used, cost_usd, mafia_wins, town_wins)
        VALUES (?, 1, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
          games_completed = games_completed + 1,
          tokens_used = tokens_used + ?,
          cost_usd = cost_usd + ?,
          mafia_wins = mafia_wins + ?,
          town_wins = town_wins + ?
      `).bind(
        today,
        tokenUsage.total,
        totalCost,
        winner === 'mafia' ? 1 : 0,
        winner === 'town' ? 1 : 0,
        tokenUsage.total,
        totalCost,
        winner === 'mafia' ? 1 : 0,
        winner === 'town' ? 1 : 0
      ).run();

      // Final KV sync
      await saveGameStateToKV(this.env, this.gameId, state, 'completed');
    });

    // Clean up intermediate checkpoints from R2 (they're no longer needed)
    await step.do('cleanup-checkpoints', async () => {
      await cleanupCheckpoints(this.env, this.gameId);
    });

    // Final broadcast
    await this.broadcastToViewLayer(state, 'completed');

    this.log.info('Workflow completed', { 
      gameId: this.gameId, 
      winner, 
      rounds: state.round,
      durationMs 
    });

    return {
      gameId: this.gameId,
      winner,
      rounds: state.round,
      durationMs,
    };
  }

  /**
   * Calculate total token usage from events.
   */
  private calculateTokenUsage(state: GameState): { input: number; output: number; total: number } {
    let input = 0;
    let output = 0;

    for (const event of state.events) {
      if (event.type === 'ai_call') {
        input += event.tokensUsed.input;
        output += event.tokensUsed.output;
      }
    }

    return { input, output, total: input + output };
  }

  /**
   * Create participant results for database persistence.
   */
  private createParticipantResults(
    state: GameState,
    winner: Team
  ): Array<{
    modelId: string;
    team: Team;
    playerCount: number;
    won: boolean;
    tokensUsed: { input: number; output: number; total: number };
    costUsd: number;
  }> {
    const SEPARATOR = '|||';
    const modelTeamMap = new Map<string, {
      modelId: string;
      team: Team;
      count: number;
      inputTokens: number;
      outputTokens: number;
    }>();

    // Count players by model and team
    for (const player of state.players) {
      const key = `${player.modelId}${SEPARATOR}${player.team}`;
      const existing = modelTeamMap.get(key);

      if (existing) {
        existing.count++;
      } else {
        modelTeamMap.set(key, {
          modelId: player.modelId,
          team: player.team,
          count: 1,
          inputTokens: 0,
          outputTokens: 0,
        });
      }
    }

    // Sum tokens by model/team
    for (const event of state.events) {
      if (event.type === 'ai_call') {
        const player = state.getPlayer(event.playerId);
        if (player) {
          const key = `${player.modelId}${SEPARATOR}${player.team}`;
          const entry = modelTeamMap.get(key);
          if (entry) {
            entry.inputTokens += event.tokensUsed.input;
            entry.outputTokens += event.tokensUsed.output;
          }
        }
      }
    }

    // Build results
    const results: Array<{
      modelId: string;
      team: Team;
      playerCount: number;
      won: boolean;
      tokensUsed: { input: number; output: number; total: number };
      costUsd: number;
    }> = [];

    for (const value of modelTeamMap.values()) {
      const tokensUsed = {
        input: value.inputTokens,
        output: value.outputTokens,
        total: value.inputTokens + value.outputTokens,
      };

      // Calculate cost (simplified - would need model pricing lookup)
      const pricing = this.getModelPricing(value.modelId);
      const costUsd = calculateExactCost(tokensUsed.input, tokensUsed.output, pricing);

      results.push({
        modelId: value.modelId,
        team: value.team,
        playerCount: value.count,
        won: value.team === winner,
        tokensUsed,
        costUsd,
      });
    }

    return results;
  }

  /**
   * Get pricing for a model from cached model contexts.
   * Falls back to DEFAULT_PRICING if model was not hydrated.
   */
  private getModelPricing(modelId: string): ModelPricing {
    const context = this.modelContexts.get(modelId);
    if (context) {
      return context.pricing;
    }
    this.log.warn('Model pricing not found in hydrated contexts, using defaults', { modelId });
    return DEFAULT_PRICING;
  }

  /**
   * Calculate total cost from all participants.
   */
  private async calculateTotalCost(
    participants: Array<{ costUsd: number }>
  ): Promise<number> {
    return participants.reduce((sum, p) => sum + p.costUsd, 0);
  }

  /**
   * Determine winner when max rounds reached.
   */
  private determineWinnerByCount(state: GameState): Team {
    const mafiaCount = state.aliveMafia.length;
    const townCount = state.aliveTown.length;
    return mafiaCount >= townCount ? 'mafia' : 'town';
  }
}


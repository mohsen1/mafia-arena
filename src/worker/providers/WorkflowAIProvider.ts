/**
 * WorkflowAIProvider - AI Provider for Cloudflare Workflows.
 * 
 * This provider wraps AI calls in `step.do()` for native workflow checkpointing.
 * Unlike GameAIAdapter, it does NOT use SuspenseError - Workflows handle
 * suspension and resumption natively via step.do() and step.sleep().
 * 
 * KEY DIFFERENCES FROM GameAIAdapter:
 * - No SuspenseError - workflows handle suspension natively
 * - No cache checking - step.do() is idempotent by design
 * - No queueRequest - direct execution within step
 * - Batch flow uses step.sleep() instead of callbacks
 */

import type { WorkflowStep } from 'cloudflare:workers';
import type { 
  AIProvider, 
  AIContext, 
  ActionPrompt, 
  AIResponse, 
  PlayerAction,
  Persona,
} from '../../engine/types.js';
import type { Env } from '../types.js';
import type { CompletionResponse, ModelContext } from '../ai/types.js';
import { createProviderFromContext } from '../ai/factory.js';
import { getSchemaForAction } from '../ai/types.js';
import { BatchService } from '../batch/index.js';
import { ModelRegistry } from '../services/ModelRegistry.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { jsonrepair } from 'jsonrepair';
import {
  PersonaSchema,
  IntroductionSchema,
  KillVoteSchema,
  DiscussionSchema,
  MafiaDiscussionSchema,
  EliminationVoteSchema,
} from '../ai/schemas.js';

/**
 * Error thrown when AI response cannot be parsed into a valid action.
 */
export class AIParseError extends Error {
  readonly code = 'AI_PARSE_ERROR';
  
  constructor(
    public readonly actionType: ActionPrompt['type'],
    public readonly rawResponse: string,
    public readonly parseError: string,
    public readonly modelId: string
  ) {
    super(`Failed to parse ${actionType} response from ${modelId}: ${parseError}`);
    this.name = 'AIParseError';
  }
}

/**
 * Options for WorkflowAIProvider.
 */
export interface WorkflowAIProviderOptions {
  /** Whether to use discount pricing (batch API) for supported models */
  discountPricing?: boolean;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /**
   * Pre-loaded model contexts from MafiaWorkflow hydration.
   * Avoids redundant D1 queries during game execution.
   */
  preloadedContexts?: Map<string, ModelContext>;
}

/**
 * AI Provider implementation for Cloudflare Workflows.
 * Uses step.do() for idempotent, checkpointed AI calls.
 */
export class WorkflowAIProvider implements AIProvider {
  private readonly log: Logger;
  private readonly modelRegistry: ModelRegistry;
  private fallbackCounts: Map<string, { total: number; fallbacks: number }> = new Map();

  constructor(
    private readonly step: WorkflowStep,
    private readonly env: Env,
    private readonly gameId: string,
    private readonly options: WorkflowAIProviderOptions = {}
  ) {
    this.log = createLogger('WorkflowAIProvider');
    this.modelRegistry = new ModelRegistry(env.DB);
  }

  /**
   * Generate a deterministic step ID for the AI call.
   * This ensures idempotency - the same AI call always gets the same ID.
   */
  private generateStepId(context: AIContext, prompt: ActionPrompt): string {
    const discussionRound = context.discussionRound ?? 0;
    return `ai-${context.round}-${context.phase}-${context.playerId}-${prompt.type}-${discussionRound}`;
  }

  /**
   * Track a call for fallback statistics.
   */
  private trackCall(modelId: string, usedFallback: boolean): void {
    const stats = this.fallbackCounts.get(modelId) ?? { total: 0, fallbacks: 0 };
    stats.total++;
    if (usedFallback) {
      stats.fallbacks++;
      this.log.warn('Fallback action used', { 
        modelId, 
        fallbackRate: (stats.fallbacks / stats.total * 100).toFixed(1) + '%' 
      });
    }
    this.fallbackCounts.set(modelId, stats);
  }

  /**
   * Get an action from the AI provider.
   * Routes to batch flow if discount pricing is enabled and model supports it.
   */
  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    // Get model context from preloaded cache or fetch from registry
    const modelContext = this.options.preloadedContexts?.get(context.modelId)
      ?? await this.modelRegistry.get(context.modelId);
    
    // Check if we should use batch flow (uses database-driven batch pricing info)
    if (this.options.discountPricing && modelContext.batchPricing.supported) {
      return this.executeBatchFlow(context, prompt, modelContext);
    }
    return this.executeDirectFlow(context, prompt, modelContext);
  }

  /**
   * Execute AI call directly within a workflow step.
   * Uses ModelContext for database-driven provider routing.
   */
  private async executeDirectFlow(
    context: AIContext, 
    prompt: ActionPrompt,
    modelContext: ModelContext
  ): Promise<AIResponse> {
    const stepId = this.generateStepId(context, prompt);
    const structuredOutput = getSchemaForAction(prompt.type);

    // Step-level timeout (2 minutes) as safety net for hung requests
    // Provider-level timeout (60s) should handle most cases, but this catches edge cases
    // where setTimeout doesn't fire during CF Worker hibernation
    const STEP_TIMEOUT_MS = 120_000;

    const result = await this.step.do(stepId, {
      retries: {
        limit: 3,
        delay: '5 second',
        backoff: 'exponential',
      },
      timeout: '3 minutes',
    }, async () => {
      // Use context-based provider creation (database-driven routing)
      const provider = createProviderFromContext(modelContext, this.env, {
        enableRetry: true,
        discountPricing: this.options.discountPricing ?? false,
      });

      const startTime = Date.now();
      
      // Wrap provider call with explicit timeout using Promise.race
      const aiCallPromise = provider.complete({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        structuredOutput,
        temperature: 0.7,
        maxTokens: 4000,
      });
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`AI call timed out after ${STEP_TIMEOUT_MS}ms for model ${modelContext.id}`));
        }, STEP_TIMEOUT_MS);
      });

      const response = await Promise.race([aiCallPromise, timeoutPromise]);

      return {
        content: response.content,
        tokensUsed: response.tokensUsed,
        latencyMs: Date.now() - startTime,
        modelId: response.modelId,
      };
    });

    // Parse the response into a PlayerAction
    try {
      const action = this.parseAction(
        result.content,
        prompt.type,
        prompt.validTargets,
        context.modelId
      );

      this.trackCall(context.modelId, false);
      return {
        action,
        rawResponse: result.content,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      };
    } catch (parseError) {
      // Parse failed - use fallback action
      this.log.warn('Parse failed, using fallback action', {
        actionType: prompt.type,
        parseError: parseError instanceof AIParseError ? parseError.parseError : String(parseError),
      });

      this.trackCall(context.modelId, true);
      const fallbackAction = this.generateFallbackAction(prompt.type, prompt.validTargets);

      return {
        action: fallbackAction,
        rawResponse: result.content,
        tokensUsed: result.tokensUsed,
        latencyMs: result.latencyMs,
      };
    }
  }

  /**
   * Execute AI call via batch API with sleep-poll pattern.
   * Used for discount pricing (40-50% cost savings, up to 24h response time).
   */
  private async executeBatchFlow(
    context: AIContext, 
    prompt: ActionPrompt,
    _modelContext: ModelContext  // Available for future use
  ): Promise<AIResponse> {
    const stepId = this.generateStepId(context, prompt);
    const requestId = `${this.gameId}-${stepId}`;
    const structuredOutput = getSchemaForAction(prompt.type);

    // Step 1: Submit request to batch queue (D1)
    await this.step.do(`submit-${stepId}`, async () => {
      const batchService = new BatchService(this.env);
      await batchService.storeRequest({
        requestId,
        gameId: this.gameId,
        modelId: context.modelId,
        request: {
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          structuredOutput,
          temperature: 0.7,
          maxTokens: 4000,
        },
        context: {
          round: context.round,
          phase: context.phase,
          playerId: context.playerId,
          actionType: prompt.type,
        },
        timestamp: Date.now(),
        discountPricing: true,
        ...(this.options.traceId && { traceId: this.options.traceId }),
      });
    });

    // Step 2: Poll until complete (with native sleep)
    const response = await this.waitForBatchResult(stepId, requestId);

    // Parse the response
    try {
      const action = this.parseAction(
        response.content,
        prompt.type,
        prompt.validTargets,
        context.modelId
      );

      this.trackCall(context.modelId, false);
      return {
        action,
        rawResponse: response.content,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
      };
    } catch (parseError) {
      this.log.warn('Batch response parse failed, using fallback', {
        requestId,
        parseError: parseError instanceof AIParseError ? parseError.parseError : String(parseError),
      });

      this.trackCall(context.modelId, true);
      const fallbackAction = this.generateFallbackAction(prompt.type, prompt.validTargets);

      return {
        action: fallbackAction,
        rawResponse: response.content,
        tokensUsed: response.tokensUsed,
        latencyMs: response.latencyMs,
      };
    }
  }

  /**
   * Wait for batch result using sleep-poll pattern.
   * Checks D1 for completion, sleeps between polls.
   * Updates KV every ~1 hour so UI knows game is alive during long batch waits.
   */
  private async waitForBatchResult(stepId: string, requestId: string): Promise<CompletionResponse> {
    const MAX_POLLS = 144; // 24 hours at 10-min intervals
    // Dev: 2 seconds for fast testing, Prod: 10 minutes for cost efficiency
    const sleepTime = this.env.ENVIRONMENT === 'development' ? '2 seconds' : '10 minutes';
    // Update KV every 6 polls (~1 hour in prod, ~12 seconds in dev)
    const KV_UPDATE_INTERVAL = 6;
    const submittedAt = Date.now();

    for (let i = 0; i < MAX_POLLS; i++) {
      // Sleep before checking (except first poll)
      if (i > 0) {
        await this.step.sleep(`wait-${stepId}-${i}`, sleepTime);
      }

      // Update KV periodically so UI knows batch game is alive
      // This prevents the game from appearing "stuck" during 24h batch wait
      if (i > 0 && i % KV_UPDATE_INTERVAL === 0) {
        const hoursElapsed = (Date.now() - submittedAt) / (1000 * 60 * 60);
        const estimatedWaitHours = Math.max(0, Math.ceil(24 - hoursElapsed));
        
        await this.step.do(`batch-progress-${stepId}-${i}`, async () => {
          // Update KV with batch pending status
          await this.env.RATE_LIMIT.put(
            `game-state:${this.gameId}:batch-status`,
            JSON.stringify({
              batchPending: true,
              pollCount: i,
              submittedAt,
              estimatedWaitHours,
              lastPollAt: Date.now(),
            }),
            { expirationTtl: 86400 } // 24 hours
          );
        });
        
        this.log.debug('Batch polling progress update', {
          gameId: this.gameId,
          pollCount: i,
          estimatedWaitHours,
        });
      }

      // Check status in D1
      const result = await this.step.do(`check-${stepId}-${i}`, async () => {
        const row = await this.env.DB.prepare(`
          SELECT status, response_body, error_message
          FROM batch_api_requests 
          WHERE request_id = ?
        `).bind(requestId).first<{
          status: string;
          response_body: string | null;
          error_message: string | null;
        }>();

        return row;
      });

      if (!result) {
        // Request not found yet, continue polling
        continue;
      }

      if (result.status === 'completed' && result.response_body) {
        // Clean up batch status from KV
        await this.env.RATE_LIMIT.delete(`game-state:${this.gameId}:batch-status`);
        return JSON.parse(result.response_body) as CompletionResponse;
      }

      if (result.status === 'failed') {
        // Clean up batch status from KV
        await this.env.RATE_LIMIT.delete(`game-state:${this.gameId}:batch-status`);
        throw new Error(`Batch request failed: ${result.error_message ?? 'Unknown error'}`);
      }

      // Still pending/bundled, continue polling
    }

    throw new Error('Batch request timed out after 24 hours');
  }

  /**
   * Parse AI response into a PlayerAction.
   */
  private parseAction(
    content: string,
    actionType: ActionPrompt['type'],
    validTargets: readonly string[] | undefined,
    modelId: string
  ): PlayerAction {
    let parsed: unknown;
    
    try {
      parsed = this.extractJSON(content);
    } catch (error) {
      throw new AIParseError(
        actionType,
        content,
        `JSON extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        modelId
      );
    }

    try {
      switch (actionType) {
        case 'persona_generation':
          return this.parsePersonaGeneration(parsed, modelId);
        case 'introduction':
          return this.parseIntroduction(parsed, modelId);
        case 'kill_vote':
          return this.parseKillVote(parsed, validTargets, modelId);
        case 'discussion':
          return this.parseDiscussion(parsed, modelId);
        case 'mafia_discussion':
          return this.parseMafiaDiscussion(parsed, modelId);
        case 'elimination_vote':
          return this.parseEliminationVote(parsed, validTargets, modelId);
      }
    } catch (error) {
      if (error instanceof AIParseError) {
        throw error;
      }
      throw new AIParseError(
        actionType,
        content,
        error instanceof Error ? error.message : String(error),
        modelId
      );
    }
  }

  private parsePersonaGeneration(parsed: unknown, modelId: string): PlayerAction {
    const result = PersonaSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError('persona_generation', JSON.stringify(parsed), errors, modelId);
    }

    const persona: Persona = {
      name: result.data.name,
      background: result.data.background,
      personality: result.data.personality,
      ...(result.data.occupation !== undefined && { occupation: result.data.occupation }),
    };

    return { type: 'persona_generation', persona };
  }

  private parseIntroduction(parsed: unknown, modelId: string): PlayerAction {
    const result = IntroductionSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError('introduction', JSON.stringify(parsed), errors, modelId);
    }

    return { type: 'introduction', message: result.data.message.trim() };
  }

  private parseKillVote(
    parsed: unknown,
    validTargets: readonly string[] | undefined,
    modelId: string
  ): PlayerAction {
    const result = KillVoteSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError('kill_vote', JSON.stringify(parsed), errors, modelId);
    }

    const target = (result.data.target ?? result.data.vote ?? '').trim();

    if (!target) {
      throw new AIParseError('kill_vote', JSON.stringify(parsed), 'Missing "target" or "vote" field', modelId);
    }

    if (validTargets && !validTargets.includes(target)) {
      throw new AIParseError(
        'kill_vote',
        JSON.stringify(parsed),
        `Invalid target "${target}". Valid targets: ${validTargets.join(', ')}`,
        modelId
      );
    }

    return { type: 'kill_vote', target };
  }

  private parseDiscussion(parsed: unknown, modelId: string): PlayerAction {
    const result = DiscussionSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError('discussion', JSON.stringify(parsed), errors, modelId);
    }

    return { type: 'discussion', message: result.data.message.trim() };
  }

  private parseMafiaDiscussion(parsed: unknown, modelId: string): PlayerAction {
    const result = MafiaDiscussionSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError('mafia_discussion', JSON.stringify(parsed), errors, modelId);
    }

    return { type: 'mafia_discussion', message: result.data.message.trim() };
  }

  private parseEliminationVote(
    parsed: unknown,
    validTargets: readonly string[] | undefined,
    modelId: string
  ): PlayerAction {
    const result = EliminationVoteSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError('elimination_vote', JSON.stringify(parsed), errors, modelId);
    }

    const data = result.data;
    
    // Handle explicit null/abstention
    if (data.vote === null || data.vote === 'null' || data.vote === '') {
      return { type: 'elimination_vote', target: null };
    }

    const target = String(data.vote ?? data.target ?? '').trim();

    // Empty string after trim means abstention
    if (!target) {
      return { type: 'elimination_vote', target: null };
    }

    // Validate target is in valid targets list
    if (validTargets && !validTargets.includes(target)) {
      throw new AIParseError(
        'elimination_vote',
        JSON.stringify(parsed),
        `Invalid target "${target}". Valid targets: ${validTargets.join(', ')}`,
        modelId
      );
    }

    return { type: 'elimination_vote', target };
  }

  /**
   * Generate a fallback action when AI parsing fails.
   */
  private generateFallbackAction(
    actionType: ActionPrompt['type'],
    validTargets?: readonly string[]
  ): PlayerAction {
    switch (actionType) {
      case 'persona_generation':
        return {
          type: 'persona_generation',
          persona: {
            name: 'Unknown Stranger',
            background: 'A mysterious figure who keeps to themselves.',
            personality: 'Reserved and cautious',
          },
        };
      case 'introduction':
        return {
          type: 'introduction',
          message: '*nods quietly* Good evening, everyone.',
        };
      case 'discussion':
        return {
          type: 'discussion',
          message: '*remains silent, observing the others carefully*',
        };
      case 'mafia_discussion':
        return {
          type: 'mafia_discussion',
          message: '*signals agreement with a subtle nod*',
        };
      case 'kill_vote': {
        const killTarget = validTargets && validTargets.length > 0
          ? validTargets[Math.floor(Math.random() * validTargets.length)]!
          : '';
        return { type: 'kill_vote', target: killTarget };
      }
      case 'elimination_vote':
        return { type: 'elimination_vote', target: null };
      default:
        throw new Error(`No fallback available for action type: ${actionType}`);
    }
  }

  /**
   * Extract JSON from response content.
   * Handles markdown code blocks and uses jsonrepair for common errors.
   */
  private extractJSON(content: string): unknown {
    // Strip Markdown code blocks
    const markdownMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const cleanContent = markdownMatch ? markdownMatch[1]! : content;
    const trimmed = cleanContent.trim();
    
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        return JSON.parse(jsonrepair(trimmed));
      } catch (error) {
        throw new Error(
          `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}


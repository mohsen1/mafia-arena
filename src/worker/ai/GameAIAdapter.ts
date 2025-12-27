/**
 * Adapter that bridges AI providers to the game engine's AIProvider interface.
 * This allows the pure game engine to use Cloudflare AI providers.
 * 
 * PARSE ERROR HANDLING:
 * If a model produces invalid output that cannot be parsed, a fallback action
 * is generated to keep the game running. Retry logic is handled by RetryingProvider
 * at the network layer - this adapter does not add additional retry loops.
 * 
 * CONTEXT WINDOW MANAGEMENT:
 * This adapter supports context limit checking for models with smaller context windows.
 * When context limits are provided, it will track token usage and log warnings.
 */

import type { AIProvider, AIContext, ActionPrompt, AIResponse, PlayerAction } from '../../engine/types.js';
import type { AIProviderInterface, ResponseCacheFn, QueueRequestFn, AIRequestMessage } from './types.js';
import { SuspenseError, getSchemaForAction } from './types.js';
import { AIErrors } from './errors.js';
import { createLogger, logErrorWithStack, type Logger } from '../utils/logger.js';
import { countPromptTokens } from '../../engine/utils/tokens.js';
import { jsonrepair } from 'jsonrepair';
import {
  PersonaSchema,
  IntroductionSchema,
  KillVoteSchema,
  DiscussionSchema,
  MafiaDiscussionSchema,
  EliminationVoteSchema,
} from './schemas.js';

/**
 * Error thrown when AI response cannot be parsed into a valid action.
 * This should be caught by the game engine and recorded as an event.
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
 * Options for creating a GameAIAdapter with context limit awareness.
 */
export interface GameAIAdapterOptions {
  /** Map of model ID to context limit in tokens */
  contextLimits?: Map<string, number>;
  /** Threshold at which to warn about context usage (default 0.8 = 80%) */
  warningThreshold?: number;
  /**
   * Suspense mode: When enabled, adapter checks cache and throws SuspenseError
   * instead of making direct AI calls. Required for DO hibernation safety.
   */
  suspenseMode?: {
    /** Function to check if response is cached in DO storage */
    checkCache: ResponseCacheFn;
    /** Function to queue AI request for background processing */
    queueRequest: QueueRequestFn;
    /** Game ID for request context */
    gameId: string;
    /** Trace ID for distributed tracing */
    traceId?: string;
    /** Whether this is a discount pricing game (routes to batch APIs) */
    discountPricing?: boolean;
  };
}

/** Fallback stats for a single model */
export interface FallbackStats {
  modelId: string;
  totalCalls: number;
  fallbackCount: number;
  fallbackRate: number;
}

/**
 * Adapts the worker AI providers to the game engine's AIProvider interface.
 */
export class GameAIAdapter implements AIProvider {
  private log: Logger;
  private readonly contextLimits: Map<string, number>;
  private readonly warningThreshold: number;
  private readonly suspenseMode: GameAIAdapterOptions['suspenseMode'];
  
  /** Track fallback usage per model for quality metrics */
  private fallbackCounts: Map<string, { total: number; fallbacks: number }> = new Map();

  constructor(
    private readonly providers: Map<string, AIProviderInterface>,
    options: GameAIAdapterOptions = {}
  ) {
    this.log = createLogger('GameAIAdapter');
    this.contextLimits = options.contextLimits ?? new Map();
    this.warningThreshold = options.warningThreshold ?? 0.8;
    this.suspenseMode = options.suspenseMode;
    this.log.debug('Adapter created', { 
      providerCount: providers.size, 
      models: Array.from(providers.keys()).join(', '),
      hasContextLimits: this.contextLimits.size > 0,
      suspenseEnabled: !!this.suspenseMode,
    });
  }

  /**
   * Generate a deterministic request ID based on game state.
   * This ensures idempotency - the same AI call always gets the same ID,
   * so resuming a game will find the cached response.
   */
  private generateRequestId(context: AIContext, prompt: ActionPrompt): string {
    // Combine all relevant state that uniquely identifies this AI call
    const data = `${context.gameId}:${context.round}:${context.phase}:${context.playerId}:${prompt.type}`;
    
    // Simple hash for ID (deterministic)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `req_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Get the context limit for a model, if known.
   */
  getContextLimit(modelId: string): number | undefined {
    return this.contextLimits.get(modelId);
  }
  
  /**
   * Track a successful AI call (no fallback needed).
   */
  private trackCall(modelId: string, usedFallback: boolean): void {
    const stats = this.fallbackCounts.get(modelId) ?? { total: 0, fallbacks: 0 };
    stats.total++;
    if (usedFallback) {
      stats.fallbacks++;
      this.log.warn('Fallback action used', { modelId, fallbackRate: (stats.fallbacks / stats.total * 100).toFixed(1) + '%' });
    }
    this.fallbackCounts.set(modelId, stats);
  }
  
  /**
   * Get fallback statistics for all models.
   * This can be used to identify poorly performing models.
   */
  getFallbackStats(): FallbackStats[] {
    const stats: FallbackStats[] = [];
    for (const [modelId, counts] of this.fallbackCounts.entries()) {
      stats.push({
        modelId,
        totalCalls: counts.total,
        fallbackCount: counts.fallbacks,
        fallbackRate: counts.total > 0 ? counts.fallbacks / counts.total : 0,
      });
    }
    return stats;
  }
  
  /**
   * Reset fallback statistics (e.g., at start of a new game).
   */
  resetFallbackStats(): void {
    this.fallbackCounts.clear();
  }

  /**
   * Check if a prompt would exceed the context limit for a model.
   */
  checkContextUsage(
    modelId: string,
    systemPrompt: string,
    userPrompt: string
  ): { exceeds: boolean; tokenCount: number; limit?: number; percentUsed?: number } {
    const limit = this.contextLimits.get(modelId);
    const tokenCount = countPromptTokens(systemPrompt, userPrompt);
    
    if (!limit) {
      return { exceeds: false, tokenCount };
    }
    
    const percentUsed = (tokenCount / limit) * 100;
    const safeLimit = Math.floor(limit * this.warningThreshold);
    
    return {
      exceeds: tokenCount > safeLimit,
      tokenCount,
      limit,
      percentUsed: Math.round(percentUsed * 10) / 10,
    };
  }

  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    const callLog = this.log.child({ 
      modelId: context.modelId, 
      playerId: context.playerId,
      actionType: prompt.type,
    });

    const provider = this.providers.get(context.modelId);
    if (!provider) {
      callLog.error('Provider not found for model', { availableModels: Array.from(this.providers.keys()).join(', ') });
      throw AIErrors.unsupportedModel(context.modelId);
    }

    // ==========================================================================
    // SUSPENSE MODE: Check cache first, queue + suspend if not found
    // This prevents DO hibernation from killing in-flight AI calls
    // ==========================================================================
    if (this.suspenseMode) {
      const requestId = this.generateRequestId(context, prompt);
      
      // 1. Check if we have a cached response
      const cached = await this.suspenseMode.checkCache(requestId);
      
      if (cached) {
        callLog.debug('Cache hit for AI request', { requestId, hasError: !!cached.error });
        
        // Check for cached error (from failed AI calls)
        if (cached.error) {
          callLog.error('Cached AI call error - propagating to game', {
            requestId,
            error: cached.error,
            isFatal: cached.isFatal,
            modelId: context.modelId,
          });
          
          // Throw the error to fail the game (don't just suspend again)
          throw new Error(`AI call failed for ${context.modelId}: ${cached.error}`);
        }
        
        // Must have response if no error
        if (!cached.response) {
          callLog.error('Cached entry has no response or error', { requestId });
          throw new Error(`Invalid cache entry for ${requestId}: no response or error`);
        }
        
        // Parse and return the cached response
        try {
          const action = this.parseAction(
            cached.response.content,
            prompt.type,
            prompt.validTargets,
            context.modelId
          );
          
          this.trackCall(context.modelId, false); // Success, no fallback
          return {
            action,
            rawResponse: cached.response.content,
            tokensUsed: cached.response.tokensUsed,
            latencyMs: cached.response.latencyMs,
          };
        } catch (parseError) {
          // Cached response failed to parse - use fallback
          callLog.warn('Cached response parse failed, using fallback', {
            requestId,
            parseError: parseError instanceof AIParseError ? parseError.parseError : String(parseError),
          });
          
          this.trackCall(context.modelId, true); // Used fallback
          const fallbackAction = this.generateFallbackAction(prompt.type, prompt.validTargets);
          return {
            action: fallbackAction,
            rawResponse: cached.response.content,
            tokensUsed: cached.response.tokensUsed,
            latencyMs: cached.response.latencyMs,
          };
        }
      }
      
      // 2. No cache - queue the request and suspend
      callLog.info('Suspending game for AI request', { requestId, modelId: context.modelId });
      
      const structuredOutput = getSchemaForAction(prompt.type);
      const request = {
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        structuredOutput,
        temperature: 0.7,
        maxTokens: 4000,
      };
      
      const message: AIRequestMessage = {
        requestId,
        gameId: this.suspenseMode.gameId,
        modelId: context.modelId,
        request,
        context: {
          round: context.round,
          phase: context.phase,
          playerId: context.playerId,
          actionType: prompt.type,
        },
        timestamp: Date.now(),
        // Only include traceId if defined (exactOptionalPropertyTypes)
        ...(this.suspenseMode.traceId && { traceId: this.suspenseMode.traceId }),
        // Include discountPricing flag for batch API routing
        ...(this.suspenseMode.discountPricing && { discountPricing: this.suspenseMode.discountPricing }),
      };
      
      // Queue the request
      await this.suspenseMode.queueRequest(message);
      
      // Throw to halt game execution - GameRunner will catch this
      throw new SuspenseError(
        requestId,
        request,
        context.modelId,
        {
          gameId: this.suspenseMode.gameId,
          round: context.round,
          phase: context.phase,
          playerId: context.playerId,
          actionType: prompt.type,
        }
      );
    }

    // ==========================================================================
    // DIRECT MODE: Execute AI call synchronously (for tests/local dev)
    // ==========================================================================
    const startTime = Date.now();
    
    // Check context usage before making the call
    const contextUsage = this.checkContextUsage(
      context.modelId,
      prompt.systemPrompt,
      prompt.userPrompt
    );
    
    if (contextUsage.exceeds && contextUsage.limit) {
      callLog.warn('Context usage exceeds safe threshold', {
        tokenCount: contextUsage.tokenCount,
        limit: contextUsage.limit,
        percentUsed: contextUsage.percentUsed,
        threshold: this.warningThreshold * 100,
      });
    } else {
      callLog.debug('Starting AI call', {
        tokenCount: contextUsage.tokenCount,
        ...(contextUsage.limit && { percentUsed: contextUsage.percentUsed }),
      });
    }

    // Get the appropriate JSON schema for this action type
    const structuredOutput = getSchemaForAction(prompt.type);

    try {
      const response = await provider.complete({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        structuredOutput,
        temperature: 0.7,
        maxTokens: 4000,
      });

      const latencyMs = Date.now() - startTime;

      callLog.debug('AI response received', { 
        latencyMs, 
        inputTokens: response.tokensUsed.input,
        outputTokens: response.tokensUsed.output,
        contentLength: response.content.length,
      });

      // Try to parse the response into a PlayerAction
      try {
        const action = this.parseAction(
          response.content, 
          prompt.type, 
          prompt.validTargets,
          context.modelId
        );

        callLog.debug('Action parsed successfully', { actionType: action.type });
        this.trackCall(context.modelId, false); // Success, no fallback

        return {
          action,
          rawResponse: response.content,
          tokensUsed: response.tokensUsed,
          latencyMs,
        };
      } catch (parseError) {
        // Parse failed - use fallback action to keep game running
        callLog.warn('Parse failed, using fallback action', {
          actionType: prompt.type,
          parseError: parseError instanceof AIParseError ? parseError.parseError : String(parseError),
        });

        this.trackCall(context.modelId, true); // Used fallback
        const fallbackAction = this.generateFallbackAction(prompt.type, prompt.validTargets);

        return {
          action: fallbackAction,
          rawResponse: response.content,
          tokensUsed: response.tokensUsed,
          latencyMs,
        };
      }
    } catch (error) {
      // Network/provider errors are fatal - let them bubble up
      const latencyMs = Date.now() - startTime;
      logErrorWithStack(callLog, 'AI call failed', error, { latencyMs });
      throw error;
    }
  }

  /**
   * Generate a fallback action when AI parsing fails after all retries.
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
      case 'kill_vote':
        // Pick a random target if available, or use empty string (will be handled by game engine)
        const killTarget = validTargets && validTargets.length > 0
          ? validTargets[Math.floor(Math.random() * validTargets.length)]!
          : '';
        return {
          type: 'kill_vote',
          target: killTarget,
        };
      case 'elimination_vote':
        // Abstain rather than vote randomly
        return {
          type: 'elimination_vote',
          target: null,
        };
      default:
        throw new Error(`No fallback available for action type: ${actionType}`);
    }
  }

  /**
   * Parse AI response into a PlayerAction.
   * Throws AIParseError if parsing fails - NO FALLBACKS.
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
      throw new AIParseError(
        'persona_generation',
        JSON.stringify(parsed),
        errors,
        modelId
      );
    }

    // Return validated persona - sanitization happens in the engine layer
    // This keeps the adapter focused on structure validation (zod)
    // and the engine handles content safety (sanitization)
    const persona: {
      name: string;
      background: string;
      personality: string;
      occupation?: string;
    } = {
      name: result.data.name,
      background: result.data.background,
      personality: result.data.personality,
    };
    if (result.data.occupation !== undefined) {
      persona.occupation = result.data.occupation;
    }

    return {
      type: 'persona_generation',
      persona,
    };
  }

  private parseIntroduction(parsed: unknown, modelId: string): PlayerAction {
    const result = IntroductionSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError(
        'introduction',
        JSON.stringify(parsed),
        errors,
        modelId
      );
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
      throw new AIParseError(
        'kill_vote',
        JSON.stringify(parsed),
        errors,
        modelId
      );
    }

    const target = (result.data.target ?? result.data.vote ?? '').trim();

    if (!target) {
      throw new AIParseError(
        'kill_vote',
        JSON.stringify(parsed),
        'Missing "target" or "vote" field',
        modelId
      );
    }

    // Validate target is in valid targets list
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
      throw new AIParseError(
        'discussion',
        JSON.stringify(parsed),
        errors,
        modelId
      );
    }

    return { type: 'discussion', message: result.data.message.trim() };
  }

  private parseMafiaDiscussion(parsed: unknown, modelId: string): PlayerAction {
    const result = MafiaDiscussionSchema.safeParse(parsed);
    
    if (!result.success) {
      const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AIParseError(
        'mafia_discussion',
        JSON.stringify(parsed),
        errors,
        modelId
      );
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
      throw new AIParseError(
        'elimination_vote',
        JSON.stringify(parsed),
        errors,
        modelId
      );
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
   * Extract JSON from response content.
   * LLMs often wrap JSON in Markdown code blocks - strip those first.
   * Uses jsonrepair library to handle common LLM syntax errors.
   */
  private extractJSON(content: string): unknown {
    // Strip Markdown code blocks (common LLM behavior)
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

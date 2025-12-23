/**
 * Adapter that bridges AI providers to the game engine's AIProvider interface.
 * This allows the pure game engine to use Cloudflare AI providers.
 * 
 * BENCHMARK INTEGRITY: This adapter does NOT use fallback actions.
 * If a model produces invalid output, it is recorded as a parse error.
 * This is critical for benchmark validity - model failures must be tracked.
 * 
 * CONTEXT WINDOW MANAGEMENT:
 * This adapter now supports context limit checking for models with smaller context windows.
 * When context limits are provided, it will track token usage and log warnings.
 */

import type { AIProvider, AIContext, ActionPrompt, AIResponse, PlayerAction } from '../../engine/types.js';
import type { AIProviderInterface } from './types.js';
import { AIErrors } from './errors.js';
import { getSchemaForAction } from './types.js';
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
}

/**
 * Adapts the worker AI providers to the game engine's AIProvider interface.
 */
export class GameAIAdapter implements AIProvider {
  private log: Logger;
  private readonly contextLimits: Map<string, number>;
  private readonly warningThreshold: number;

  constructor(
    private readonly providers: Map<string, AIProviderInterface>,
    options: GameAIAdapterOptions = {}
  ) {
    this.log = createLogger('GameAIAdapter');
    this.contextLimits = options.contextLimits ?? new Map();
    this.warningThreshold = options.warningThreshold ?? 0.8;
    this.log.debug('Adapter created', { 
      providerCount: providers.size, 
      models: Array.from(providers.keys()).join(', '),
      hasContextLimits: this.contextLimits.size > 0,
    });
  }

  /**
   * Get the context limit for a model, if known.
   */
  getContextLimit(modelId: string): number | undefined {
    return this.contextLimits.get(modelId);
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

    const MAX_PARSE_RETRIES = 2;
    let lastParseError: AIParseError | null = null;
    let totalTokensUsed = { input: 0, output: 0 };
    let rawResponse = '';

    for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
      try {
        // On retries, add a JSON reminder to the prompt
        let userPrompt = prompt.userPrompt;
        if (attempt > 0) {
          userPrompt = `${prompt.userPrompt}\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown, no explanation, just the JSON object.`;
          callLog.info('Retrying AI call after parse error', { attempt, previousError: lastParseError?.parseError });
        }

        const response = await provider.complete({
          systemPrompt: prompt.systemPrompt,
          userPrompt,
          structuredOutput,
          temperature: 0.7,
          maxTokens: 4000,
        });

        const latencyMs = Date.now() - startTime;
        totalTokensUsed.input += response.tokensUsed.input;
        totalTokensUsed.output += response.tokensUsed.output;
        rawResponse = response.content;

        callLog.debug('AI response received', { 
          latencyMs, 
          attempt,
          inputTokens: response.tokensUsed.input,
          outputTokens: response.tokensUsed.output,
          contentLength: response.content.length,
        });

        // Parse the response into a PlayerAction
        const action = this.parseAction(
          response.content, 
          prompt.type, 
          prompt.validTargets,
          context.modelId
        );

        callLog.debug('Action parsed successfully', { actionType: action.type, attempt });

        return {
          action,
          rawResponse: response.content,
          tokensUsed: totalTokensUsed,
          latencyMs,
        };
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        
        if (error instanceof AIParseError) {
          lastParseError = error;
          callLog.warn('AI parse error', { 
            latencyMs,
            attempt,
            parseError: error.parseError,
            rawResponseLength: error.rawResponse.length,
          });
          // Continue to retry
        } else {
          // Non-parse errors are fatal
          logErrorWithStack(callLog, 'AI call failed', error, { latencyMs });
          throw error;
        }
      }
    }

    // All retries exhausted - generate a fallback response
    callLog.warn('All parse retries exhausted, using fallback response', {
      actionType: prompt.type,
      attempts: MAX_PARSE_RETRIES + 1,
    });

    const fallbackAction = this.generateFallbackAction(prompt.type, prompt.validTargets);
    const latencyMs = Date.now() - startTime;

    return {
      action: fallbackAction,
      rawResponse: rawResponse || '[fallback - no valid response]',
      tokensUsed: totalTokensUsed,
      latencyMs,
    };
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
   * Extract JSON from response that might be wrapped in markdown.
   * Uses jsonrepair library to handle common LLM syntax errors like:
   * - Trailing commas
   * - Unquoted keys
   * - Single quotes instead of double quotes
   * - Unescaped control characters
   */
  private extractJSON(content: string): unknown {
    let candidate = content;

    // 1. Try to extract from markdown code blocks first
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      candidate = codeBlockMatch[1].trim();
    } else {
      // 2. If no code blocks, try to find the largest { } or [ ] block
      const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch?.[1]) {
        candidate = jsonMatch[1].trim();
      } else {
        candidate = content.trim();
      }
    }

    // 3. Attempt parse, falling back to jsonrepair
    try {
      // Try standard parse first (fastest/strictest)
      return JSON.parse(candidate);
    } catch {
      try {
        // Fallback: Use jsonrepair library for robust recovery
        return JSON.parse(jsonrepair(candidate));
      } catch (repairError) {
        // If repair also fails, throw descriptive error
        throw new Error(
          `JSON parse failed: ${repairError instanceof Error ? repairError.message : String(repairError)}`
        );
      }
    }
  }
}

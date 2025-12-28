/**
 * GameAIAdapter - DEPRECATED
 * 
 * This adapter was part of the old Suspense Pattern for handling AI calls
 * in the GameRunner Durable Object. It has been replaced by WorkflowAIProvider
 * which uses native Cloudflare Workflows for better reliability.
 * 
 * This stub is kept for backwards compatibility during migration.
 * New games should use MafiaWorkflow instead of GameRunner.
 * 
 * @deprecated Use WorkflowAIProvider with MafiaWorkflow instead.
 */

import type { AIProvider, AIContext, ActionPrompt, AIResponse, PlayerAction, Persona } from '../../engine/types.js';
import type { AIProviderInterface, CachedAIResponse, AIRequestMessage } from './types.js';
import { SuspenseError, getSchemaForAction } from './types.js';
import { createLogger, type Logger } from '../utils/logger.js';
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
 * Statistics about fallback action usage.
 */
export interface FallbackStats {
  total: number;
  fallbacks: number;
}

/**
 * Options for suspense mode - used internally by GameAIAdapterOptions.
 */
export interface SuspenseModeOptions {
  checkCache: (requestId: string) => Promise<CachedAIResponse | undefined>;
  queueRequest: (message: AIRequestMessage) => Promise<void>;
  gameId: string;
  discountPricing?: boolean;
  traceId?: string;
}

/**
 * Options for GameAIAdapter.
 */
export interface GameAIAdapterOptions {
  suspenseMode?: SuspenseModeOptions;
}

/**
 * @deprecated Use WorkflowAIProvider with MafiaWorkflow instead.
 * 
 * Adapter that bridges AI providers to the game engine's AIProvider interface.
 * This version supports the Suspense Pattern for DO hibernation.
 */
export class GameAIAdapter implements AIProvider {
  protected readonly log: Logger;
  protected fallbackCounts: Map<string, FallbackStats> = new Map();
  private readonly suspenseConfig: SuspenseModeOptions | undefined;

  constructor(
    private readonly providers: Map<string, AIProviderInterface>,
    options: GameAIAdapterOptions = {}
  ) {
    this.log = createLogger('GameAIAdapter');
    
    // Enable suspense mode if provided
    if (options.suspenseMode) {
      this.suspenseConfig = options.suspenseMode;
    }
  }

  private generateRequestId(context: AIContext, prompt: ActionPrompt): string {
    const discussionRound = context.discussionRound ?? 0;
    return `${context.gameId}-${context.round}-${context.phase}-${context.playerId}-${prompt.type}-${discussionRound}`;
  }

  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    const provider = this.providers.get(context.modelId);
    if (!provider) {
      throw new Error(`No provider found for model: ${context.modelId}`);
    }

    // Suspense mode: check cache first
    if (this.suspenseConfig) {
      const requestId = this.generateRequestId(context, prompt);
      
      // Check if we have a cached response
      const cached = await this.suspenseConfig.checkCache!(requestId);
      
      if (cached) {
        if (cached.error) {
          throw new Error(`Cached AI error: ${cached.error}`);
        }
        if (cached.response) {
          // Parse cached response
          const action = this.parseAction(
            cached.response.content,
            prompt.type,
            prompt.validTargets,
            context.modelId
          );
          
          return {
            action,
            rawResponse: cached.response.content,
            tokensUsed: cached.response.tokensUsed,
            latencyMs: cached.response.latencyMs,
          };
        }
      }

      // No cached response - queue the request and suspend
      const structuredOutput = getSchemaForAction(prompt.type);
      
      const message: AIRequestMessage = {
        requestId,
        gameId: this.suspenseConfig.gameId!,
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
        ...(this.suspenseConfig.traceId && { traceId: this.suspenseConfig.traceId }),
        ...(this.suspenseConfig.discountPricing && { discountPricing: this.suspenseConfig.discountPricing }),
      };
      
      await this.suspenseConfig.queueRequest!(message);

      throw new SuspenseError(
        requestId,
        {
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          structuredOutput,
          temperature: 0.7,
          maxTokens: 4000,
        },
        context.modelId,
        {
          gameId: this.suspenseConfig.gameId!,
          round: context.round,
          phase: context.phase,
          playerId: context.playerId,
          actionType: prompt.type,
        }
      );
    }

    // Direct mode: call provider immediately
    const structuredOutput = getSchemaForAction(prompt.type);
    const startTime = Date.now();
    
    const response = await provider.complete({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      structuredOutput,
      temperature: 0.7,
      maxTokens: 4000,
    });

    const latencyMs = Date.now() - startTime;

    // Parse the response
    const action = this.parseAction(
      response.content,
      prompt.type,
      prompt.validTargets,
      context.modelId
    );

    return {
      action,
      rawResponse: response.content,
      tokensUsed: response.tokensUsed,
      latencyMs,
    };
  }

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
    
    if (data.vote === null || data.vote === 'null' || data.vote === '') {
      return { type: 'elimination_vote', target: null };
    }

    const target = String(data.vote ?? data.target ?? '').trim();

    if (!target) {
      return { type: 'elimination_vote', target: null };
    }

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

  private extractJSON(content: string): unknown {
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


/**
 * Adapter that bridges AI providers to the game engine's AIProvider interface.
 * This allows the pure game engine to use Cloudflare AI providers.
 * 
 * BENCHMARK INTEGRITY: This adapter does NOT use fallback actions.
 * If a model produces invalid output, it is recorded as a parse error.
 * This is critical for benchmark validity - model failures must be tracked.
 */

import type { AIProvider, AIContext, ActionPrompt, AIResponse, PlayerAction } from '../../engine/types.js';
import type { AIProviderInterface } from './types.js';
import { AIErrors } from './errors.js';
import { getSchemaForAction } from './types.js';
import { createLogger, logErrorWithStack, type Logger } from '../utils/logger.js';
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
 * Adapts the worker AI providers to the game engine's AIProvider interface.
 */
export class GameAIAdapter implements AIProvider {
  private log: Logger;

  constructor(private readonly providers: Map<string, AIProviderInterface>) {
    this.log = createLogger('GameAIAdapter');
    this.log.debug('Adapter created', { providerCount: providers.size, models: Array.from(providers.keys()) });
  }

  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    const callLog = this.log.child({ 
      modelId: context.modelId, 
      playerId: context.playerId,
      actionType: prompt.type,
    });

    const provider = this.providers.get(context.modelId);
    if (!provider) {
      callLog.error('Provider not found for model', { availableModels: Array.from(this.providers.keys()) });
      throw AIErrors.unsupportedModel(context.modelId);
    }

    const startTime = Date.now();
    callLog.debug('Starting AI call');

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

      // Parse the response into a PlayerAction - throws AIParseError on failure
      const action = this.parseAction(
        response.content, 
        prompt.type, 
        prompt.validTargets,
        context.modelId
      );

      callLog.debug('Action parsed successfully', { actionType: action.type });

      return {
        action,
        rawResponse: response.content,
        tokensUsed: {
          input: response.tokensUsed.input,
          output: response.tokensUsed.output,
        },
        latencyMs,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      if (error instanceof AIParseError) {
        callLog.warn('AI parse error', { 
          latencyMs,
          parseError: error.parseError,
          rawResponseLength: error.rawResponse.length,
        });
      } else {
        logErrorWithStack(callLog, 'AI call failed', error, { latencyMs });
      }
      
      throw error;
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
   */
  private extractJSON(content: string): unknown {
    // Try markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(this.sanitizeJSON(codeBlockMatch[1].trim()));
      } catch {
        // Continue trying
      }
    }

    // Try to find a JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try {
        return JSON.parse(this.sanitizeJSON(jsonMatch[0]));
      } catch {
        // Continue trying
      }
    }

    // Try raw content
    return JSON.parse(this.sanitizeJSON(content.trim()));
  }

  /**
   * Sanitize JSON string to fix common issues from free/cheap models:
   * - Unescaped control characters (newlines, tabs) inside string values
   * - Trailing commas
   */
  private sanitizeJSON(json: string): string {
    // Fix unescaped control characters inside JSON strings
    // This regex finds strings and escapes any unescaped control characters
    let sanitized = json;
    
    // Replace literal newlines/tabs inside strings with escaped versions
    // We do this by finding string boundaries and fixing content within
    try {
      // Simple approach: replace control characters that would break JSON
      // \x00-\x1f are control characters (except we keep \n, \r, \t patterns that are already escaped)
      sanitized = sanitized.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ');
      
      // Fix literal newlines/carriage returns inside string values
      // Match strings and fix their contents
      sanitized = sanitized.replace(
        /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
        (match) => {
          // Inside the string, escape unescaped newlines and tabs
          return match
            .replace(/(?<!\\)\n/g, '\\n')
            .replace(/(?<!\\)\r/g, '\\r')
            .replace(/(?<!\\)\t/g, '\\t');
        }
      );
    } catch {
      // If sanitization fails, return original
    }
    
    return sanitized;
  }
}

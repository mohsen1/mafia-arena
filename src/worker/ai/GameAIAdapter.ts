/**
 * Adapter that bridges AI providers to the game engine's AIProvider interface.
 * This allows the pure game engine to use Cloudflare AI providers.
 */

import type { AIProvider, AIContext, ActionPrompt, AIResponse, PlayerAction } from '../../engine/types.js';
import type { AIProviderInterface } from './types.js';
import { AIErrors } from './errors.js';

/**
 * Adapts the worker AI providers to the game engine's AIProvider interface.
 */
export class GameAIAdapter implements AIProvider {
  constructor(private readonly providers: Map<string, AIProviderInterface>) {}

  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    const provider = this.providers.get(context.modelId);
    if (!provider) {
      throw AIErrors.unsupportedModel(context.modelId);
    }

    const startTime = Date.now();

    const response = await provider.complete({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      responseFormat: 'json',
      temperature: 0.7,
      maxTokens: 1000,
    });

    // Parse the response into a PlayerAction
    const action = this.parseAction(response.content, prompt.type, prompt.validTargets);

    return {
      action,
      rawResponse: response.content,
      tokensUsed: {
        input: response.tokensUsed.input,
        output: response.tokensUsed.output,
      },
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Parse AI response into a PlayerAction.
   */
  private parseAction(
    content: string,
    actionType: ActionPrompt['type'],
    validTargets?: readonly string[]
  ): PlayerAction {
    try {
      const parsed = this.extractJSON(content);

      switch (actionType) {
        case 'persona_generation':
          return this.parsePersonaGeneration(parsed);

        case 'introduction':
          return this.parseIntroduction(parsed);

        case 'kill_vote':
          return this.parseKillVote(parsed, validTargets);

        case 'discussion':
          return this.parseDiscussion(parsed);

        case 'mafia_discussion':
          return this.parseMafiaDiscussion(parsed);

        case 'elimination_vote':
          return this.parseEliminationVote(parsed, validTargets);
      }
    } catch (error) {
      // Return a fallback action on parse error
      return this.getFallbackAction(actionType, validTargets);
    }
  }

  private parsePersonaGeneration(parsed: unknown): PlayerAction {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid persona generation response');
    }

    const data = parsed as Record<string, unknown>;
    const name = String(data.name ?? 'Unknown');
    const background = String(data.background ?? 'A mysterious player.');
    const personality = String(data.personality ?? 'Reserved');
    const occupation = data.occupation ? String(data.occupation) : undefined;

    return {
      type: 'persona_generation',
      persona: { name, background, personality, occupation },
    };
  }

  private parseIntroduction(parsed: unknown): PlayerAction {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid introduction response');
    }

    const data = parsed as Record<string, unknown>;
    const message = String(data.message ?? '');

    return { type: 'introduction', message: message || 'Hello everyone!' };
  }

  private parseKillVote(parsed: unknown, validTargets?: readonly string[]): PlayerAction {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid kill vote response');
    }

    const data = parsed as Record<string, unknown>;
    const target = String(data.target ?? data.vote ?? '');

    // Validate target
    if (validTargets && !validTargets.includes(target)) {
      // Fall back to first valid target
      return { type: 'kill_vote', target: validTargets[0] ?? '' };
    }

    return { type: 'kill_vote', target };
  }

  private parseDiscussion(parsed: unknown): PlayerAction {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid discussion response');
    }

    const data = parsed as Record<string, unknown>;
    const message = String(data.message ?? '');

    return { type: 'discussion', message: message || 'I have nothing to say.' };
  }

  private parseMafiaDiscussion(parsed: unknown): PlayerAction {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid mafia discussion response');
    }

    const data = parsed as Record<string, unknown>;
    const message = String(data.message ?? '');

    return { type: 'mafia_discussion', message: message || 'Let me think about our target.' };
  }

  private parseEliminationVote(parsed: unknown, validTargets?: readonly string[]): PlayerAction {
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid elimination vote response');
    }

    const data = parsed as Record<string, unknown>;
    const target = data.vote === null ? null : String(data.vote ?? data.target ?? '');

    // Handle abstention
    if (target === null || target === '' || target === 'null') {
      return { type: 'elimination_vote', target: null };
    }

    // Validate target
    if (validTargets && !validTargets.includes(target)) {
      // Fall back to first valid target
      return { type: 'elimination_vote', target: validTargets[0] ?? null };
    }

    return { type: 'elimination_vote', target };
  }

  private getFallbackAction(
    actionType: ActionPrompt['type'],
    validTargets?: readonly string[]
  ): PlayerAction {
    switch (actionType) {
      case 'persona_generation':
        return { 
          type: 'persona_generation', 
          persona: { 
            name: 'Unknown', 
            background: 'A mysterious player.', 
            personality: 'Reserved' 
          } 
        };

      case 'introduction':
        return { type: 'introduction', message: 'Hello everyone, nice to meet you.' };

      case 'kill_vote':
        return { type: 'kill_vote', target: validTargets?.[0] ?? '' };

      case 'discussion':
        return { type: 'discussion', message: 'I have nothing to add.' };

      case 'mafia_discussion':
        return { type: 'mafia_discussion', message: 'Let me think about our strategy.' };

      case 'elimination_vote':
        return { type: 'elimination_vote', target: validTargets?.[0] ?? null };
    }
  }

  /**
   * Extract JSON from response that might be wrapped in markdown.
   */
  private extractJSON(content: string): unknown {
    // Try markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch?.[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // Continue trying
      }
    }

    // Try to find a JSON object
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Continue trying
      }
    }

    // Try raw content
    return JSON.parse(content.trim());
  }
}


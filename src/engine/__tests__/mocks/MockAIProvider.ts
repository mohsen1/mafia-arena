/**
 * Mock AI Provider for testing.
 * Allows queuing predetermined responses for predictable test results.
 */

import type {
  AIProvider,
  AIContext,
  ActionPrompt,
  AIResponse,
  PlayerAction,
} from '../../types.js';

export interface MockResponseConfig {
  action: PlayerAction;
  reasoning?: string;
  tokensUsed?: { input: number; output: number };
  latencyMs?: number;
}

/**
 * Mock AI provider that returns pre-configured responses.
 * Useful for testing game logic without actual AI calls.
 */
export class MockAIProvider implements AIProvider {
  private responses: AIResponse[] = [];
  private responseIndex = 0;
  private callLog: Array<{ context: AIContext; prompt: ActionPrompt }> = [];

  /**
   * Queue a response to be returned on the next getAction call.
   */
  queueResponse(config: MockResponseConfig): void {
    const response: AIResponse = {
      action: config.action,
      rawResponse: JSON.stringify(config.action),
      tokensUsed: config.tokensUsed ?? { input: 100, output: 50 },
      latencyMs: config.latencyMs ?? 500,
    };
    if (config.reasoning !== undefined) {
      (response as { reasoning?: string }).reasoning = config.reasoning;
    }
    this.responses.push(response);
  }

  /**
   * Queue multiple responses.
   */
  queueResponses(configs: MockResponseConfig[]): void {
    for (const config of configs) {
      this.queueResponse(config);
    }
  }

  /**
   * Get action from the mock provider.
   * Returns the next queued response or throws if none available.
   */
  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    this.callLog.push({ context, prompt });

    if (this.responseIndex >= this.responses.length) {
      throw new Error(
        `MockAIProvider: No more queued responses. Called ${this.callLog.length} times, only ${this.responses.length} responses queued.`
      );
    }

    const response = this.responses[this.responseIndex]!;
    this.responseIndex++;
    return response;
  }

  /**
   * Get the log of all calls made to this provider.
   */
  getCallLog(): ReadonlyArray<{ context: AIContext; prompt: ActionPrompt }> {
    return this.callLog;
  }

  /**
   * Get the number of responses that have been consumed.
   */
  getConsumedCount(): number {
    return this.responseIndex;
  }

  /**
   * Get the number of responses remaining.
   */
  getRemainingCount(): number {
    return this.responses.length - this.responseIndex;
  }

  /**
   * Reset the mock provider to its initial state.
   */
  reset(): void {
    this.responses = [];
    this.responseIndex = 0;
    this.callLog = [];
  }
}

/**
 * Create a mock AI provider that always votes for a specific target.
 */
export function createKillVotingProvider(targetId: string): MockAIProvider {
  const provider = new MockAIProvider();
  
  // Create many responses for a full game
  for (let i = 0; i < 100; i++) {
    provider.queueResponse({
      action: { type: 'kill_vote', target: targetId },
    });
  }

  return provider;
}

/**
 * Create a mock AI provider for a complete game scenario.
 * Handles all phases with appropriate action types.
 */
export class ScenarioMockAIProvider implements AIProvider {
  private callLog: Array<{ context: AIContext; prompt: ActionPrompt; response: AIResponse }> = [];

  constructor(
    private readonly strategy: GameStrategy
  ) {}

  async getAction(context: AIContext, prompt: ActionPrompt): Promise<AIResponse> {
    let action: PlayerAction;

    switch (prompt.type) {
      case 'persona_generation':
        action = {
          type: 'persona_generation',
          persona: {
            name: `Player${context.playerId.slice(-1)}`,
            background: 'A test player generated for mocking.',
            personality: 'Analytical',
          },
        };
        break;

      case 'introduction':
        action = {
          type: 'introduction',
          message: this.strategy.getIntroductionMessage(context),
        };
        break;

      case 'kill_vote':
        action = {
          type: 'kill_vote',
          target: this.strategy.getKillTarget(context, prompt.validTargets ?? []),
        };
        break;

      case 'discussion':
        action = {
          type: 'discussion',
          message: this.strategy.getDiscussionMessage(context),
        };
        break;

      case 'mafia_discussion':
        action = {
          type: 'mafia_discussion',
          message: this.strategy.getMafiaDiscussionMessage?.(context) 
            ?? `I think we should target someone specific.`,
        };
        break;

      case 'elimination_vote':
        action = {
          type: 'elimination_vote',
          target: this.strategy.getEliminationTarget(context, prompt.validTargets ?? []),
        };
        break;
    }

    const response: AIResponse = {
      action,
      rawResponse: JSON.stringify(action),
      tokensUsed: { input: 100, output: 50 },
      latencyMs: 100,
    };

    this.callLog.push({ context, prompt, response });
    return response;
  }

  getCallLog() {
    return this.callLog;
  }
}

/**
 * Strategy interface for scenario-based testing.
 */
export interface GameStrategy {
  getIntroductionMessage(context: AIContext): string;
  getKillTarget(context: AIContext, validTargets: readonly string[]): string;
  getDiscussionMessage(context: AIContext): string;
  getMafiaDiscussionMessage?(context: AIContext): string;
  getEliminationTarget(context: AIContext, validTargets: readonly string[]): string | null;
}

/**
 * Simple strategy that always picks the first valid target.
 */
export class FirstTargetStrategy implements GameStrategy {
  getIntroductionMessage(context: AIContext): string {
    return `Hello everyone, I'm ${context.playerName}. Looking forward to a fair game!`;
  }

  getKillTarget(_context: AIContext, validTargets: readonly string[]): string {
    return validTargets[0]!;
  }

  getDiscussionMessage(context: AIContext): string {
    return `I am ${context.playerName} and I think we should be careful.`;
  }

  getEliminationTarget(_context: AIContext, validTargets: readonly string[]): string | null {
    return validTargets[0] ?? null;
  }
}

/**
 * Strategy where mafia coordinates and town votes randomly.
 */
export class CoordinatedMafiaStrategy implements GameStrategy {
  private mafiaTarget: string | null = null;
  private townVoteIndex = 0;

  getIntroductionMessage(context: AIContext): string {
    if (context.team === 'mafia') {
      return `Hi, I'm ${context.playerName}. Just a regular citizen here, ready to help find the mafia.`;
    }
    return `Greetings, I'm ${context.playerName}. Let's work together to find those mafia members!`;
  }

  getKillTarget(_context: AIContext, validTargets: readonly string[]): string {
    // Mafia always coordinates on the first target
    if (!this.mafiaTarget || !validTargets.includes(this.mafiaTarget)) {
      this.mafiaTarget = validTargets[0]!;
    }
    return this.mafiaTarget;
  }

  getDiscussionMessage(context: AIContext): string {
    if (context.team === 'mafia') {
      return `I haven't noticed anything suspicious. Let's not rush to judgment.`;
    }
    return `We need to find the mafia! Who has been acting strange?`;
  }

  getEliminationTarget(context: AIContext, validTargets: readonly string[]): string | null {
    // Town cycles through targets, mafia votes together
    if (context.team === 'town') {
      const target = validTargets[this.townVoteIndex % validTargets.length];
      this.townVoteIndex++;
      return target ?? null;
    }
    // Mafia votes for first town player they see
    return validTargets[0] ?? null;
  }
}


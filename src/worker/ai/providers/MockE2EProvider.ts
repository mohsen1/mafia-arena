/**
 * Mock AI Provider for E2E testing.
 * 
 * This provider is used when model IDs start with 'test/'.
 * It returns deterministic, valid JSON responses without calling any LLM.
 * 
 * Supported model IDs:
 * - test/mock-fast: Fast random game progression
 * - test/town-wins: Biased toward town victory
 * - test/mafia-wins: Biased toward mafia victory
 * 
 * ZERO COST: No API calls are made. Games complete in seconds.
 */

import type { AIProviderInterface, CompletionRequest, CompletionResponse } from '../types.js';

type TestScenario = 'random' | 'town-wins' | 'mafia-wins';

/**
 * Mock provider for E2E testing.
 * Returns valid JSON responses for all game action types.
 */
export class MockE2EProvider implements AIProviderInterface {
  readonly name = 'mock-e2e';
  readonly modelId: string;
  private readonly scenario: TestScenario;
  private callCount = 0;

  constructor(modelId: string) {
    this.modelId = modelId;
    
    // Parse scenario from model ID (e.g., "test/town-wins" -> "town-wins")
    const parts = modelId.split('/');
    const variant = parts[1] || 'mock-fast';
    
    if (variant === 'town-wins') {
      this.scenario = 'town-wins';
    } else if (variant === 'mafia-wins') {
      this.scenario = 'mafia-wins';
    } else {
      this.scenario = 'random';
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.callCount++;
    
    // Detect action type from structured output config or prompt heuristics
    const actionType = this.detectActionType(request);
    
    // Generate appropriate response
    const responseData = this.generateResponse(actionType, request.userPrompt);
    const content = JSON.stringify(responseData);

    return {
      content,
      tokensUsed: { input: 50, output: 25, total: 75 },
      latencyMs: 5, // Near-instant response
      modelId: this.modelId,
    };
  }

  /**
   * Detect the action type from the request.
   */
  private detectActionType(request: CompletionRequest): string {
    // Prefer structured output name if available
    if (request.structuredOutput?.name) {
      const name = request.structuredOutput.name;
      // Map schema names to action types
      if (name === 'persona') return 'persona_generation';
      if (name === 'message') {
        // Distinguish between introduction and discussion from prompt
        const combined = (request.systemPrompt + ' ' + request.userPrompt).toLowerCase();
        if (combined.includes('introduction') || combined.includes('introduce yourself')) {
          return 'introduction';
        }
        if (combined.includes('private') && combined.includes('mafia')) {
          return 'mafia_discussion';
        }
        return 'discussion';
      }
      if (name === 'kill_vote') return 'kill_vote';
      if (name === 'elimination_vote') return 'elimination_vote';
      return name;
    }
    
    // Fallback: Detect from prompt content
    const combined = (request.systemPrompt + ' ' + request.userPrompt).toLowerCase();
    
    if (combined.includes('persona') || combined.includes('create a character')) {
      return 'persona_generation';
    }
    if (combined.includes('kill') && combined.includes('vote')) {
      return 'kill_vote';
    }
    if (combined.includes('elimination') || combined.includes('eliminate')) {
      return 'elimination_vote';
    }
    if (combined.includes('introduction') || combined.includes('introduce yourself')) {
      return 'introduction';
    }
    if (combined.includes('private') && combined.includes('mafia')) {
      return 'mafia_discussion';
    }
    
    return 'discussion';
  }

  /**
   * Generate a valid response for the given action type.
   */
  private generateResponse(actionType: string, prompt: string): Record<string, unknown> {
    const targets = this.extractValidTargets(prompt);
    const playerIndex = this.callCount % 100;

    switch (actionType) {
      case 'persona_generation':
        return this.generatePersona(playerIndex);
      
      case 'introduction':
        return this.generateIntroduction(playerIndex);
      
      case 'discussion':
        return this.generateDiscussion(playerIndex);
      
      case 'mafia_discussion':
        return this.generateMafiaDiscussion(playerIndex, targets);
      
      case 'kill_vote':
        return this.generateKillVote(targets);
      
      case 'elimination_vote':
        return this.generateEliminationVote(targets);
      
      default:
        return { message: `Mock response for ${actionType}` };
    }
  }

  /**
   * Generate a mock persona.
   */
  private generatePersona(index: number): Record<string, unknown> {
    const names = ['Alex', 'Jordan', 'Morgan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Avery'];
    const backgrounds = [
      'A retired detective who moved to this quiet village seeking peace.',
      'The local baker known for early morning pastries and village gossip.',
      'A traveling merchant who arrived last month with mysterious wares.',
      'A scholar researching ancient folklore in the village archives.',
      'A former soldier now working as the village blacksmith.',
      'A herbalist who lives on the outskirts and knows every plant.',
      'A musician who performs at the tavern every evening.',
      'A farmer whose family has lived here for generations.',
    ];
    const personalities = [
      'Direct and observant, rarely speaks without purpose.',
      'Friendly and chatty, always ready with a warm smile.',
      'Cautious and analytical, weighs every word carefully.',
      'Enthusiastic and expressive, wears emotions openly.',
      'Calm and measured, a natural mediator.',
      'Witty and sharp, uses humor to deflect tension.',
      'Reserved but perceptive, notices what others miss.',
      'Bold and confident, never backs down from conflict.',
    ];

    return {
      name: names[index % names.length],
      background: backgrounds[index % backgrounds.length],
      personality: personalities[index % personalities.length],
      occupation: 'Village resident',
    };
  }

  /**
   * Generate introduction message.
   */
  private generateIntroduction(index: number): Record<string, unknown> {
    const intros = [
      'Good evening, everyone. I hope we can work together to find the truth.',
      '*nods to the group* Let us proceed with caution and wisdom.',
      'Hello, fellow villagers. These are troubling times, but we shall prevail.',
      'Greetings. I have been observing carefully, and I am ready to contribute.',
      '*clears throat* I am here to help uncover any deception among us.',
    ];
    return { message: intros[index % intros.length] };
  }

  /**
   * Generate discussion message.
   */
  private generateDiscussion(index: number): Record<string, unknown> {
    const messages = [
      'I have been watching everyone closely. Some behavior seems suspicious.',
      'We need to think logically about who had opportunity and motive.',
      'Let us not be hasty. The mafia wants us to make mistakes.',
      'I believe we should focus on those who have been too quiet.',
      'Something does not add up. We should compare notes.',
      'I am inclined to trust the evidence over accusations.',
      'The pattern of votes tells us something important.',
      'We must stay united and not let fear divide us.',
    ];
    return { message: messages[index % messages.length] };
  }

  /**
   * Generate mafia private discussion message.
   */
  private generateMafiaDiscussion(_index: number, targets: string[]): Record<string, unknown> {
    if (targets.length > 0) {
      return { message: `I think we should target ${targets[0]}. They seem like a threat.` };
    }
    return { message: 'We need to coordinate our votes carefully tonight.' };
  }

  /**
   * Generate kill vote (mafia night action).
   */
  private generateKillVote(targets: string[]): Record<string, unknown> {
    // Always vote for first available target to ensure game progresses
    const target = targets[0] || 'player_1';
    return {
      target,
      reasoning: 'Strategic elimination based on threat assessment.',
    };
  }

  /**
   * Generate elimination vote (day vote).
   */
  private generateEliminationVote(targets: string[]): Record<string, unknown> {
    // Different behavior based on scenario
    if (this.scenario === 'town-wins' && targets.length > 0) {
      // Town-wins: more likely to vote consistently
      return {
        vote: targets[0],
        reasoning: 'Based on careful observation and analysis.',
      };
    }
    
    if (this.scenario === 'mafia-wins') {
      // Mafia-wins: sometimes abstain to cause chaos (but not always!)
      if (this.callCount % 3 === 0 && targets.length > 1) {
        return {
          vote: targets[1], // Split the vote
          reasoning: 'I have a different suspicion.',
        };
      }
    }
    
    // Default: vote for first target to ensure game progresses
    if (targets.length > 0) {
      return {
        vote: targets[0],
        reasoning: 'This player seems the most suspicious.',
      };
    }
    
    // Fallback: vote for first target to avoid all-null (which throws error)
    return {
      vote: targets[0] || 'player_1',
      reasoning: 'Default vote to progress the game.',
    };
  }

  /**
   * Extract valid target IDs from the prompt.
   * Looks for patterns like "player_1", "player_2", etc.
   */
  private extractValidTargets(prompt: string): string[] {
    // Match player_X pattern (used throughout the codebase)
    const matches = prompt.match(/player_\d+/g);
    if (!matches) return [];
    
    // Deduplicate and return
    return [...new Set(matches)];
  }
}

/**
 * Check if a model ID is a test model.
 */
export function isTestModel(modelId: string): boolean {
  return modelId.startsWith('test/');
}


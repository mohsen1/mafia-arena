/**
 * Worker-level mock AI provider that returns JSON strings.
 *
 * This provider implements AIProviderInterface (worker level) and returns
 * stringified JSON to test AI provider parsing logic, including:
 * - Zod schema validation
 * - Context window limit checks
 * - Parse error retries
 *
 * Use scripted actions for deterministic game outcomes, or rely on
 * intelligent defaults for simpler tests.
 */

import type {
  AIProviderInterface,
  CompletionRequest,
  CompletionResponse,
} from '../../ai/types.js';

/**
 * A scripted action to queue for the provider.
 */
export interface ScriptedAction {
  /** The action type this response is for (optional, for validation) */
  actionType?: string;
  /** The response object to stringify and return */
  response: Record<string, unknown>;
  /** Optional: return raw string instead of JSON (for testing parse errors) */
  raw?: string;
  /** Simulate latency in ms */
  latencyMs?: number;
  /** Simulate token usage */
  tokensUsed?: { input: number; output: number };
}

/**
 * Call log entry for test assertions.
 */
export interface CallLogEntry {
  request: CompletionRequest;
  detectedActionType: string;
  responseReturned: string;
  timestamp: number;
}

/**
 * Worker-level mock that returns JSON strings to test AI provider parsing.
 * Uses a queue of scripted actions for deterministic game outcomes.
 */
export class ScriptedWorkerProvider implements AIProviderInterface {
  readonly name = 'scripted-worker';
  private actionQueue: ScriptedAction[] = [];
  private callLog: CallLogEntry[] = [];
  private defaultResponseOverrides: Map<string, Record<string, unknown>> =
    new Map();

  /** Counter for generating unique player names */
  private personaCounter = 0;

  constructor(public readonly modelId: string) {}

  /**
   * Queue a scripted response. Returns JSON string to test adapter parsing.
   */
  queueAction(
    actionType: string,
    response: Record<string, unknown>,
    options?: { latencyMs?: number; tokensUsed?: { input: number; output: number } }
  ): void {
    this.actionQueue.push({
      actionType,
      response,
      latencyMs: options?.latencyMs,
      tokensUsed: options?.tokensUsed,
    });
  }

  /**
   * Queue a raw string response (for testing parse error handling).
   */
  queueRawResponse(raw: string): void {
    this.actionQueue.push({ response: {}, raw });
  }

  /**
   * Queue multiple actions at once.
   */
  queueActions(actions: ScriptedAction[]): void {
    this.actionQueue.push(...actions);
  }

  /**
   * Set a default response override for a specific action type.
   * This is used when no scripted action is queued.
   */
  setDefaultResponse(
    actionType: string,
    response: Record<string, unknown>
  ): void {
    this.defaultResponseOverrides.set(actionType, response);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const actionType = this.detectActionType(request);
    const scripted = this.actionQueue.shift();

    let content: string;
    let latencyMs = 10;
    let tokensUsed = { input: 100, output: 50, total: 150 };

    if (scripted?.raw !== undefined) {
      // Return raw string (for parse error testing)
      content = scripted.raw;
    } else if (scripted?.response) {
      // Return stringified scripted response
      content = JSON.stringify(scripted.response);
      if (scripted.latencyMs) latencyMs = scripted.latencyMs;
      if (scripted.tokensUsed) {
        tokensUsed = {
          ...scripted.tokensUsed,
          total: scripted.tokensUsed.input + scripted.tokensUsed.output,
        };
      }
    } else {
      // Generate default response based on action type
      const defaultResponse = this.getDefaultResponse(actionType, request);
      content = JSON.stringify(defaultResponse);
    }

    // Log the call for test assertions
    this.callLog.push({
      request,
      detectedActionType: actionType,
      responseReturned: content,
      timestamp: Date.now(),
    });

    return {
      content,
      tokensUsed,
      latencyMs,
      modelId: this.modelId,
    };
  }

  /**
   * Detect action type from the completion request.
   * Uses heuristics on the prompt text.
   */
  private detectActionType(request: CompletionRequest): string {
    const systemPrompt = request.systemPrompt.toLowerCase();
    const userPrompt = request.userPrompt.toLowerCase();
    const combined = systemPrompt + ' ' + userPrompt;

    // Check structured output config first (most reliable)
    if (request.structuredOutput?.name) {
      const name = request.structuredOutput.name;
      if (name === 'persona') return 'persona_generation';
      if (name === 'message') {
        // Distinguish between introduction, discussion, and mafia_discussion
        if (combined.includes('introduction') || combined.includes('introduce yourself')) {
          return 'introduction';
        }
        if (combined.includes('mafia') && combined.includes('privately')) {
          return 'mafia_discussion';
        }
        return 'discussion';
      }
      if (name === 'kill_vote') return 'kill_vote';
      if (name === 'elimination_vote') return 'elimination_vote';
    }

    // Fallback to prompt heuristics
    if (combined.includes('persona') || combined.includes('create a character')) {
      return 'persona_generation';
    }
    if (combined.includes('introduction') || combined.includes('introduce yourself')) {
      return 'introduction';
    }
    if (combined.includes('kill') && combined.includes('vote')) {
      return 'kill_vote';
    }
    if (combined.includes('elimination') && combined.includes('vote')) {
      return 'elimination_vote';
    }
    if (combined.includes('mafia') && combined.includes('privately')) {
      return 'mafia_discussion';
    }

    return 'discussion';
  }

  /**
   * Generate default responses that pass Zod validation.
   * These are used when no scripted action is queued.
   */
  private getDefaultResponse(
    actionType: string,
    request: CompletionRequest
  ): Record<string, unknown> {
    // Check for overrides first - but still need to validate targets
    const override = this.defaultResponseOverrides.get(actionType);

    switch (actionType) {
      case 'persona_generation': {
        this.personaCounter++;
        return {
          name: `TestPlayer${this.personaCounter}`,
          background: `A mysterious figure with a hidden past. Player number ${this.personaCounter}.`,
          personality: 'Analytical and cautious',
          occupation: 'Detective',
        };
      }

      case 'introduction':
        return {
          message: `Hello everyone, I'm looking forward to finding the truth together.`,
        };

      case 'discussion':
        return {
          message: `I've been observing everyone carefully. We need to work together to find the mafia.`,
        };

      case 'mafia_discussion':
        return {
          message: `We should coordinate our strategy carefully. Let's pick our target wisely.`,
        };

      case 'kill_vote': {
        // ALWAYS extract valid targets from the prompt - player_1 might be dead
        const validTargets = this.extractAllValidTargets(request.userPrompt);
        const target = validTargets[0] || 'player_1';
        return {
          target,
          reasoning: 'Strategic elimination based on game state.',
        };
      }

      case 'elimination_vote': {
        // ALWAYS extract valid targets from the prompt - player_1 might be dead
        const validTargets = this.extractAllValidTargets(request.userPrompt);
        const target = validTargets[0] || null; // Abstain if no valid targets
        return {
          vote: target,
          reasoning: target
            ? 'Based on the discussion, this player seems most suspicious.'
            : 'Unable to determine a suitable target.',
        };
      }

      default:
        return override || { message: 'Default test response.' };
    }
  }

  /**
   * Extract all valid targets from a prompt containing a target list.
   * Handles multiple prompt formats from the game engine:
   * - "Available targets:\nplayer_1\nplayer_2"
   * - "Alive players:\nplayer_1\nplayer_2"
   * - "Valid targets: player_1, player_2"
   */
  private extractAllValidTargets(prompt: string): string[] {
    // Try to find the targets section
    // Format 1: "Available targets:\nplayer_1\nplayer_2\n\nGame context"
    // Format 2: "Alive players:\nplayer_1\nplayer_2\n\nDiscussion summary"
    const targetSectionMatch = prompt.match(
      /(?:Available targets|Alive players|Valid targets)[:\s]*([\s\S]*?)(?:\n\n|Game context|Discussion|$)/i
    );
    
    if (targetSectionMatch?.[1]) {
      const section = targetSectionMatch[1];
      // Extract player IDs from this section only
      const playerIds = section.match(/player_\d+/gi) || [];
      return [...new Set(playerIds.map(id => id.toLowerCase()))];
    }

    // Fallback: find all player_X patterns but this is less reliable
    const allPlayerIds = prompt.match(/player_\d+/gi) || [];
    return [...new Set(allPlayerIds.map(id => id.toLowerCase()))];
  }

  /**
   * Extract the first valid target from a prompt containing a target list.
   */
  private extractFirstValidTarget(prompt: string): string | null {
    const targets = this.extractAllValidTargets(prompt);
    return targets[0] || null;
  }

  /**
   * Get the log of all calls made to this provider.
   */
  getCallLog(): ReadonlyArray<CallLogEntry> {
    return this.callLog;
  }

  /**
   * Get calls filtered by action type.
   */
  getCallsByActionType(actionType: string): CallLogEntry[] {
    return this.callLog.filter((c) => c.detectedActionType === actionType);
  }

  /**
   * Get the number of responses remaining in the queue.
   */
  getRemainingCount(): number {
    return this.actionQueue.length;
  }

  /**
   * Get the number of calls made.
   */
  getCallCount(): number {
    return this.callLog.length;
  }

  /**
   * Reset the provider to its initial state.
   */
  reset(): void {
    this.actionQueue = [];
    this.callLog = [];
    this.defaultResponseOverrides.clear();
    this.personaCounter = 0;
  }
}

/**
 * Create a map of providers for multiple models.
 * Useful for test setup.
 */
export function createScriptedProviders(
  modelIds: string[]
): Map<string, ScriptedWorkerProvider> {
  const providers = new Map<string, ScriptedWorkerProvider>();
  for (const modelId of modelIds) {
    providers.set(modelId, new ScriptedWorkerProvider(modelId));
  }
  return providers;
}


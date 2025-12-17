/**
 * Introduction Phase Handler
 * All players introduce themselves at the start of the game.
 */

import type { GameState } from '../GameState.js';
import type {
  AIProvider,
  AICallEvent,
  IntroductionEvent,
  PhaseStartEvent,
  PhaseEndEvent,
  ConversationMessage,
} from '../types.js';
import { getVisibleState } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS } from '../utils/prompts.js';

export interface IntroductionPhaseResult {
  readonly state: GameState;
  readonly messages: readonly ConversationMessage[];
}

/**
 * Shuffle array using Fisher-Yates algorithm.
 */
function shuffleArray<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Execute the introduction phase.
 * Each player introduces themselves at the start of the game.
 */
export async function executeIntroductionPhase(
  initialState: GameState,
  aiProvider: AIProvider
): Promise<IntroductionPhaseResult> {
  let state = initialState.withPhase('introduction');
  const alivePlayers = shuffleArray(state.alivePlayers);
  const messages: ConversationMessage[] = [];
  const playerCount = alivePlayers.length;

  // Add phase start event
  const phaseStartEvent: PhaseStartEvent = {
    type: 'phase_start',
    phase: 'introduction',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseStartEvent);

  // Each player introduces themselves
  for (const player of alivePlayers) {
    const visibleState = getVisibleState(state, player);

    // Generate appropriate system prompt based on team
    const systemPrompt =
      player.team === 'mafia'
        ? SYSTEM_PROMPTS.mafia(
            state.aliveMafia
              .filter((p) => p.id !== player.id)
              .map((p) => p.name)
          )
        : SYSTEM_PROMPTS.town();

    // Use introduction-specific prompts
    const userPrompt =
      player.team === 'mafia'
        ? ACTION_PROMPTS.introductionMafia(player.name, playerCount)
        : ACTION_PROMPTS.introductionTown(player.name, playerCount);

    const response = await aiProvider.getAction(
      {
        gameId: state.gameId,
        playerId: player.id,
        playerName: player.name,
        modelId: player.modelId,
        team: player.team,
        phase: 'introduction',
        round: state.round,
        visibleState,
      },
      {
        type: 'introduction',
        systemPrompt,
        userPrompt,
      }
    );

    // Record the AI call event
    const aiCallEvent: AICallEvent = {
      type: 'ai_call',
      phase: 'introduction',
      round: state.round,
      playerId: player.id,
      playerName: player.name,
      modelId: player.modelId,
      team: player.team,
      actionType: 'introduction',
      prompt: {
        system: systemPrompt,
        user: userPrompt,
      },
      response: {
        raw: response.rawResponse,
        parsed: response.action,
      },
      tokensUsed: response.tokensUsed,
      latencyMs: response.latencyMs,
      timestamp: Date.now(),
    };
    state = state.withEvent(aiCallEvent);

    // Extract and record the introduction message
    if (response.action.type === 'introduction') {
      const message: ConversationMessage = {
        playerId: player.id,
        playerName: player.name,
        message: response.action.message,
        round: state.round,
      };

      messages.push(message);
      state = state.withConversationMessage(message);

      const introductionEvent: IntroductionEvent = {
        type: 'introduction',
        round: state.round,
        playerId: player.id,
        playerName: player.name,
        message: response.action.message,
        timestamp: Date.now(),
      };
      state = state.withEvent(introductionEvent);
    }
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'introduction',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseEndEvent);

  return { state, messages };
}


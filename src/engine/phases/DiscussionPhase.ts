/**
 * Discussion Phase Handler
 * All alive players discuss before voting.
 */

import type { GameState } from '../GameState.js';
import type {
  AIProvider,
  AICallEvent,
  DiscussionEvent,
  PhaseStartEvent,
  PhaseEndEvent,
  ConversationMessage,
} from '../types.js';
import { getVisibleState } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS } from '../utils/prompts.js';

export interface DiscussionPhaseResult {
  readonly state: GameState;
  readonly messages: readonly ConversationMessage[];
}

/**
 * Execute the discussion phase.
 * Each alive player shares their thoughts.
 */
export async function executeDiscussionPhase(
  initialState: GameState,
  aiProvider: AIProvider
): Promise<DiscussionPhaseResult> {
  let state = initialState.withPhase('day_discussion');
  const alivePlayers = state.alivePlayers;
  const messages: ConversationMessage[] = [];

  // Add phase start event
  const phaseStartEvent: PhaseStartEvent = {
    type: 'phase_start',
    phase: 'day_discussion',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseStartEvent);

  // Each player discusses in order
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

    const userPrompt = ACTION_PROMPTS.discussion(visibleState, player.persona);

    const response = await aiProvider.getAction(
      {
        gameId: state.gameId,
        playerId: player.id,
        playerName: player.name,
        modelId: player.modelId,
        team: player.team,
        phase: 'day_discussion',
        round: state.round,
        visibleState,
      },
      {
        type: 'discussion',
        systemPrompt,
        userPrompt,
      }
    );

    // Record the AI call event
    const aiCallEvent: AICallEvent = {
      type: 'ai_call',
      phase: 'day_discussion',
      round: state.round,
      playerId: player.id,
      playerName: player.name,
      modelId: player.modelId,
      team: player.team,
      actionType: 'discussion',
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

    // Extract and record the discussion message
    if (response.action.type === 'discussion') {
      const message: ConversationMessage = {
        playerId: player.id,
        playerName: player.name,
        message: response.action.message,
        round: state.round,
      };

      messages.push(message);
      state = state.withConversationMessage(message);

      const discussionEvent: DiscussionEvent = {
        type: 'discussion',
        round: state.round,
        playerId: player.id,
        playerName: player.name,
        message: response.action.message,
        timestamp: Date.now(),
      };
      state = state.withEvent(discussionEvent);
    }
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'day_discussion',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseEndEvent);

  return { state, messages };
}


/**
 * Discussion Phase Handler
 * All alive players discuss before voting with multi-round support.
 * 
 * RESUMPTION SUPPORT: When a game resumes after suspension (e.g., SuspenseError
 * while waiting for AI), we check for existing AI call events to avoid
 * duplicating messages from players who already spoke.
 */

import type { GameState } from '../GameState.js';
import type {
  AIProvider,
  AICallEvent,
  DiscussionEvent,
  PhaseEndEvent,
  ConversationMessage,
  GameEvent,
} from '../types.js';
import { getVisibleState } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS } from '../utils/prompts.js';
import { ensurePhaseStart, shouldPlayerActInDiscussionRound } from '../utils/idempotency.js';

/** Default number of discussion rounds during day phase */
const DEFAULT_DAY_DISCUSSION_ROUNDS = 3;

export interface DiscussionPhaseResult {
  readonly state: GameState;
  readonly messages: readonly ConversationMessage[];
}

/** Optional callback for streaming events during phase execution */
export type PhaseEventCallback = (event: GameEvent) => void | Promise<void>;

/**
 * Execute the discussion phase.
 * Each alive player shares their thoughts across multiple discussion rounds.
 * @param onEvent Optional callback to stream events in real-time
 */
export async function executeDiscussionPhase(
  initialState: GameState,
  aiProvider: AIProvider,
  onEvent?: PhaseEventCallback
): Promise<DiscussionPhaseResult> {
  let state = initialState.withPhase('day_discussion');
  const messages: ConversationMessage[] = [];

  // Helper to add event to state and optionally emit it
  const emitEvent = async (event: GameEvent): Promise<void> => {
    state = state.withEvent(event);
    if (onEvent) {
      await onEvent(event);
    }
  };

  // Get the number of discussion rounds from config
  const numRounds = state.config.dayDiscussionRounds ?? DEFAULT_DAY_DISCUSSION_ROUNDS;

  // Idempotent phase start - only emits if not already emitted
  await ensurePhaseStart(state, 'day_discussion', emitEvent);

  // Execute multiple discussion rounds
  for (let discussionRound = 1; discussionRound <= numRounds; discussionRound++) {
    // Shuffle player order each round using seeded RNG for reproducibility
    const speakers = state.rng.shuffled(state.alivePlayers);

    for (const player of speakers) {
      // Idempotent player action - skip if player already spoke in this discussion round
      if (!shouldPlayerActInDiscussionRound(state, player.id, 'day_discussion', 'discussion', discussionRound)) {
        continue;
      }

      const visibleState = getVisibleState(state, player, {
        currentDiscussionRound: discussionRound,
        totalDiscussionRounds: numRounds,
      });

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
          discussionRound, // Critical for cache key differentiation in multi-round discussion
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
      await emitEvent(aiCallEvent);

      // Extract and record the discussion message
      if (response.action.type === 'discussion') {
        const message: ConversationMessage = {
          playerId: player.id,
          playerName: player.name,
          message: response.action.message,
          round: state.round,
          channel: 'public',
          discussionRound,
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
          channel: 'public',
          discussionRound,
        };
        await emitEvent(discussionEvent);
      }
    }
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'day_discussion',
    round: state.round,
    timestamp: Date.now(),
  };
  await emitEvent(phaseEndEvent);

  return { state, messages };
}

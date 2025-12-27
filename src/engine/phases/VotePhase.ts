/**
 * Vote Phase Handler
 * All alive players vote to eliminate someone.
 */

import type { GameState } from '../GameState.js';
import type {
  AIProvider,
  Player,
  AICallEvent,
  VoteEvent,
  EliminationEvent,
  PhaseStartEvent,
  PhaseEndEvent,
  GameEvent,
} from '../types.js';
import { resolveVotes } from '../utils/votes.js';
import { getVisibleState, getValidEliminationTargets, formatPlayerListShuffled } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS } from '../utils/prompts.js';

export interface VotePhaseResult {
  readonly state: GameState;
  readonly eliminated: Player | null;
  readonly votes: ReadonlyMap<string, string | null>;
}

/** Optional callback for streaming events during phase execution */
export type PhaseEventCallback = (event: GameEvent) => void | Promise<void>;

/**
 * Execute the voting phase.
 * Each alive player votes to eliminate someone.
 * @param onEvent Optional callback to stream events in real-time
 */
export async function executeVotePhase(
  initialState: GameState,
  aiProvider: AIProvider,
  onEvent?: PhaseEventCallback
): Promise<VotePhaseResult> {
  let state = initialState.withPhase('day_vote');
  const alivePlayers = state.alivePlayers;
  const votes = new Map<string, string | null>();

  // Helper to add event to state and optionally emit it
  const emitEvent = async (event: GameEvent): Promise<void> => {
    state = state.withEvent(event);
    if (onEvent) {
      await onEvent(event);
    }
  };

  // Add phase start event
  const phaseStartEvent: PhaseStartEvent = {
    type: 'phase_start',
    phase: 'day_vote',
    round: state.round,
    timestamp: Date.now(),
  };
  await emitEvent(phaseStartEvent);

  // Collect votes from each player
  for (const player of alivePlayers) {
    const visibleState = getVisibleState(state, player);
    const validTargets = getValidEliminationTargets(state, player.id);

    // Generate appropriate system prompt based on team
    const systemPrompt =
      player.team === 'mafia'
        ? SYSTEM_PROMPTS.mafia(
            state.aliveMafia
              .filter((p) => p.id !== player.id)
              .map((p) => p.name)
          )
        : SYSTEM_PROMPTS.town();

    // POSITION BIAS FIX: Shuffle target list in prompt to eliminate position bias
    const targetList = formatPlayerListShuffled(validTargets, state.rng);
    const userPrompt = ACTION_PROMPTS.eliminationVote(
      targetList.split('\n'),
      visibleState,
      player.persona
    );

    const response = await aiProvider.getAction(
      {
        gameId: state.gameId,
        playerId: player.id,
        playerName: player.name,
        modelId: player.modelId,
        team: player.team,
        phase: 'day_vote',
        round: state.round,
        visibleState,
      },
      {
        type: 'elimination_vote',
        systemPrompt,
        userPrompt,
        validTargets: validTargets.map((t) => t.id),
      }
    );

    // Record the AI call event
    const aiCallEvent: AICallEvent = {
      type: 'ai_call',
      phase: 'day_vote',
      round: state.round,
      playerId: player.id,
      playerName: player.name,
      modelId: player.modelId,
      team: player.team,
      actionType: 'elimination_vote',
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

    // Record the vote
    if (response.action.type === 'elimination_vote') {
      const targetId = response.action.target;

      // Validate the target (null is valid for abstaining)
      if (targetId === null || validTargets.some((t) => t.id === targetId)) {
        votes.set(player.id, targetId);

        const voteEvent: VoteEvent = {
          type: 'vote',
          phase: 'day_vote',
          round: state.round,
          voterId: player.id,
          voterName: player.name,
          targetId,
          timestamp: Date.now(),
        };
        await emitEvent(voteEvent);
      }
    }
  }

  // Resolve the elimination vote
  // Filter out null votes for resolution
  const validVotes = new Map<string, string>();
  for (const [voterId, targetId] of votes) {
    if (targetId !== null) {
      validVotes.set(voterId, targetId);
    }
  }

  // SAFETY CHECK: Detect when ALL alive players voted null (abstained)
  // This typically indicates a systemic AI failure (e.g., context overflow causing
  // all models to produce invalid responses that fall back to null votes).
  // A single intentional abstention is valid, but ALL players abstaining is suspicious.
  const nullVoteCount = votes.size - validVotes.size;
  const allPlayersAbstained = votes.size > 0 && validVotes.size === 0;
  
  if (allPlayersAbstained) {
    // All alive players voted null - this is almost certainly an AI failure
    throw new Error(
      `All ${nullVoteCount} alive players abstained (voted null). ` +
      `This typically indicates AI provider failures (context overflow, rate limits, etc.). ` +
      `Round ${state.round}, Phase ${state.phase}.`
    );
  }

  const eliminated = resolveVotes(validVotes, [...alivePlayers], state.rng);

  if (eliminated) {
    state = state.withPlayerEliminated(eliminated.id);

    const eliminationEvent: EliminationEvent = {
      type: 'elimination',
      phase: 'day_vote',
      round: state.round,
      playerId: eliminated.id,
      playerName: eliminated.name,
      team: eliminated.team,
      timestamp: Date.now(),
    };
    await emitEvent(eliminationEvent);
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'day_vote',
    round: state.round,
    timestamp: Date.now(),
  };
  await emitEvent(phaseEndEvent);

  return { state, eliminated, votes };
}

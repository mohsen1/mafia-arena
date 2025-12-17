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
} from '../types.js';
import { resolveVotes } from '../utils/votes.js';
import { getVisibleState, getValidEliminationTargets, formatPlayerList } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS } from '../utils/prompts.js';

export interface VotePhaseResult {
  readonly state: GameState;
  readonly eliminated: Player | null;
  readonly votes: ReadonlyMap<string, string | null>;
}

/**
 * Execute the voting phase.
 * Each alive player votes to eliminate someone.
 */
export async function executeVotePhase(
  initialState: GameState,
  aiProvider: AIProvider
): Promise<VotePhaseResult> {
  let state = initialState.withPhase('day_vote');
  const alivePlayers = state.alivePlayers;
  const votes = new Map<string, string | null>();

  // Add phase start event
  const phaseStartEvent: PhaseStartEvent = {
    type: 'phase_start',
    phase: 'day_vote',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseStartEvent);

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

    const targetList = formatPlayerList(validTargets);
    const userPrompt = ACTION_PROMPTS.eliminationVote(
      targetList.split('\n'),
      visibleState
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
    state = state.withEvent(aiCallEvent);

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
        state = state.withEvent(voteEvent);
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

  const eliminated = resolveVotes(validVotes, [...alivePlayers]);

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
    state = state.withEvent(eliminationEvent);
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'day_vote',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseEndEvent);

  return { state, eliminated, votes };
}


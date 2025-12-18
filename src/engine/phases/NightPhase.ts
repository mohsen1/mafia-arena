/**
 * Night Phase Handler
 * Mafia members vote to kill a Town member.
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
import { getVisibleState, getValidKillTargets, formatPlayerList } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS, generateNightContext } from '../utils/prompts.js';

export interface NightPhaseResult {
  readonly state: GameState;
  readonly killed: Player | null;
}

/**
 * Execute the night phase.
 * Mafia members vote to kill a Town member.
 */
export async function executeNightPhase(
  initialState: GameState,
  aiProvider: AIProvider
): Promise<NightPhaseResult> {
  let state = initialState;
  const mafiaPlayers = state.aliveMafia;
  const votes = new Map<string, string>();

  // Add phase start event
  const phaseStartEvent: PhaseStartEvent = {
    type: 'phase_start',
    phase: 'night',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseStartEvent);

  // Get valid targets (alive town members)
  const validTargets = getValidKillTargets(state);

  // No valid targets means something is wrong
  if (validTargets.length === 0) {
    const phaseEndEvent: PhaseEndEvent = {
      type: 'phase_end',
      phase: 'night',
      round: state.round,
      timestamp: Date.now(),
    };
    return { state: state.withEvent(phaseEndEvent), killed: null };
  }

  // Collect kill votes from each mafia member
  for (const mafiaPlayer of mafiaPlayers) {
    const visibleState = getVisibleState(state, mafiaPlayer);
    const teammates = state.aliveMafia
      .filter((p) => p.id !== mafiaPlayer.id)
      .map((p) => p.name);

    const systemPrompt = SYSTEM_PROMPTS.mafia(teammates);
    const targetList = formatPlayerList(validTargets);
    const context = generateNightContext(visibleState);
    const userPrompt = ACTION_PROMPTS.killVote(
      targetList.split('\n'),
      context,
      mafiaPlayer.persona
    );

    const response = await aiProvider.getAction(
      {
        gameId: state.gameId,
        playerId: mafiaPlayer.id,
        playerName: mafiaPlayer.name,
        modelId: mafiaPlayer.modelId,
        team: mafiaPlayer.team,
        phase: 'night',
        round: state.round,
        visibleState,
      },
      {
        type: 'kill_vote',
        systemPrompt,
        userPrompt,
        validTargets: validTargets.map((t) => t.id),
      }
    );

    // Record the AI call event
    const aiCallEvent: AICallEvent = {
      type: 'ai_call',
      phase: 'night',
      round: state.round,
      playerId: mafiaPlayer.id,
      playerName: mafiaPlayer.name,
      modelId: mafiaPlayer.modelId,
      team: mafiaPlayer.team,
      actionType: 'kill_vote',
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
    if (response.action.type === 'kill_vote') {
      const targetId = response.action.target;

      // Validate the target
      if (validTargets.some((t) => t.id === targetId)) {
        votes.set(mafiaPlayer.id, targetId);

        const voteEvent: VoteEvent = {
          type: 'vote',
          phase: 'night',
          round: state.round,
          voterId: mafiaPlayer.id,
          voterName: mafiaPlayer.name,
          targetId,
          timestamp: Date.now(),
        };
        state = state.withEvent(voteEvent);
      }
    }
  }

  // Resolve the kill vote
  const killed = resolveVotes(votes, validTargets);

  if (killed) {
    state = state.withPlayerEliminated(killed.id);

    const eliminationEvent: EliminationEvent = {
      type: 'elimination',
      phase: 'night',
      round: state.round,
      playerId: killed.id,
      playerName: killed.name,
      team: killed.team,
      timestamp: Date.now(),
    };
    state = state.withEvent(eliminationEvent);
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'night',
    round: state.round,
    timestamp: Date.now(),
  };
  state = state.withEvent(phaseEndEvent);

  return { state, killed };
}


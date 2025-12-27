/**
 * Night Phase Handler
 * Mafia members discuss strategy privately, then vote to kill a Town member.
 * 
 * RESUMPTION SUPPORT: When a game resumes after suspension (e.g., SuspenseError
 * while waiting for AI), we check for existing events to avoid duplicating
 * mafia discussion messages and kill votes.
 */

import type { GameState } from '../GameState.js';
import type {
  AIProvider,
  Player,
  AICallEvent,
  VoteEvent,
  EliminationEvent,
  PhaseEndEvent,
  ConversationMessage,
  DiscussionEvent,
  GameEvent,
} from '../types.js';
import { resolveVotes } from '../utils/votes.js';
import { getVisibleState, getValidKillTargets, formatPlayerListShuffled } from '../utils/visibility.js';
import { SYSTEM_PROMPTS, ACTION_PROMPTS, generateNightContext } from '../utils/prompts.js';
import { ensurePhaseStart, shouldPlayerActInDiscussionRound, getExistingVote } from '../utils/idempotency.js';

/** Default number of discussion rounds for mafia during night */
const DEFAULT_NIGHT_DISCUSSION_ROUNDS = 2;

export interface NightPhaseResult {
  readonly state: GameState;
  readonly killed: Player | null;
}

/** Optional callback for streaming events during phase execution */
export type PhaseEventCallback = (event: GameEvent) => void | Promise<void>;

/**
 * Execute the mafia private discussion sub-phase.
 * Mafia members discuss strategy before voting.
 */
async function executeMafiaDiscussion(
  initialState: GameState,
  aiProvider: AIProvider,
  numRounds: number,
  emitEvent: (event: GameEvent) => Promise<void>
): Promise<GameState> {
  let state = initialState;
  const mafiaPlayers = state.aliveMafia;

  // Skip discussion if only one mafia member (no one to discuss with)
  if (mafiaPlayers.length <= 1) {
    return state;
  }

  for (let discussionRound = 1; discussionRound <= numRounds; discussionRound++) {
    // Shuffle mafia order each round using seeded RNG
    const shuffledMafia = state.rng.shuffled(mafiaPlayers);

    for (const mafiaPlayer of shuffledMafia) {
      // Idempotent player action - skip if mafia member already spoke in this discussion round
      if (!shouldPlayerActInDiscussionRound(state, mafiaPlayer.id, 'night', 'mafia_discussion', discussionRound)) {
        continue;
      }

      const visibleState = getVisibleState(state, mafiaPlayer, {
        currentDiscussionRound: discussionRound,
        totalDiscussionRounds: numRounds,
      });

      const teammates = state.aliveMafia
        .filter((p) => p.id !== mafiaPlayer.id)
        .map((p) => p.name);

      const systemPrompt = SYSTEM_PROMPTS.mafia(teammates);
      const userPrompt = ACTION_PROMPTS.mafiaDiscussion(
        visibleState,
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
          type: 'mafia_discussion',
          systemPrompt,
          userPrompt,
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
        actionType: 'mafia_discussion',
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
      await emitEvent(aiCallEvent);

      // Record the discussion message (mafia channel)
      if (response.action.type === 'mafia_discussion' || response.action.type === 'discussion') {
        const messageText = response.action.type === 'mafia_discussion' 
          ? response.action.message 
          : response.action.message;
        
        const message: ConversationMessage = {
          playerId: mafiaPlayer.id,
          playerName: mafiaPlayer.name,
          message: messageText,
          round: state.round,
          channel: 'mafia',
          discussionRound,
        };

        state = state.withConversationMessage(message);

        const discussionEvent: DiscussionEvent = {
          type: 'discussion',
          round: state.round,
          playerId: mafiaPlayer.id,
          playerName: mafiaPlayer.name,
          message: messageText,
          timestamp: Date.now(),
          channel: 'mafia',
          discussionRound,
        };
        state = state.withEvent(discussionEvent);
        await emitEvent(discussionEvent);
      }
    }
  }

  return state;
}

/**
 * Execute the night phase.
 * Mafia members discuss strategy privately, then vote to kill a Town member.
 * @param onEvent Optional callback to stream events in real-time
 */
export async function executeNightPhase(
  initialState: GameState,
  aiProvider: AIProvider,
  onEvent?: PhaseEventCallback
): Promise<NightPhaseResult> {
  let state = initialState;
  const mafiaPlayers = state.aliveMafia;
  const votes = new Map<string, string>();

  // Helper to add event to state and optionally emit it
  const emitEvent = async (event: GameEvent): Promise<void> => {
    state = state.withEvent(event);
    if (onEvent) {
      await onEvent(event);
    }
  };

  // Idempotent phase start - only emits if not already emitted
  await ensurePhaseStart(state, 'night', emitEvent);

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
    await emitEvent(phaseEndEvent);
    return { state, killed: null };
  }

  // === MAFIA DISCUSSION SUB-PHASE ===
  const numDiscussionRounds = state.config.nightDiscussionRounds ?? DEFAULT_NIGHT_DISCUSSION_ROUNDS;
  if (numDiscussionRounds > 0 && mafiaPlayers.length > 1) {
    // Note: executeMafiaDiscussion manages its own state, we pass emitEvent for streaming
    state = await executeMafiaDiscussion(state, aiProvider, numDiscussionRounds, async (event) => {
      if (onEvent) await onEvent(event);
    });
  }

  // Get the mafia discussion history for the kill vote context
  const mafiaHistory = state.getCurrentRoundMafiaConversation();

  // === KILL VOTE SUB-PHASE ===
  // Collect kill votes from each mafia member
  for (const mafiaPlayer of mafiaPlayers) {
    // Idempotent vote check - restore existing vote and skip if already voted
    const existingVote = getExistingVote(state, mafiaPlayer.id, 'night');
    if (existingVote !== undefined) {
      // Restore their vote to the local map for vote resolution
      if (existingVote !== null) {
        votes.set(mafiaPlayer.id, existingVote);
      }
      continue;
    }

    const visibleState = getVisibleState(state, mafiaPlayer);
    const teammates = state.aliveMafia
      .filter((p) => p.id !== mafiaPlayer.id)
      .map((p) => p.name);

    const systemPrompt = SYSTEM_PROMPTS.mafia(teammates);
    
    // POSITION BIAS FIX: Shuffle target list in prompt to eliminate position bias
    const targetList = formatPlayerListShuffled(validTargets, state.rng);
    const context = generateNightContext(visibleState);
    const userPrompt = ACTION_PROMPTS.killVote(
      targetList.split('\n'),
      context,
      mafiaPlayer.persona,
      mafiaHistory,
      visibleState  // Pass full state for large context support
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
    await emitEvent(aiCallEvent);

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
        await emitEvent(voteEvent);
      }
    }
  }

  // Resolve the kill vote (pass RNG for deterministic tie-breaking)
  const killed = resolveVotes(votes, validTargets, state.rng);

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
    await emitEvent(eliminationEvent);
  }

  // Add phase end event
  const phaseEndEvent: PhaseEndEvent = {
    type: 'phase_end',
    phase: 'night',
    round: state.round,
    timestamp: Date.now(),
  };
  await emitEvent(phaseEndEvent);

  return { state, killed };
}

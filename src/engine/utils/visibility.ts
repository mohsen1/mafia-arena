/**
 * State visibility utilities.
 * Determines what each player can see during the game.
 */

import { GameState } from '../GameState.js';
import type { 
  Player, 
  VisibleGameState, 
  VisiblePlayer, 
  VisibleDeadPlayer,
  VoteRecord,
  GameLogEntry,
  ContextLevel
} from '../types.js';
import type { RandomGenerator } from './random.js';

/**
 * Options for getting visible state with multi-round discussion context.
 */
export interface VisibleStateOptions {
  /** Current discussion sub-round (1-indexed) */
  currentDiscussionRound?: number;
  /** Total discussion rounds for this phase */
  totalDiscussionRounds?: number;
}

/**
 * Get the visible game state for a specific player.
 * Players can only see appropriate information based on their role.
 * Town players cannot see mafia-only messages.
 * 
 * When contextLevel is 'full' or 'windowed', includes complete game history
 * to leverage large context windows in modern LLMs.
 */
export function getVisibleState(
  state: GameState,
  player: Player,
  options?: VisibleStateOptions
): VisibleGameState {
  const alivePlayers: VisiblePlayer[] = state.alivePlayers.map((p) => ({
    id: p.id,
    name: p.name,
    persona: p.persona,
  }));

  const deadPlayers: VisibleDeadPlayer[] = state.deadPlayers.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team, // Roles are revealed on death
    persona: p.persona,
  }));

  // Mafia can see their teammates
  const teammates =
    player.team === 'mafia'
      ? state.aliveMafia
          .filter((p) => p.id !== player.id)
          .map((p) => p.id)
      : undefined;

  // Filter conversation history by visibility
  // Town only sees public messages, Mafia sees public messages in conversationHistory
  const publicHistory = state.getCurrentRoundPublicConversation();

  // Mafia also gets access to their private strategy chat
  const mafiaHistory =
    player.team === 'mafia'
      ? state.getCurrentRoundMafiaConversation()
      : undefined;

  // Get context level from config (default to 'summary' for backwards compatibility)
  const contextLevel: ContextLevel = state.config.contextLevel ?? 'summary';
  const windowSize = state.config.contextWindowSize ?? 3;

  // Build large context fields based on context level
  const largeContextFields = buildLargeContextFields(
    state,
    player,
    contextLevel,
    windowSize
  );

  return {
    round: state.round,
    phase: state.phase,
    alivePlayers,
    deadPlayers,
    conversationHistory: publicHistory,
    mafiaHistory,
    teammates,
    currentDiscussionRound: options?.currentDiscussionRound,
    totalDiscussionRounds: options?.totalDiscussionRounds,
    ...largeContextFields,
  };
}

/**
 * Build the large context fields based on context level.
 * These fields enable AI players to analyze full game history when
 * using models with large context windows (100k+ tokens).
 */
function buildLargeContextFields(
  state: GameState,
  player: Player,
  contextLevel: ContextLevel,
  windowSize: number
): Pick<VisibleGameState, 'fullConversationHistory' | 'fullMafiaHistory' | 'voteHistory' | 'gameLog'> {
  // 'summary' mode: no additional context (original behavior)
  if (contextLevel === 'summary') {
    return {};
  }

  // Build vote history from events
  const voteHistory = buildVoteHistory(state, player);
  
  // Build game log from events
  const gameLog = buildGameLog(state);

  // 'full' mode: complete verbatim history
  if (contextLevel === 'full') {
    const fullConversationHistory = state.conversationHistory.filter(
      (m) => m.channel !== 'mafia'
    );
    
    const fullMafiaHistory =
      player.team === 'mafia'
        ? state.conversationHistory.filter((m) => m.channel === 'mafia')
        : undefined;

    return {
      fullConversationHistory,
      fullMafiaHistory,
      voteHistory,
      gameLog,
    };
  }

  // 'windowed' mode: last N rounds verbatim, older rounds summarized
  const windowStart = Math.max(1, state.round - windowSize + 1);
  
  const fullConversationHistory = state.conversationHistory.filter(
    (m) => m.channel !== 'mafia' && m.round >= windowStart
  );
  
  const fullMafiaHistory =
    player.team === 'mafia'
      ? state.conversationHistory.filter(
          (m) => m.channel === 'mafia' && m.round >= windowStart
        )
      : undefined;

  return {
    fullConversationHistory,
    fullMafiaHistory,
    voteHistory,
    gameLog,
  };
}

/**
 * Build vote history from game events.
 * Only includes votes that have been publicly revealed (day votes).
 * Night kill votes are attributed to "Mafia" as a group.
 */
function buildVoteHistory(state: GameState, _player: Player): VoteRecord[] {
  const voteRecords: VoteRecord[] = [];
  const deadPlayerIds = new Set(state.deadPlayers.map(p => p.id));

  for (const event of state.events) {
    if (event.type === 'vote') {
      // Get voter info
      const voter = state.players.find(p => p.id === event.voterId);
      if (!voter) continue;

      // Get target name
      let targetName: string | null = null;
      if (event.targetId) {
        const target = state.players.find(p => p.id === event.targetId);
        targetName = target?.name ?? null;
      }

      // Only reveal voter's team if they're dead (for day votes)
      // Night votes by mafia are already team-revealing
      const revealTeam = event.phase === 'night' || deadPlayerIds.has(voter.id);

      voteRecords.push({
        round: event.round,
        phase: event.phase,
        voterName: event.phase === 'night' ? 'Mafia' : voter.name,
        targetName,
        voterTeam: revealTeam ? voter.team : undefined,
      });
    }
  }

  return voteRecords;
}

/**
 * Build game log from events.
 * High-level summary of eliminations and phase transitions.
 */
function buildGameLog(state: GameState): GameLogEntry[] {
  const entries: GameLogEntry[] = [];

  for (const event of state.events) {
    if (event.type === 'elimination') {
      entries.push({
        round: event.round,
        phase: event.phase,
        event: event.phase === 'night' 
          ? `${event.playerName} was killed by the Mafia`
          : `${event.playerName} was eliminated by vote`,
        playerName: event.playerName,
        playerTeam: event.team,
      });
    } else if (event.type === 'game_end') {
      entries.push({
        round: event.round,
        phase: 'day_vote', // Game ends after a phase
        event: `Game Over: ${event.winner === 'mafia' ? 'Mafia' : 'Town'} wins!`,
      });
    }
  }

  return entries;
}

/**
 * Get list of valid kill targets for mafia.
 * Returns only alive town members.
 */
export function getValidKillTargets(state: GameState): readonly Player[] {
  return state.aliveTown;
}

/**
 * Get list of valid elimination vote targets.
 * Returns all alive players (you can't vote for yourself in elimination).
 */
export function getValidEliminationTargets(
  state: GameState,
  voterId: string
): readonly Player[] {
  return state.alivePlayers.filter((p) => p.id !== voterId);
}

/**
 * Format player list for prompt.
 */
export function formatPlayerList(players: readonly Player[]): string {
  return players.map((p) => `- ${p.name} (${p.id})`).join('\n');
}

/**
 * Format player list for prompt with randomized order.
 * POSITION BIAS FIX: LLMs have known bias toward first/last items in lists.
 * Shuffling the order in prompts eliminates this confound for the benchmark.
 */
export function formatPlayerListShuffled(
  players: readonly Player[],
  rng: RandomGenerator
): string {
  const shuffled = rng.shuffled(players);
  return shuffled.map((p) => `- ${p.name} (${p.id})`).join('\n');
}

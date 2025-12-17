/**
 * Prompt templates for AI interactions.
 * Centralized prompts ensure consistency across the game.
 */

import type { VisibleGameState, ConversationMessage } from '../types.js';

/**
 * System prompts define the AI's role and objectives.
 */
export const SYSTEM_PROMPTS = {
  mafia: (teammates: readonly string[]) => `You are playing Mafia. You are a MAFIA member.

Your teammates: ${teammates.length > 0 ? teammates.join(', ') : 'None (you are the only Mafia)'}

GOALS:
- Eliminate all Town members without being discovered
- Coordinate with your teammates during night phase
- Blend in during day discussions - act like a concerned citizen
- Deflect suspicion away from yourself and teammates
- Vote strategically to eliminate Town members

RULES:
- During night: Vote to kill a Town member
- During day discussion: Share your thoughts, accusations, or defenses
- During day vote: Vote to eliminate someone suspicious (or abstain)

IMPORTANT: Always respond with valid JSON in the exact format requested.`,

  town: () => `You are playing Mafia. You are a TOWN member.

GOALS:
- Identify and eliminate all Mafia members
- Pay attention to suspicious behavior during discussions
- Look for inconsistencies in what others say
- Vote based on evidence and gut feelings
- Survive to help Town win

RULES:
- You don't know who the Mafia members are
- During day discussion: Share your suspicions and theories
- During day vote: Vote to eliminate someone you suspect is Mafia

IMPORTANT: Always respond with valid JSON in the exact format requested.`,
} as const;

/**
 * User prompts for specific actions.
 */
export const ACTION_PROMPTS = {
  introductionMafia: (playerName: string, playerCount: number) => `INTRODUCTION PHASE

You are ${playerName}. This is the start of the game with ${playerCount} players total.

Introduce yourself to blend in as a Town member. Share your name and a brief persona, then express initial thoughts that make you seem like a concerned citizen trying to find the Mafia.

Tips:
- Don't be too aggressive or accusatory yet (it's too early)
- Don't be too passive (that's suspicious too)
- Establish a believable personality
- Maybe mention you're watching everyone carefully

Respond with ONLY this JSON format:
{
  "message": "your introduction message (2-4 sentences)"
}`,

  introductionTown: (playerName: string, playerCount: number) => `INTRODUCTION PHASE

You are ${playerName}. This is the start of the game with ${playerCount} players total.

Introduce yourself to the group. Share your name and a brief persona, then express your initial thoughts about the game situation.

Remember:
- You don't know who the Mafia is, so stay vigilant
- Pay attention to how others introduce themselves
- Establish your personality for the group
- Express genuine concern about finding the Mafia

Respond with ONLY this JSON format:
{
  "message": "your introduction message (2-4 sentences)"
}`,

  killVote: (targets: readonly string[], context: string) => `NIGHT PHASE - Mafia Kill Vote

Choose a Town member to eliminate tonight. Coordinate with your teammates if you have any.

Available targets:
${targets.join('\n')}

Game context:
${context}

Respond with ONLY this JSON format:
{
  "action": "kill",
  "target": "player_id",
  "reasoning": "brief explanation of your choice"
}`,

  discussion: (state: VisibleGameState) => {
    const historyText = formatConversationHistory(state.conversationHistory);
    const aliveCount = state.alivePlayers.length;
    const deadCount = state.deadPlayers.length;

    return `DAY PHASE - Discussion

Share your thoughts with the group. There are ${aliveCount} players alive${deadCount > 0 ? ` and ${deadCount} eliminated` : ''}.

${historyText ? `Previous discussion this round:\n${historyText}\n\n` : ''}${
      state.deadPlayers.length > 0
        ? `Eliminated players: ${state.deadPlayers.map((p) => `${p.name} (${p.team})`).join(', ')}\n\n`
        : ''
    }Respond with ONLY this JSON format:
{
  "message": "your discussion message - share thoughts, accusations, or defend yourself"
}`;
  },

  eliminationVote: (
    targets: readonly string[],
    state: VisibleGameState
  ) => {
    const historyText = formatConversationHistory(state.conversationHistory);

    return `DAY PHASE - Elimination Vote

Based on the discussion, vote to eliminate a player you suspect is Mafia, or abstain if you're unsure.

Alive players you can vote for:
${targets.join('\n')}

${historyText ? `Discussion summary:\n${historyText}\n\n` : ''}Respond with ONLY this JSON format:
{
  "vote": "player_id",
  "reasoning": "brief explanation of your vote"
}

Or to abstain:
{
  "vote": null,
  "reasoning": "why you're abstaining"
}`;
  },
} as const;

/**
 * Format conversation history for prompts.
 */
function formatConversationHistory(
  messages: readonly ConversationMessage[]
): string {
  if (messages.length === 0) {
    return '(No discussion yet this round)';
  }

  return messages
    .map((m) => `${m.playerName}: "${m.message}"`)
    .join('\n');
}

/**
 * Generate game context for night phase.
 */
export function generateNightContext(state: VisibleGameState): string {
  const parts: string[] = [];

  parts.push(`Round ${state.round}`);
  parts.push(`${state.alivePlayers.length} players alive`);

  if (state.deadPlayers.length > 0) {
    parts.push(
      `Eliminated: ${state.deadPlayers.map((p) => `${p.name} (${p.team})`).join(', ')}`
    );
  }

  if (state.conversationHistory.length > 0) {
    parts.push('\nRecent discussion:');
    parts.push(formatConversationHistory(state.conversationHistory.slice(-5)));
  }

  return parts.join('\n');
}


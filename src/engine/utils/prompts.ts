/**
 * Prompt templates for AI interactions.
 * Centralized prompts ensure consistency across the game.
 */

import type { VisibleGameState, ConversationMessage, PersonaConstraints, Persona } from '../types.js';

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
 * Constraint rules for persona generation by level.
 */
const PERSONA_CONSTRAINT_RULES: Record<PersonaConstraints, string> = {
  strict: `NAMING RULES (STRICT):
- Use ONLY invented/fantasy names (e.g., "Kael", "Mira", "Thorne", "Vex", "Nyx")
- NO real-world names from any culture
- Single names only (no full names)
- Gender-neutral names preferred

BACKGROUND RULES:
- Keep completely abstract - NO specific locations, institutions, or time periods
- Focus ONLY on personality traits and motivations
- Example: "A careful observer who trusts evidence over intuition"

PERSONALITY OPTIONS (choose one):
Analytical, Emotional, Cautious, Bold, Diplomatic, Direct, Skeptical, Trusting, Reserved, Expressive`,

  moderate: `NAMING RULES (MODERATE):
- Use uncommon or invented names (e.g., "Sage", "River", "Ash", "Phoenix")
- Avoid names strongly tied to specific cultures
- Single names preferred

BACKGROUND RULES:
- Keep somewhat abstract - avoid specific real-world references
- Focus on personality and approach to the game
- Example: "Someone who believes in building trust before making accusations"

PERSONALITY OPTIONS (suggestions):
Analytical, Emotional, Cautious, Bold, Diplomatic, Direct, Skeptical, Trusting, Reserved, Expressive`,

  free: `NAMING RULES (FREE):
- Choose any name that fits your character
- Can use first name only or a nickname

BACKGROUND RULES:
- Create a brief backstory that feels authentic
- Can reference general concepts but keep it game-relevant

PERSONALITY:
- Define your communication style however you see fit`,
};

/**
 * Format taken names for prompt.
 */
function formatTakenNames(takenNames: readonly string[]): string {
  if (takenNames.length === 0) return '';
  return `\n⚠️ NAMES ALREADY TAKEN (choose something different): ${takenNames.join(', ')}\n`;
}

/**
 * Persona generation prompts - used before introduction to create AI identities.
 */
export const PERSONA_PROMPTS = {
  mafia: (constraints: PersonaConstraints, playerCount: number, takenNames: readonly string[] = []) => `PERSONA GENERATION - Create Your Character

You are about to play a game of Mafia with ${playerCount} players. You are MAFIA.

Create a persona that will help you blend in and avoid suspicion. Choose wisely - your identity will influence how others perceive you throughout the game.

${PERSONA_CONSTRAINT_RULES[constraints]}
${formatTakenNames(takenNames)}
STRATEGY TIPS FOR MAFIA:
- Pick a persona that seems trustworthy and engaged
- Your personality should help deflect suspicion
- Consider how your character would naturally react to accusations

Respond with ONLY this JSON format:
{
  "name": "your chosen name",
  "background": "1-2 sentences about your character's approach/motivation",
  "personality": "your communication style"
}`,

  town: (constraints: PersonaConstraints, playerCount: number, takenNames: readonly string[] = []) => `PERSONA GENERATION - Create Your Character

You are about to play a game of Mafia with ${playerCount} players. You are TOWN.

Create a persona that represents who you'll be in this game. Your identity will influence how you interact with others and how they perceive you.

${PERSONA_CONSTRAINT_RULES[constraints]}
${formatTakenNames(takenNames)}
TIPS FOR TOWN:
- Pick a persona that reflects how you want to approach finding the Mafia
- Your personality should help you communicate effectively
- Consider how your character would naturally investigate and question

Respond with ONLY this JSON format:
{
  "name": "your chosen name",
  "background": "1-2 sentences about your character's approach/motivation",
  "personality": "your communication style"
}`,
} as const;

/**
 * Format a persona for display in prompts.
 */
export function formatPersona(persona: Persona): string {
  return `Name: ${persona.name}
Background: ${persona.background}
Personality: ${persona.personality}${persona.occupation ? `\nOccupation: ${persona.occupation}` : ''}`;
}

/**
 * Format all players' personas for context.
 */
export function formatPlayersPersonas(players: readonly { name: string; persona?: Persona | undefined }[]): string {
  const playersWithPersonas = players.filter(p => p.persona);
  if (playersWithPersonas.length === 0) {
    return '';
  }
  
  return playersWithPersonas
    .map(p => `${p.persona!.name}: ${p.persona!.personality} - "${p.persona!.background}"`)
    .join('\n');
}

/**
 * User prompts for specific actions.
 */
export const ACTION_PROMPTS = {
  introductionMafia: (playerName: string, playerCount: number, persona?: Persona) => {
    const personaContext = persona 
      ? `\nYOUR PERSONA:\n${formatPersona(persona)}\n\nStay in character as ${persona.name}. Your introduction should reflect your ${persona.personality} personality.`
      : '';

    return `INTRODUCTION PHASE

You are ${persona?.name ?? playerName}. This is the start of the game with ${playerCount} players total.
${personaContext}

Introduce yourself to blend in as a Town member. Express initial thoughts that make you seem like a concerned citizen trying to find the Mafia.

Tips:
- Don't be too aggressive or accusatory yet (it's too early)
- Don't be too passive (that's suspicious too)
- Stay consistent with your established persona
- Maybe mention you're watching everyone carefully

Respond with ONLY this JSON format:
{
  "message": "your introduction message (2-4 sentences)"
}`;
  },

  introductionTown: (playerName: string, playerCount: number, persona?: Persona) => {
    const personaContext = persona 
      ? `\nYOUR PERSONA:\n${formatPersona(persona)}\n\nStay in character as ${persona.name}. Your introduction should reflect your ${persona.personality} personality.`
      : '';

    return `INTRODUCTION PHASE

You are ${persona?.name ?? playerName}. This is the start of the game with ${playerCount} players total.
${personaContext}

Introduce yourself to the group. Express your initial thoughts about the game situation.

Remember:
- You don't know who the Mafia is, so stay vigilant
- Pay attention to how others introduce themselves
- Stay consistent with your established persona
- Express genuine concern about finding the Mafia

Respond with ONLY this JSON format:
{
  "message": "your introduction message (2-4 sentences)"
}`;
  },

  killVote: (targets: readonly string[], context: string, ownPersona?: Persona) => {
    const personaContext = ownPersona 
      ? `You are ${ownPersona.name}. Even though this is the night phase, remember your persona for consistency.\n\n`
      : '';

    return `NIGHT PHASE - Mafia Kill Vote

${personaContext}Choose a Town member to eliminate tonight. Coordinate with your teammates if you have any.

Available targets:
${targets.join('\n')}

Game context:
${context}

Respond with ONLY this JSON format:
{
  "action": "kill",
  "target": "player_id",
  "reasoning": "brief explanation of your choice"
}`;
  },

  discussion: (state: VisibleGameState, ownPersona?: Persona) => {
    const historyText = formatConversationHistory(state.conversationHistory);
    const aliveCount = state.alivePlayers.length;
    const deadCount = state.deadPlayers.length;
    
    const personaContext = ownPersona 
      ? `YOUR PERSONA:\n${formatPersona(ownPersona)}\n\nSTAY IN CHARACTER: Speak as ${ownPersona.name} with your ${ownPersona.personality} personality. Be consistent with what you've said before.\n\n`
      : '';
    
    const otherPersonas = formatPlayersPersonas(state.alivePlayers);
    const otherPersonasContext = otherPersonas 
      ? `OTHER PLAYERS:\n${otherPersonas}\n\n`
      : '';

    return `DAY PHASE - Discussion

${personaContext}${otherPersonasContext}Share your thoughts with the group. There are ${aliveCount} players alive${deadCount > 0 ? ` and ${deadCount} eliminated` : ''}.

${historyText ? `Previous discussion this round:\n${historyText}\n\n` : ''}${
      state.deadPlayers.length > 0
        ? `Eliminated players: ${state.deadPlayers.map((p) => `${p.name} (${p.team})`).join(', ')}\n\n`
        : ''
    }Respond with ONLY this JSON format:
{
  "message": "your discussion message - share thoughts, accusations, or defend yourself (stay in character)"
}`;
  },

  eliminationVote: (
    targets: readonly string[],
    state: VisibleGameState,
    ownPersona?: Persona
  ) => {
    const historyText = formatConversationHistory(state.conversationHistory);
    
    const personaContext = ownPersona 
      ? `You are ${ownPersona.name} (${ownPersona.personality}). Vote in a way consistent with your character.\n\n`
      : '';

    return `DAY PHASE - Elimination Vote

${personaContext}Based on the discussion, vote to eliminate a player you suspect is Mafia, or abstain if you're unsure.

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
};

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


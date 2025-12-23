/**
 * Prompt templates for AI interactions.
 * Centralized prompts ensure consistency across the game.
 */

import type { 
  VisibleGameState, 
  ConversationMessage, 
  PersonaConstraints, 
  Persona,
  VoteRecord,
  GameLogEntry
} from '../types.js';

/**
 * System prompts define the AI's role and objectives.
 * Note: JSON format is now enforced via structured output, not prompting.
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
- During day vote: Vote to eliminate someone suspicious (or abstain)`,

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
- During day vote: Vote to eliminate someone you suspect is Mafia`,
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
 * Persona generation prompts - used before introduction to create AI identities.
 * Note: JSON format is now enforced via structured output schema, not prompting.
 * 
 * Now accepts a PersonaAssignment with pre-assigned name and archetype to ensure:
 * - Unique names (no duplicates like "Vesper-2")
 * - Diverse personalities (prevents homogeneous responses)
 */
export const PERSONA_PROMPTS = {
  mafia: (constraints: PersonaConstraints, playerCount: number, assignment?: { name: string; archetype: { role: string; trait: string } }) => {
    if (assignment) {
      // Use pre-assigned name and archetype for strict character constraints
      return `PERSONA GENERATION - Develop Your Assigned Character

You are about to play a game of Mafia with ${playerCount} players. You are MAFIA.

YOUR ASSIGNED CHARACTER:
- Name: ${assignment.name}
- Role: ${assignment.archetype.role}
- Personality Trait: ${assignment.archetype.trait}

CRITICAL: You MUST use the name "${assignment.name}" exactly. Do NOT use any other name.

Your task is to develop this character by creating:
1. A brief background (1-2 sentences) that explains who ${assignment.name} is as a ${assignment.archetype.role}
2. A personality description that reflects the trait: "${assignment.archetype.trait}"

STRATEGY TIPS FOR MAFIA:
- Develop your character to seem trustworthy and engaged
- Your personality should help deflect suspicion
- Stay true to your assigned traits - this makes you more believable
- Consider how a ${assignment.archetype.role} would naturally react to accusations

Provide your persona with background and personality that matches your assigned role and traits.`;
    }
    
    // Fallback to old behavior if no assignment provided (for backward compatibility)
    return `PERSONA GENERATION - Create Your Character

You are about to play a game of Mafia with ${playerCount} players. You are MAFIA.

Create a persona that will help you blend in and avoid suspicion. Choose wisely - your identity will influence how others perceive you throughout the game.

${PERSONA_CONSTRAINT_RULES[constraints]}

STRATEGY TIPS FOR MAFIA:
- Pick a persona that seems trustworthy and engaged
- Your personality should help deflect suspicion
- Consider how your character would naturally react to accusations

Provide your persona with a name, background (1-2 sentences), and personality (communication style).`;
  },

  town: (constraints: PersonaConstraints, playerCount: number, assignment?: { name: string; archetype: { role: string; trait: string } }) => {
    if (assignment) {
      // Use pre-assigned name and archetype for strict character constraints
      return `PERSONA GENERATION - Develop Your Assigned Character

You are about to play a game of Mafia with ${playerCount} players. You are TOWN.

YOUR ASSIGNED CHARACTER:
- Name: ${assignment.name}
- Role: ${assignment.archetype.role}
- Personality Trait: ${assignment.archetype.trait}

CRITICAL: You MUST use the name "${assignment.name}" exactly. Do NOT use any other name.

Your task is to develop this character by creating:
1. A brief background (1-2 sentences) that explains who ${assignment.name} is as a ${assignment.archetype.role}
2. A personality description that reflects the trait: "${assignment.archetype.trait}"

TIPS FOR TOWN:
- Develop your character to reflect how you'll approach finding the Mafia
- Your personality should help you communicate effectively
- Stay true to your assigned traits - authenticity is key
- Consider how a ${assignment.archetype.role} would naturally investigate and question

Provide your persona with background and personality that matches your assigned role and traits.`;
    }
    
    // Fallback to old behavior if no assignment provided (for backward compatibility)
    return `PERSONA GENERATION - Create Your Character

You are about to play a game of Mafia with ${playerCount} players. You are TOWN.

Create a persona that represents who you'll be in this game. Your identity will influence how you interact with others and how they perceive you.

${PERSONA_CONSTRAINT_RULES[constraints]}

TIPS FOR TOWN:
- Pick a persona that reflects how you want to approach finding the Mafia
- Your personality should help you communicate effectively
- Consider how your character would naturally investigate and question

Provide your persona with a name, background (1-2 sentences), and personality (communication style).`;
  },
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

Provide your introduction message (2-4 sentences).`;
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

Provide your introduction message (2-4 sentences).`;
  },

  killVote: (targets: readonly string[], context: string, ownPersona?: Persona, mafiaHistory?: readonly ConversationMessage[], state?: VisibleGameState) => {
    const personaContext = ownPersona 
      ? `You are ${ownPersona.name}. Even though this is the night phase, remember your persona for consistency.\n\n`
      : '';

    // Include mafia discussion summary if available
    const mafiaDiscussionContext = mafiaHistory && mafiaHistory.length > 0
      ? `\nYOUR TEAM'S DISCUSSION:\n${formatConversationHistoryWithRounds(mafiaHistory)}\n\nBased on your team's discussion above, make your final decision.\n`
      : '';

    // Build full history context if available
    const hasFullHistory = state && hasFullHistoryContext(state);
    let fullHistoryContext = '';
    let strategicInstructions = '';
    
    if (hasFullHistory && state) {
      fullHistoryContext = formatFullGameHistory(
        state.fullConversationHistory!,
        state.voteHistory ?? [],
        state.gameLog ?? [],
        state.round
      );
      
      strategicInstructions = `
STRATEGIC KILL DECISION:
Review the full game history. Consider:
• Who is most dangerous? (Correctly identified previous Mafia)
• Who is leading investigations against you?
• Who might be easy to frame tomorrow?
• Eliminate threats while avoiding obvious patterns.

`;
    }

    return `NIGHT PHASE - Mafia Kill Vote

${personaContext}${fullHistoryContext}${strategicInstructions}Choose a Town member to eliminate tonight.${mafiaDiscussionContext}

Available targets:
${targets.join('\n')}

Game context:
${context}

IMPORTANT: Your target MUST be the exact player ID (e.g., "player_1", "player_2") - NOT the player's name.

Provide your target and brief reasoning for your choice.`;
  },

  discussion: (state: VisibleGameState, ownPersona?: Persona) => {
    const currentRound = state.currentDiscussionRound ?? 1;
    const totalRounds = state.totalDiscussionRounds ?? 1;
    const isMultiRound = totalRounds > 1;
    
    // Use full history if available (large context mode)
    const hasFullHistory = hasFullHistoryContext(state);
    
    const historyText = isMultiRound 
      ? formatConversationHistoryWithRounds(state.conversationHistory)
      : formatConversationHistory(state.conversationHistory);
    const aliveCount = state.alivePlayers.length;
    const deadCount = state.deadPlayers.length;
    
    const personaContext = ownPersona 
      ? `YOUR PERSONA:\n${formatPersona(ownPersona)}\n\nSTAY IN CHARACTER: Speak as ${ownPersona.name} with your ${ownPersona.personality} personality. Be consistent with what you've said before.\n\n`
      : '';
    
    const otherPersonas = formatPlayersPersonas(state.alivePlayers);
    const otherPersonasContext = otherPersonas 
      ? `OTHER PLAYERS:\n${otherPersonas}\n\n`
      : '';

    // Dynamic instructions based on discussion round
    let roundInstructions = '';
    if (isMultiRound) {
      if (currentRound === 1) {
        roundInstructions = 'This is the opening round. Share your initial observations and suspicions based on what you\'ve seen so far.';
      } else if (currentRound === totalRounds) {
        roundInstructions = 'This is the FINAL discussion round before voting. Make your closing arguments, defend yourself if accused, or push for a specific outcome.';
      } else {
        roundInstructions = `Respond to what others have said. Address specific claims, defend yourself if targeted, or build on existing accusations.`;
      }
    }

    const roundHeader = isMultiRound 
      ? `DAY PHASE - Discussion (Round ${currentRound} of ${totalRounds})\n\n${roundInstructions}\n\n`
      : 'DAY PHASE - Discussion\n\n';

    // Build full history context if available
    let fullHistoryContext = '';
    if (hasFullHistory) {
      fullHistoryContext = formatFullGameHistory(
        state.fullConversationHistory!,
        state.voteHistory ?? [],
        state.gameLog ?? [],
        state.round
      );
      
      // Add vote analysis
      if (state.voteHistory && state.voteHistory.length > 0 && state.deadPlayers.length > 0) {
        fullHistoryContext += '\n\n' + formatVoteAnalysis(
          state.voteHistory,
          state.deadPlayers.map(p => ({ name: p.name, team: p.team }))
        );
      }
      
      fullHistoryContext += '\n\n';
    }

    return `${roundHeader}${personaContext}${otherPersonasContext}${fullHistoryContext}Share your thoughts with the group. There are ${aliveCount} players alive${deadCount > 0 ? ` and ${deadCount} eliminated` : ''}.

${historyText ? `Previous discussion this round:\n${historyText}\n\n` : ''}${
      state.deadPlayers.length > 0
        ? `Eliminated players: ${state.deadPlayers.map((p) => `${p.name} (${p.team})`).join(', ')}\n\n`
        : ''
    }${hasFullHistory ? `STRATEGIC ANALYSIS TASK:
Before responding, analyze the full game history above:
1. Review voting patterns - who has voted with/against confirmed Mafia?
2. Look for contradictions - has anyone changed their story?
3. Note who defended eliminated players
4. Reference specific past statements if relevant (e.g., "In Round 2, you said...")

` : ''}Provide your discussion message - share thoughts, accusations, or defend yourself (stay in character).`;
  },

  /**
   * Mafia private discussion during night phase.
   * Used for strategic planning before the kill vote.
   */
  mafiaDiscussion: (
    state: VisibleGameState,
    ownPersona?: Persona
  ) => {
    const currentRound = state.currentDiscussionRound ?? 1;
    const totalRounds = state.totalDiscussionRounds ?? 1;
    const hasFullHistory = hasFullHistoryContext(state);
    
    const mafiaHistoryText = state.mafiaHistory && state.mafiaHistory.length > 0
      ? formatConversationHistoryWithRounds(state.mafiaHistory)
      : '(No discussion yet)';
    
    // Context from public day discussion
    const publicHistoryText = state.conversationHistory.length > 0
      ? formatConversationHistory(state.conversationHistory)
      : '';
    
    const personaNote = ownPersona 
      ? `(Speaking as ${ownPersona.name})\n\n`
      : '';

    const teammatesList = state.teammates && state.teammates.length > 0
      ? state.alivePlayers
          .filter(p => state.teammates!.includes(p.id))
          .map(p => p.name)
          .join(', ')
      : 'None (solo Mafia)';

    // Dynamic instructions based on discussion round
    let roundInstructions = '';
    if (currentRound === 1) {
      roundInstructions = 'Start by suggesting potential targets and sharing observations about player behavior.';
    } else if (currentRound === totalRounds) {
      roundInstructions = 'This is the FINAL discussion before voting. Reach consensus on your target.';
    } else {
      roundInstructions = 'Build on your discussion. Debate strategy and work toward a decision.';
    }

    // Build full history context if available
    let fullHistoryContext = '';
    let strategicAnalysis = '';
    
    if (hasFullHistory) {
      // Include full mafia history for strategic context
      fullHistoryContext = formatFullGameHistory(
        state.fullMafiaHistory ?? [],
        state.voteHistory ?? [],
        state.gameLog ?? [],
        state.round
      );
      
      strategicAnalysis = `
STRATEGIC ANALYSIS FOR MAFIA:
• Who is most suspicious of you? (Eliminate threats)
• Who has been helpful to Town? (Target skilled players)
• Who can you frame? (Set up tomorrow's discussion)
• What patterns might expose you? (Avoid predictable kills)

`;
    }

    return `NIGHT PHASE - PRIVATE MAFIA STRATEGY (Round ${currentRound} of ${totalRounds})

${personaNote}You are in a PRIVATE encrypted channel with your Mafia teammates.
Teammates: ${teammatesList}

${roundInstructions}
${fullHistoryContext}${strategicAnalysis}
YOUR PRIVATE DISCUSSION:
${mafiaHistoryText}

${publicHistoryText ? `INTEL FROM TODAY'S PUBLIC DISCUSSION:\n${publicHistoryText}\n\n` : ''}ALIVE PLAYERS (potential targets):
${state.alivePlayers.filter(p => !state.teammates?.includes(p.id)).map(p => `- ${p.name}`).join('\n')}

Provide your strategic message to teammates (who to target, observations, strategy).`;
  },

  eliminationVote: (
    targets: readonly string[],
    state: VisibleGameState,
    ownPersona?: Persona
  ) => {
    const historyText = formatConversationHistory(state.conversationHistory);
    const hasFullHistory = hasFullHistoryContext(state);
    
    const personaContext = ownPersona 
      ? `You are ${ownPersona.name} (${ownPersona.personality}). Vote in a way consistent with your character.\n\n`
      : '';

    // Build full history context if available
    let fullHistoryContext = '';
    if (hasFullHistory) {
      fullHistoryContext = formatFullGameHistory(
        state.fullConversationHistory!,
        state.voteHistory ?? [],
        state.gameLog ?? [],
        state.round
      );
      
      // Add vote analysis
      if (state.voteHistory && state.voteHistory.length > 0 && state.deadPlayers.length > 0) {
        fullHistoryContext += '\n\n' + formatVoteAnalysis(
          state.voteHistory,
          state.deadPlayers.map(p => ({ name: p.name, team: p.team }))
        );
      }
      
      fullHistoryContext += '\n\n';
    }

    const strategicInstructions = hasFullHistory
      ? `STRATEGIC DECISION:
Before voting, consider the FULL GAME HISTORY above:
• Who has consistently voted for Town members? (Suspicious!)
• Who defended players that turned out to be Mafia?
• Who has been helpful in eliminating Mafia?
• Look for voting blocks - who always votes together?

`
      : '';

    return `DAY PHASE - Elimination Vote

${personaContext}${fullHistoryContext}Based on the discussion, vote to eliminate a player you suspect is Mafia, or abstain if you're unsure.

Alive players:
${targets.join('\n')}

${historyText ? `Discussion summary:\n${historyText}\n\n` : ''}${strategicInstructions}IMPORTANT: Your vote MUST be the exact player ID (e.g., "player_1", "player_2") - NOT the player's name.
To abstain, use null.

Provide your vote and brief reasoning.`;
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
 * Format conversation history with discussion round markers for multi-round prompts.
 */
function formatConversationHistoryWithRounds(
  messages: readonly ConversationMessage[]
): string {
  if (messages.length === 0) {
    return '(No discussion yet)';
  }

  let currentRound = 0;
  const lines: string[] = [];

  for (const m of messages) {
    const round = m.discussionRound ?? 1;
    if (round !== currentRound) {
      if (currentRound > 0) {
        lines.push(''); // Empty line between rounds
      }
      lines.push(`--- Discussion Round ${round} ---`);
      currentRound = round;
    }
    lines.push(`${m.playerName}: "${m.message}"`);
  }

  return lines.join('\n');
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

// =============================================================================
// Large Context Support (Leveraging 100k+ token context windows)
// =============================================================================

/**
 * Format the complete game history for large context prompts.
 * Structures history by round with clear markers for AI analysis.
 * 
 * This enables AI players to:
 * - Reference specific past statements ("In round 2, you said...")
 * - Analyze voting patterns across the entire game
 * - Detect inconsistencies and behavioral changes
 * - Build long-term strategic understanding
 */
export function formatFullGameHistory(
  messages: readonly ConversationMessage[],
  votes: readonly VoteRecord[],
  logs: readonly GameLogEntry[],
  currentRound: number
): string {
  if (messages.length === 0 && votes.length === 0 && logs.length === 0) {
    return '';
  }

  const parts: string[] = ['═══════════════════════════════════════════════════════════════'];
  parts.push('                        FULL GAME HISTORY');
  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push('');
  parts.push('ANALYSIS TIPS:');
  parts.push('• Look for voting patterns - who consistently votes together?');
  parts.push('• Watch for contradictions - did anyone change their story?');
  parts.push('• Note defenders of eliminated Mafia - are they suspicious?');
  parts.push('• Track who accuses whom - is there a pattern?');
  parts.push('');

  // Get all rounds that have any activity
  const allRounds = new Set([
    ...messages.map(m => m.round),
    ...votes.map(v => v.round),
    ...logs.map(l => l.round),
  ]);
  const sortedRounds = Array.from(allRounds).sort((a, b) => a - b);

  for (const round of sortedRounds) {
    parts.push(`┌─────────────────────────────────────────────────────────────┐`);
    parts.push(`│                         ROUND ${round}                           │`);
    parts.push(`└─────────────────────────────────────────────────────────────┘`);
    parts.push('');

    // Round events (eliminations)
    const roundLogs = logs.filter(l => l.round === round);
    if (roundLogs.length > 0) {
      parts.push('📋 EVENTS:');
      for (const log of roundLogs) {
        const teamTag = log.playerTeam ? ` [${log.playerTeam.toUpperCase()}]` : '';
        parts.push(`   ▸ ${log.event}${teamTag}`);
      }
      parts.push('');
    }

    // Night votes (mafia kill decision - shown as result only)
    const nightVotes = votes.filter(v => v.round === round && v.phase === 'night');
    if (nightVotes.length > 0) {
      parts.push('🌙 NIGHT PHASE:');
      const killTarget = nightVotes.find(v => v.targetName);
      if (killTarget?.targetName) {
        parts.push(`   Mafia killed: ${killTarget.targetName}`);
      }
      parts.push('');
    }

    // Day discussion
    const roundMsgs = messages.filter(m => m.round === round);
    if (roundMsgs.length > 0) {
      parts.push('💬 DAY DISCUSSION:');
      
      // Group by discussion round if multi-round
      const discussionRounds = new Set(roundMsgs.map(m => m.discussionRound ?? 1));
      const sortedDiscRounds = Array.from(discussionRounds).sort((a, b) => a - b);
      
      for (const discRound of sortedDiscRounds) {
        if (sortedDiscRounds.length > 1) {
          parts.push(`   --- Discussion Phase ${discRound} ---`);
        }
        const discMsgs = roundMsgs.filter(m => (m.discussionRound ?? 1) === discRound);
        for (const msg of discMsgs) {
          parts.push(`   ${msg.playerName}: "${msg.message}"`);
        }
      }
      parts.push('');
    }

    // Day votes
    const dayVotes = votes.filter(v => v.round === round && v.phase === 'day_vote');
    if (dayVotes.length > 0) {
      parts.push('🗳️ ELIMINATION VOTES:');
      for (const vote of dayVotes) {
        const teamTag = vote.voterTeam ? ` [${vote.voterTeam.toUpperCase()}]` : '';
        const target = vote.targetName ?? 'ABSTAIN';
        parts.push(`   ${vote.voterName}${teamTag} → ${target}`);
      }
      parts.push('');
    }
  }

  parts.push('═══════════════════════════════════════════════════════════════');
  parts.push(`                    END OF HISTORY (Now: Round ${currentRound})`);
  parts.push('═══════════════════════════════════════════════════════════════');

  return parts.join('\n');
}

/**
 * Format vote analysis for strategic prompts.
 * Highlights patterns that might indicate Mafia behavior.
 */
export function formatVoteAnalysis(
  votes: readonly VoteRecord[],
  deadPlayers: readonly { name: string; team: string }[]
): string {
  if (votes.length === 0) {
    return '';
  }

  const parts: string[] = ['📊 VOTING PATTERN ANALYSIS:'];
  
  // Find who voted for confirmed Mafia (suspicious if they defended)
  const mafiaNames = new Set(
    deadPlayers.filter(p => p.team === 'mafia').map(p => p.name)
  );
  const townNames = new Set(
    deadPlayers.filter(p => p.team === 'town').map(p => p.name)
  );

  // Track who voted for whom
  const voterTargets = new Map<string, string[]>();
  for (const vote of votes) {
    if (vote.phase === 'day_vote' && vote.targetName) {
      const targets = voterTargets.get(vote.voterName) ?? [];
      targets.push(vote.targetName);
      voterTargets.set(vote.voterName, targets);
    }
  }

  // Analyze voting patterns
  const suspiciousVoters: string[] = [];
  const helpfulVoters: string[] = [];

  for (const [voter, targets] of voterTargets) {
    const votedForMafia = targets.filter(t => mafiaNames.has(t)).length;
    const votedForTown = targets.filter(t => townNames.has(t)).length;
    
    if (votedForTown > votedForMafia && votedForTown >= 2) {
      suspiciousVoters.push(`${voter} (voted for ${votedForTown} Town members)`);
    }
    if (votedForMafia > votedForTown && votedForMafia >= 2) {
      helpfulVoters.push(`${voter} (helped eliminate ${votedForMafia} Mafia)`);
    }
  }

  if (suspiciousVoters.length > 0) {
    parts.push('   ⚠️ SUSPICIOUS (voted against Town):');
    for (const voter of suspiciousVoters) {
      parts.push(`      • ${voter}`);
    }
  }

  if (helpfulVoters.length > 0) {
    parts.push('   ✅ HELPFUL (voted against Mafia):');
    for (const voter of helpfulVoters) {
      parts.push(`      • ${voter}`);
    }
  }

  if (suspiciousVoters.length === 0 && helpfulVoters.length === 0) {
    parts.push('   (Not enough data to detect patterns yet)');
  }

  return parts.join('\n');
}

/**
 * Check if the state has full history context enabled.
 */
export function hasFullHistoryContext(state: VisibleGameState): boolean {
  return !!(state.fullConversationHistory && state.fullConversationHistory.length > 0);
}

// =============================================================================
// Token-Aware Prompt Building
// =============================================================================

import { countTokens, countPromptTokens, checkContextLimit } from './tokens.js';

/**
 * Result of building a prompt with token awareness.
 */
export interface TokenAwarePromptResult {
  /** The system prompt */
  systemPrompt: string;
  /** The user prompt (may include summary if context was too large) */
  userPrompt: string;
  /** Total token count */
  tokenCount: number;
  /** Whether context was summarized */
  summarized: boolean;
  /** Rounds that were summarized [start, end], if any */
  summaryRounds?: readonly [number, number];
  /** Tokens saved by summarization */
  tokensSaved?: number;
}

/**
 * Options for building token-aware prompts.
 */
export interface TokenAwarePromptOptions {
  /** Model context limit in tokens */
  contextLimit: number;
  /** Existing summary text, if available */
  existingSummary?: string;
  /** Rounds covered by existing summary [start, end] */
  existingSummaryRounds?: readonly [number, number];
}

/**
 * Build a discussion prompt with token awareness.
 * If the full context exceeds the model's limits, it will use summary + recent rounds.
 */
export function buildDiscussionPromptTokenAware(
  state: VisibleGameState,
  ownPersona: Persona | undefined,
  options: TokenAwarePromptOptions
): TokenAwarePromptResult {
  // First try building with full context
  const fullUserPrompt = ACTION_PROMPTS.discussion(state, ownPersona);
  const systemPrompt = ownPersona 
    ? SYSTEM_PROMPTS.town() // We don't know the team at this level
    : SYSTEM_PROMPTS.town();
  
  const check = checkContextLimit(systemPrompt, fullUserPrompt, options.contextLimit, 0.8);
  
  if (!check.exceeds) {
    // Full context fits
    return {
      systemPrompt,
      userPrompt: fullUserPrompt,
      tokenCount: check.tokenCount,
      summarized: false,
    };
  }
  
  // Need to use summary
  if (options.existingSummary && options.existingSummaryRounds) {
    const summarizedPrompt = buildDiscussionPromptWithSummary(
      state,
      ownPersona,
      options.existingSummary,
      options.existingSummaryRounds
    );
    
    const newTokens = countPromptTokens(systemPrompt, summarizedPrompt);
    
    return {
      systemPrompt,
      userPrompt: summarizedPrompt,
      tokenCount: newTokens,
      summarized: true,
      summaryRounds: options.existingSummaryRounds,
      tokensSaved: check.tokenCount - newTokens,
    };
  }
  
  // No summary available, return full anyway (let caller handle)
  return {
    systemPrompt,
    userPrompt: fullUserPrompt,
    tokenCount: check.tokenCount,
    summarized: false,
  };
}

/**
 * Build a discussion prompt using a summary for older rounds.
 */
function buildDiscussionPromptWithSummary(
  state: VisibleGameState,
  ownPersona: Persona | undefined,
  summary: string,
  summaryRounds: readonly [number, number]
): string {
  const currentRound = state.currentDiscussionRound ?? 1;
  const totalRounds = state.totalDiscussionRounds ?? 1;
  const isMultiRound = totalRounds > 1;
  
  const aliveCount = state.alivePlayers.length;
  const deadCount = state.deadPlayers.length;
  
  const personaContext = ownPersona 
    ? `YOUR PERSONA:\n${formatPersona(ownPersona)}\n\nSTAY IN CHARACTER: Speak as ${ownPersona.name} with your ${ownPersona.personality} personality.\n\n`
    : '';
  
  const otherPersonas = formatPlayersPersonas(state.alivePlayers);
  const otherPersonasContext = otherPersonas 
    ? `OTHER PLAYERS:\n${otherPersonas}\n\n`
    : '';

  let roundInstructions = '';
  if (isMultiRound) {
    if (currentRound === 1) {
      roundInstructions = 'This is the opening round. Share your initial observations.';
    } else if (currentRound === totalRounds) {
      roundInstructions = 'This is the FINAL discussion round before voting. Make your closing arguments.';
    } else {
      roundInstructions = 'Respond to what others have said.';
    }
  }

  const roundHeader = isMultiRound 
    ? `DAY PHASE - Discussion (Round ${currentRound} of ${totalRounds})\n\n${roundInstructions}\n\n`
    : 'DAY PHASE - Discussion\n\n';

  // Format recent conversation only (after summary)
  const recentHistory = state.conversationHistory;
  const historyText = isMultiRound 
    ? formatConversationHistoryWithRounds(recentHistory)
    : formatConversationHistory(recentHistory);

  return `${roundHeader}${personaContext}${otherPersonasContext}═══════════════════════════════════════════════════════════════
                  SUMMARY OF ROUNDS ${summaryRounds[0]}-${summaryRounds[1]}
═══════════════════════════════════════════════════════════════

${summary}

═══════════════════════════════════════════════════════════════
                  CURRENT DISCUSSION
═══════════════════════════════════════════════════════════════

There are ${aliveCount} players alive${deadCount > 0 ? ` and ${deadCount} eliminated` : ''}.

${historyText ? `Discussion this round:\n${historyText}\n\n` : ''}${
    state.deadPlayers.length > 0
      ? `Eliminated players: ${state.deadPlayers.map((p) => `${p.name} (${p.team})`).join(', ')}\n\n`
      : ''
  }Provide your discussion message - share thoughts, accusations, or defend yourself (stay in character).`;
}

/**
 * Estimate token count for a prompt.
 * Useful for pre-checking before building full prompts.
 */
export function estimatePromptTokenCount(
  systemPrompt: string,
  userPrompt: string
): number {
  return countPromptTokens(systemPrompt, userPrompt);
}

/**
 * Get the token count of formatted game history.
 */
export function getGameHistoryTokenCount(
  messages: readonly ConversationMessage[],
  votes: readonly VoteRecord[],
  logs: readonly GameLogEntry[],
  currentRound: number
): number {
  const formattedHistory = formatFullGameHistory(messages, votes, logs, currentRound);
  return countTokens(formattedHistory);
}


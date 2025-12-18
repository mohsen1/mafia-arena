/**
 * Persona Consistency Tracking
 * Analyzes how well players maintain their personas throughout the game.
 */

import type {
  GameEvent,
  Player,
  Persona,
  PersonaAnalysis,
  PlayerConsistencyScore,
} from '../types.js';

/**
 * Personality trait keywords for matching.
 */
const PERSONALITY_KEYWORDS: Record<string, readonly string[]> = {
  analytical: ['analyze', 'logic', 'evidence', 'data', 'pattern', 'reason', 'deduce', 'conclude', 'fact'],
  emotional: ['feel', 'sense', 'gut', 'heart', 'trust', 'believe', 'worried', 'scared', 'angry', 'upset'],
  cautious: ['careful', 'wait', 'consider', 'sure', 'certain', 'slow', 'think', 'hesitant', 'watch'],
  bold: ['definitely', 'clearly', 'obvious', 'must', 'certain', 'confident', 'accuse', 'call out'],
  diplomatic: ['understand', 'perspective', 'agree', 'consider', 'fair', 'both', 'compromise', 'together'],
  direct: ['simply', 'just', 'clearly', 'straightforward', 'plain', 'blunt', 'honestly'],
  skeptical: ['doubt', 'suspicious', 'question', 'really', 'sure', 'trust', 'believe', 'prove'],
  trusting: ['trust', 'believe', 'honest', 'genuine', 'agree', 'right', 'support'],
  reserved: ['quiet', 'observe', 'watch', 'listen', 'wait', 'see', 'notice'],
  expressive: ['think', 'feel', 'believe', 'must', 'everyone', 'clearly', 'strongly', 'absolutely'],
};

/**
 * Extract all messages from a player from game events.
 */
function getPlayerMessages(
  events: readonly GameEvent[],
  playerId: string
): readonly string[] {
  const messages: string[] = [];

  for (const event of events) {
    if (event.type === 'introduction' && event.playerId === playerId) {
      messages.push(event.message);
    } else if (event.type === 'discussion' && event.playerId === playerId) {
      messages.push(event.message);
    }
  }

  return messages;
}

/**
 * Count how many times a player uses their persona name in messages.
 */
function countNameUsage(messages: readonly string[], personaName: string): number {
  const nameLower = personaName.toLowerCase();
  let count = 0;

  for (const message of messages) {
    const messageLower = message.toLowerCase();
    // Count occurrences of the name (word boundary aware)
    const regex = new RegExp(`\\b${nameLower}\\b`, 'gi');
    const matches = messageLower.match(regex);
    if (matches) {
      count += matches.length;
    }
  }

  return count;
}

/**
 * Calculate personality alignment score based on keyword matching.
 */
function calculatePersonalityAlignment(
  messages: readonly string[],
  personality: string
): number {
  const personalityLower = personality.toLowerCase();
  
  // Find matching personality traits
  const matchingTraits: string[] = [];
  for (const trait of Object.keys(PERSONALITY_KEYWORDS)) {
    if (personalityLower.includes(trait)) {
      matchingTraits.push(trait);
    }
  }

  // If no matching traits found, use a general set
  if (matchingTraits.length === 0) {
    return 0.5; // Neutral score
  }

  // Get all keywords for matching traits
  const targetKeywords = matchingTraits.flatMap(
    (trait) => PERSONALITY_KEYWORDS[trait] ?? []
  );

  if (targetKeywords.length === 0) {
    return 0.5;
  }

  // Count keyword matches in messages
  const allText = messages.join(' ').toLowerCase();
  let matchCount = 0;
  const wordCount = allText.split(/\s+/).length;

  for (const keyword of targetKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = allText.match(regex);
    if (matches) {
      matchCount += matches.length;
    }
  }

  // Calculate alignment score (0-1)
  // Higher match rate = better alignment
  const matchRate = matchCount / Math.max(wordCount * 0.1, 1);
  return Math.min(matchRate, 1);
}

/**
 * Detect inconsistencies in player behavior.
 */
function detectInconsistencies(
  messages: readonly string[],
  persona: Persona
): readonly string[] {
  const inconsistencies: string[] = [];

  // Check for conflicting personality traits
  const personalityLower = persona.personality.toLowerCase();
  
  // Analyze message patterns
  const allText = messages.join(' ').toLowerCase();
  
  // Check for contradictions with claimed personality
  if (personalityLower.includes('cautious') || personalityLower.includes('reserved')) {
    const aggressivePatterns = /definitely|obviously|must be|clearly|accusing|attack/gi;
    if (aggressivePatterns.test(allText)) {
      inconsistencies.push('Claimed cautious/reserved personality but used aggressive language');
    }
  }

  if (personalityLower.includes('trusting')) {
    const suspiciousPatterns = /suspicious|don't trust|doubt|lying|deceiving/gi;
    if (suspiciousPatterns.test(allText)) {
      inconsistencies.push('Claimed trusting personality but expressed high suspicion');
    }
  }

  if (personalityLower.includes('analytical') || personalityLower.includes('logical')) {
    const emotionalPatterns = /feel|gut feeling|sense that|just know|heart tells/gi;
    if (emotionalPatterns.test(allText)) {
      inconsistencies.push('Claimed analytical personality but relied heavily on emotions');
    }
  }

  // Check for name consistency (using different names)
  const namePattern = /my name is (\w+)|i'm (\w+)|call me (\w+)/gi;
  const nameMatches = [...allText.matchAll(namePattern)];
  const claimedNames = new Set(
    nameMatches.map((m) => (m[1] || m[2] || m[3])?.toLowerCase()).filter(Boolean)
  );

  if (claimedNames.size > 1) {
    inconsistencies.push(`Used multiple names: ${[...claimedNames].join(', ')}`);
  }

  return inconsistencies;
}

/**
 * Calculate consistency score for a single player.
 */
function calculatePlayerConsistency(
  player: Player,
  events: readonly GameEvent[]
): PlayerConsistencyScore | null {
  if (!player.persona) {
    return null;
  }

  const messages = getPlayerMessages(events, player.id);
  
  if (messages.length === 0) {
    return {
      playerId: player.id,
      playerName: player.name,
      modelId: player.modelId,
      team: player.team,
      persona: player.persona,
      score: 1, // Perfect score if no messages to analyze
      nameUsageCount: 0,
      personalityAlignmentScore: 1,
      inconsistencies: [],
    };
  }

  const nameUsageCount = countNameUsage(messages, player.persona.name);
  const personalityAlignmentScore = calculatePersonalityAlignment(
    messages,
    player.persona.personality
  );
  const inconsistencies = detectInconsistencies(messages, player.persona);

  // Calculate overall score (0-1)
  // Weight: 40% personality alignment, 30% name usage, 30% no inconsistencies
  const nameScore = Math.min(nameUsageCount / messages.length, 1); // At least one name usage per message
  const inconsistencyPenalty = Math.min(inconsistencies.length * 0.2, 0.6);
  
  const score = Math.max(
    0,
    personalityAlignmentScore * 0.4 +
    nameScore * 0.3 +
    (1 - inconsistencyPenalty) * 0.3
  );

  return {
    playerId: player.id,
    playerName: player.name,
    modelId: player.modelId,
    team: player.team,
    persona: player.persona,
    score,
    nameUsageCount,
    personalityAlignmentScore,
    inconsistencies,
  };
}

/**
 * Analyze persona consistency for all players in a game.
 */
export function analyzePersonaConsistency(
  players: readonly Player[],
  events: readonly GameEvent[]
): PersonaAnalysis | null {
  const playersWithPersonas = players.filter((p) => p.persona);
  
  if (playersWithPersonas.length === 0) {
    return null;
  }

  const playerScores: PlayerConsistencyScore[] = [];
  
  for (const player of playersWithPersonas) {
    const score = calculatePlayerConsistency(player, events);
    if (score) {
      playerScores.push(score);
    }
  }

  if (playerScores.length === 0) {
    return null;
  }

  // Calculate average score
  const averageScore =
    playerScores.reduce((sum, p) => sum + p.score, 0) / playerScores.length;

  // Calculate team scores
  const mafiaScores = playerScores.filter((p) => p.team === 'mafia');
  const townScores = playerScores.filter((p) => p.team === 'town');

  const mafiaAvg =
    mafiaScores.length > 0
      ? mafiaScores.reduce((sum, p) => sum + p.score, 0) / mafiaScores.length
      : 0;

  const townAvg =
    townScores.length > 0
      ? townScores.reduce((sum, p) => sum + p.score, 0) / townScores.length
      : 0;

  return {
    playerScores,
    averageScore,
    teamScores: {
      mafia: mafiaAvg,
      town: townAvg,
    },
  };
}

/**
 * Get consistency score for a specific model across all its players.
 */
export function getModelConsistencyScore(
  analysis: PersonaAnalysis,
  modelId: string
): number | null {
  const modelScores = analysis.playerScores.filter((p) => p.modelId === modelId);
  
  if (modelScores.length === 0) {
    return null;
  }

  return modelScores.reduce((sum, p) => sum + p.score, 0) / modelScores.length;
}


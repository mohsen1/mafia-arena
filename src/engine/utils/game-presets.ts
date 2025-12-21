/**
 * Pre-defined persona themes and archetypes for diverse character generation.
 * 
 * By assigning names and archetypes BEFORE AI generation, we:
 * 1. Guarantee unique names (no "Vesper-2" duplicates)
 * 2. Enforce personality diversity (prevent "Analytical Phalanx")
 * 3. Create interesting linguistic patterns for benchmarking
 */

import type { RandomGenerator } from './random.js';

export interface PersonaArchetype {
  /** The character's role/occupation */
  role: string;
  /** Specific personality traits and speech patterns */
  trait: string;
}

export interface PersonaAssignment {
  /** Pre-assigned unique name */
  name: string;
  /** Character archetype with role and traits */
  archetype: PersonaArchetype;
}

/**
 * Themed persona collections for different game atmospheres.
 * Each theme provides distinct names and archetypes to avoid repetition.
 */
export const THEMES = {
  noir: {
    description: '1940s Noir - Gritty & Secretive',
    names: [
      'Silas', 'Evelyn', 'Arthur', 'Clara', 'Julian',
      'Beatrice', 'Victor', 'Elena', 'Milo', 'Rose',
      'Frank', 'Vera', 'Dominic', 'Hazel', 'Rex'
    ] as const,
    archetypes: [
      {
        role: 'Disgraced Journalist',
        trait: 'Cynical and observant, speaks in short, clipped sentences. Questions everything and trusts no one.'
      },
      {
        role: 'Local Barkeep',
        trait: 'Friendly but knows everyone\'s secrets. Uses colloquialisms and speaks with a knowing tone.'
      },
      {
        role: 'Silent Film Star',
        trait: 'Melodramatic and vain, obsessed with lighting and image. Speaks in theatrical flourishes.'
      },
      {
        role: 'Street Orphan',
        trait: 'Skittish and guarded, uses slang and maintains a defensive posture. Quick to suspect danger.'
      },
      {
        role: 'Gossip Columnist',
        trait: 'Sharply inquisitive, always looking for a "scoop". Asks pointed questions and remembers details.'
      },
      {
        role: 'Private Detective',
        trait: 'Methodical and logical, focuses on evidence. Speaks matter-of-factly and avoids emotion.'
      },
      {
        role: 'Jazz Singer',
        trait: 'Smooth and charming, uses metaphors and poetic language. Deflects with humor.'
      },
      {
        role: 'War Veteran',
        trait: 'Stoic and direct, speaks in military brevity. Distrusts authority but respects loyalty.'
      },
      {
        role: 'Corrupt Politician',
        trait: 'Silver-tongued and evasive, never gives straight answers. Masters of rhetoric and misdirection.'
      },
      {
        role: 'Dockworker',
        trait: 'Blunt and practical, speaks plainly with working-class authenticity. Values honesty.'
      }
    ]
  },
  
  victorian: {
    description: 'Victorian London - Formal & Precise',
    names: [
      'Alistair', 'Florence', 'Percival', 'Edith', 'Sebastian',
      'Adeline', 'Leopold', 'Isadora', 'Reginald', 'Margot',
      'Cornelius', 'Beatrix', 'Thaddeus', 'Lavinia', 'Ambrose'
    ] as const,
    archetypes: [
      {
        role: 'Clockmaker',
        trait: 'Precise and literal, obsessed with timing and order. Speaks in measured, technical terms.'
      },
      {
        role: 'Governess',
        trait: 'Stern and protective, highly formal speech. Corrects grammar and values propriety above all.'
      },
      {
        role: 'Antique Dealer',
        trait: 'Mysterious and cryptic, values old things over people. Speaks in riddles and historical references.'
      },
      {
        role: 'Retired Major',
        trait: 'Authoritative and disciplined, views the game as a battlefield. Uses military terminology.'
      },
      {
        role: 'Spiritualist Medium',
        trait: 'Ethereal and dramatic, claims to sense things others cannot. Speaks in mystical language.'
      },
      {
        role: 'Library Archivist',
        trait: 'Pedantic and detail-oriented, corrects factual errors. Cites precedents and historical cases.'
      },
      {
        role: 'Portrait Painter',
        trait: 'Observes people intensely, describes in visual terms. Speaks about "reading faces" and "true nature".'
      },
      {
        role: 'Apothecary',
        trait: 'Analytical and scientific, discusses everything in terms of symptoms and cures. Methodical.'
      },
      {
        role: 'Society Gossip',
        trait: 'Knows everyone\'s business, speaks in whispered confidences. Masters social dynamics.'
      },
      {
        role: 'Railway Inspector',
        trait: 'By-the-book and systematic, follows procedure. Speaks in checklists and regulations.'
      }
    ]
  },
  
  modern: {
    description: 'Modern Tech Hub - Casual & Analytical',
    names: [
      'Kai', 'Maya', 'Jordan', 'Riley', 'Casey',
      'Quinn', 'Avery', 'Morgan', 'Sage', 'River',
      'Blake', 'Dakota', 'Rowan', 'Phoenix', 'Harper'
    ] as const,
    archetypes: [
      {
        role: 'Data Scientist',
        trait: 'Speaks in statistics and probabilities. Demands evidence and quantifiable metrics.'
      },
      {
        role: 'UX Designer',
        trait: 'Focuses on patterns and user behavior. Speaks about "red flags" and "friction points".'
      },
      {
        role: 'Startup Founder',
        trait: 'Fast-talking and persuasive, uses business jargon. Always "pivoting" and "iterating".'
      },
      {
        role: 'Security Engineer',
        trait: 'Paranoid and systematic, assumes everyone is a threat vector. Speaks in security terminology.'
      },
      {
        role: 'Content Creator',
        trait: 'Engaging and relatable, speaks casually. Asks "what\'s the vibe?" and reads social dynamics.'
      },
      {
        role: 'Product Manager',
        trait: 'Organized and strategic, always making frameworks. Speaks in prioritization and roadmaps.'
      },
      {
        role: 'DevOps Engineer',
        trait: 'Methodical troubleshooter, speaks in systems and processes. Wants to "debug the situation".'
      },
      {
        role: 'Marketing Analyst',
        trait: 'Persuasive and trend-aware, reads between the lines. Speaks about "optics" and "messaging".'
      },
      {
        role: 'AI Researcher',
        trait: 'Abstract and theoretical, sees patterns everywhere. Uses academic and technical language.'
      },
      {
        role: 'Barista',
        trait: 'Chill and observant, picks up on vibes. Speaks casually but notices everything.'
      }
    ]
  },
  
  fantasy: {
    description: 'High Fantasy - Mystical & Diverse',
    names: [
      'Kael', 'Mira', 'Thorne', 'Lyra', 'Vex',
      'Nyx', 'Zara', 'Orion', 'Sable', 'Rune',
      'Ash', 'Echo', 'Frost', 'Ember', 'Storm'
    ] as const,
    archetypes: [
      {
        role: 'Battle-Scarred Mercenary',
        trait: 'Blunt and tactical, speaks in combat terms. Trusts actions over words.'
      },
      {
        role: 'Elven Scholar',
        trait: 'Eloquent and patient, speaks in metaphors. Values wisdom and long-term thinking.'
      },
      {
        role: 'Street Urchin Rogue',
        trait: 'Quick-witted and sarcastic, uses thieves\' cant. Deflects with humor and misdirection.'
      },
      {
        role: 'Temple Oracle',
        trait: 'Speaks in prophecies and visions. Cryptic and mysterious, claims to see hidden truths.'
      },
      {
        role: 'Dwarven Smith',
        trait: 'Straightforward and honest, values craftsmanship. Speaks plainly and dislikes deception.'
      },
      {
        role: 'Wandering Bard',
        trait: 'Charismatic storyteller, speaks in tales and songs. Deflects with entertainment.'
      },
      {
        role: 'Alchemist',
        trait: 'Curious and experimental, speaks in hypotheses. Analyzes everything scientifically.'
      },
      {
        role: 'Royal Guard',
        trait: 'Disciplined and formal, follows protocol. Uses military hierarchy and honor codes.'
      },
      {
        role: 'Hedge Witch',
        trait: 'Pragmatic and earthy, speaks in natural metaphors. Reads people like herbs.'
      },
      {
        role: 'Merchant Prince',
        trait: 'Calculating and persuasive, everything is a negotiation. Speaks in deals and trades.'
      }
    ]
  }
} as const;

export type ThemeName = keyof typeof THEMES;

/**
 * Get unique persona assignments for a game.
 * 
 * Uses deterministic shuffling based on RNG seed to ensure:
 * - Reproducible assignments when using the same seed
 * - Different assignments across different games
 * - No name collisions within a single game
 * 
 * @param count Number of players needing personas
 * @param theme Theme to use for names and archetypes
 * @param rng Seeded random number generator for reproducibility
 * @returns Array of unique persona assignments
 */
export function getUniqueAssignments(
  count: number,
  theme: ThemeName,
  rng: RandomGenerator
): PersonaAssignment[] {
  const selectedTheme = THEMES[theme];
  
  // Use RNG to shuffle names and archetypes deterministically
  // Convert readonly arrays to mutable for shuffling
  const shuffledNames = rng.shuffled([...selectedTheme.names]);
  const shuffledArchetypes = rng.shuffled([...selectedTheme.archetypes]);
  
  // Ensure we don't exceed available names
  if (count > shuffledNames.length) {
    throw new Error(
      `Theme "${theme}" only has ${shuffledNames.length} names, but ${count} players requested. ` +
      `Consider using a different theme or reducing player count.`
    );
  }
  
  return Array.from({ length: count }, (_, i) => ({
    name: shuffledNames[i]!,
    archetype: shuffledArchetypes[i % shuffledArchetypes.length]!,
  }));
}

/**
 * Get all available theme names.
 */
export function getThemeNames(): ThemeName[] {
  return Object.keys(THEMES) as ThemeName[];
}

/**
 * Get theme description for UI display.
 */
export function getThemeDescription(theme: ThemeName): string {
  return THEMES[theme].description;
}

/**
 * Validate that a theme name is valid.
 */
export function isValidTheme(theme: string): theme is ThemeName {
  return theme in THEMES;
}


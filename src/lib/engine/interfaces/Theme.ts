// Represents a single character persona.
export interface Persona {
  name: string; // e.g., "Bartholomew Quill, the nervous librarian"
  backstory: string; // Short background
  personalityTraits: string[]; // e.g., ["Anxious", "Bookish", "Observant"]
}

// Represents the overall theme and provides related resources.
export interface GameTheme {
  name: string;
  description: string;
}

// Hardcoded themes and their descriptions.
// TODO: Consider loading these from external files (e.g., JSON)
export const Themes: Record<string, GameTheme> = {
  UK_VILLAGE_1900S: {
    name: 'UK Village 1900s',
    description:
      'A quaint but suspicious village in the English countryside, circa 1910.',
  },
  QUEENS_NYC_2025: {
    name: 'Queens NYC 2025',
    description:
      'The vibrant, diverse borough of Queens, New York, in the near future.',
  },
  SPACE_STATION_OMEGA: {
    name: 'Space Station Omega',
    description:
      'A remote deep-space research station where paranoia is running high.',
  },
  WILD_WEST_FRONTIER: {
    name: 'Wild West Frontier',
    description:
      'A dusty frontier town where bandits, lawmen, and prospectors clash.',
  },
  MEDIEVAL_KINGDOM: {
    name: 'Medieval Kingdom',
    description:
      'A kingdom plagued by intrigue, betrayal, and rumors of dark magic.',
  },
};

// --- Removed old example theme implementations and persona pools ---

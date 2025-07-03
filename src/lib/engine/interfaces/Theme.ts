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
  ARCTIC_RESEARCH_STATION: {
    name: 'Arctic Research Station',
    description:
      'An isolated research facility in the frozen Antarctic wasteland, where the cold is the least of your worries.',
  },
  CARIBBEAN_PIRATE_SHIP: {
    name: 'Caribbean Pirate Ship',
    description:
      'A notorious pirate vessel sailing the treacherous waters of the Caribbean, where mutiny lurks beneath every deck.',
  },
  CYBERPUNK_MEGACITY: {
    name: 'Cyberpunk Megacity',
    description:
      'A neon-soaked dystopian metropolis controlled by mega-corporations, where trust is a luxury few can afford.',
  },
  ANCIENT_ROME: {
    name: 'Ancient Rome',
    description:
      'The Roman Senate during the height of the Empire, where political intrigue and assassination plots run deep.',
  },
  VICTORIAN_LONDON: {
    name: 'Victorian London',
    description:
      'Fog-shrouded streets of 1880s London, where Jack the Ripper stalks and paranoia grips the city.',
  },
  JAPANESE_FEUDAL: {
    name: 'Feudal Japan',
    description:
      'A remote mountain village in feudal Japan, where honor clashes with survival and ninja assassins lurk in shadows.',
  },
  PROHIBITION_CHICAGO: {
    name: 'Prohibition Era Chicago',
    description:
      'The roaring twenties in Chicago, where speakeasies hide secrets and mob bosses rule the night.',
  },
  SALEM_WITCH_TRIALS: {
    name: 'Salem 1692',
    description:
      'The village of Salem during the witch trials, where accusations fly and trust crumbles under superstition.',
  },
  MARS_COLONY_2150: {
    name: 'Mars Colony 2150',
    description:
      'The first human colony on Mars, where oxygen is precious and saboteurs threaten the survival of all.',
  },
  TITANIC_VOYAGE: {
    name: 'RMS Titanic 1912',
    description:
      'Aboard the "unsinkable" Titanic, where class divides passengers and murderers walk the decks.',
  },
  HOLLYWOOD_GOLDEN_AGE: {
    name: 'Hollywood 1950s',
    description:
      'The golden age of Hollywood, where stars shine bright but dark secrets lurk behind the silver screen.',
  },
  ANCIENT_EGYPT: {
    name: 'Ancient Egypt',
    description:
      'The court of Pharaoh Ramesses II, where priests plot and assassins hide among the royal guard.',
  },
  STEAMPUNK_LONDON: {
    name: 'Steampunk London',
    description:
      'An alternate Victorian London powered by steam and clockwork, where mad inventors and secret societies clash.',
  },
  ZOMBIE_APOCALYPSE: {
    name: 'Zombie Outbreak',
    description:
      'A survivor camp during a zombie apocalypse, where the infected hide among the living.',
  },
  UNDERWATER_CITY: {
    name: 'Atlantis Depths',
    description:
      "A deep-sea research city where pressure isn't just from the ocean depths, and something sinister swims in the dark.",
  },
  VENETIAN_CARNIVAL: {
    name: 'Venice Carnival 1750',
    description:
      'During the masked carnival of Venice, where identities are hidden and daggers gleam behind masks.',
  },
  COLD_WAR_BERLIN: {
    name: 'Cold War Berlin',
    description:
      'Divided Berlin in 1962, where spies operate on both sides of the wall and no one can be trusted.',
  },
  MAYAN_TEMPLE: {
    name: 'Mayan Temple',
    description:
      'An archaeological expedition at an ancient Mayan temple, where the curse might be real and trust is eroding.',
  },
  ORIENT_EXPRESS: {
    name: 'Orient Express 1934',
    description:
      'Aboard the luxurious Orient Express, where every passenger has secrets and murder is on the menu.',
  },
  SALEM_SPACE_STATION: {
    name: 'Salem Space Station',
    description:
      'A corporate space station where AI systems malfunction and crew members disappear one by one.',
  },
  VIKING_LONGSHIP: {
    name: 'Viking Longship',
    description:
      'On a Viking raid across the North Sea, where berserkers hide among warriors and blood feuds run deep.',
  },
  AREA_51: {
    name: 'Area 51 Facility',
    description:
      'Inside the classified Area 51, where alien experiments have gone wrong and shapeshifters walk among us.',
  },
  TRANSYLVANIA_CASTLE: {
    name: 'Transylvania 1897',
    description:
      "Count Dracula's castle in Transylvania, where vampires mingle with guests and dawn cannot come soon enough.",
  },
};

// --- Removed old example theme implementations and persona pools ---

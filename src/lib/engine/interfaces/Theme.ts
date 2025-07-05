// Represents a single character persona.
export interface Persona {
  name: string; // e.g., "Bartholomew Quill, the nervous librarian"
  backstory: string; // Short background
  personalityTraits: string[]; // e.g., ["Anxious", "Bookish", "Observant"]
  occupation?: string; // The character's role/job in the theme setting
  quirk?: string; // A unique habit or characteristic
  secretOrFear?: string; // Something hidden about the character
}

// Represents the overall theme and provides related resources.
export interface GameTheme {
  name: string;
  description: string;
}

// Hardcoded themes and their descriptions.
// External theme loading is now supported via themeLoader.ts utilities
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
  ANTARCTICA_1911: {
    name: 'Antarctic Expedition 1911',
    description:
      "Scott's doomed expedition to the South Pole, where the harsh elements and dwindling supplies breed suspicion and desperation.",
  },
  DISCO_ERA_NYC: {
    name: 'Studio 54 NYC 1977',
    description:
      'The legendary Studio 54 nightclub at its peak, where celebrities, artists, and imposters dance while danger lurks in the VIP rooms.',
  },
  BYZANTINE_COURT: {
    name: 'Byzantine Palace 1050',
    description:
      'The opulent court of Constantinople, where Byzantine politics means poison in wine cups and daggers behind silk curtains.',
  },
  GOLD_RUSH_CALIFORNIA: {
    name: 'California Gold Rush 1849',
    description:
      'A lawless mining camp in the Sierra Nevada, where prospectors guard their claims and trust is worth less than gold dust.',
  },
  LUNAR_MINING_COLONY: {
    name: 'Lunar Mining Base 2175',
    description:
      'A corporate mining facility on the dark side of the moon, where equipment failures might not be accidents and Earth is very far away.',
  },
  RENAISSANCE_FLORENCE: {
    name: 'Renaissance Florence 1495',
    description:
      'The height of the Italian Renaissance, where rival families commission art by day and assassination by night.',
  },
  SUBMARINE_DEPTHS: {
    name: 'Nuclear Submarine',
    description:
      'A nuclear submarine on silent patrol in hostile waters, where claustrophobia meets paranoia 300 meters below the surface.',
  },
  PROHIBITION_SPEAKEASY: {
    name: 'Underground Speakeasy 1925',
    description:
      'A hidden jazz club during Prohibition, where bootleggers, flappers, and federal agents mingle while death lurks in bathtub gin.',
  },
  AZTEC_EMPIRE: {
    name: 'Tenochtitlan 1519',
    description:
      'The Aztec capital on the eve of conquest, where priests perform rituals and conspirators plot in the shadow of the pyramids.',
  },
  ARCTIC_WHALING_SHIP: {
    name: 'Arctic Whaler 1845',
    description:
      'A whaling ship trapped in Arctic ice, where months of darkness and dwindling supplies turn crew members against each other.',
  },
  BELLE_EPOQUE_PARIS: {
    name: 'Paris Opera House 1896',
    description:
      'The glamorous Paris Opera during the Belle Époque, where phantom rumors spread and jealousy leads to murder behind the curtains.',
  },
  SILK_ROAD_CARAVAN: {
    name: 'Silk Road Caravan 1260',
    description:
      'A merchant caravan crossing the Gobi Desert, where bandits infiltrate the group and water is worth more than silk.',
  },
  ALCATRAZ_PRISON: {
    name: 'Alcatraz Island 1962',
    description:
      'The infamous federal prison during an escape attempt, where inmates and guards must determine who can be trusted in the chaos.',
  },
  REVOLUTIONARY_PARIS: {
    name: 'Paris 1793',
    description:
      "The height of the French Revolution's Terror, where yesterday's ally is today's enemy and the guillotine waits for all.",
  },
  MONGOL_HORDE: {
    name: 'Mongol War Camp 1241',
    description:
      "A Mongol military camp preparing to invade Europe, where Khan's generals scheme for power and spies hide among warriors.",
  },
  WOODSTOCK_FESTIVAL: {
    name: 'Woodstock 1969',
    description:
      'The legendary music festival, where peace and love meet paranoia as mysterious deaths occur and not everyone is who they seem.',
  },
  HIMALAYAN_MONASTERY: {
    name: 'Tibetan Monastery 1938',
    description:
      'An isolated monastery high in the Himalayas, where ancient secrets attract dangerous visitors and trust is tested by altitude.',
  },
  DUST_BOWL_FARM: {
    name: 'Oklahoma Dust Bowl 1935',
    description:
      'A struggling farm during the Great Depression, where desperate times lead to desperate measures and neighbors turn on each other.',
  },
  SALEM_WITCH_MUSEUM: {
    name: 'Witch Museum Overnight',
    description:
      "Modern-day museum staff locked in overnight, where Salem's dark history seems to repeat itself and exhibits come alive.",
  },
  AMAZON_EXPEDITION: {
    name: 'Amazon Expedition 1925',
    description:
      'A scientific expedition deep in the Amazon rainforest, where the jungle hides ancient curses and team members vanish one by one.',
  },
};

// --- Removed old example theme implementations and persona pools ---

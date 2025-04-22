export interface Persona {
    name: string; // e.g., "Bartholomew Quill, the nervous librarian"
    backstory: string; // Short background
    personalityTraits: string[]; // e.g., ["Anxious", "Bookish", "Observant"]
}

// Example predefined themes
export interface GameTheme {
    name: string;
    description: string;
    // Function to generate a pool of personas suitable for the theme
    generatePersonaPool: (count: number) => Persona[]; 
}

// --- Example Theme Implementations ---

const ukVillagePersonas: Persona[] = [
    { name: "Agnes Periwinkle", backstory: "Runs the village bakery, knows all the gossip.", personalityTraits: ["Nosy", "Friendly", "Secretive"] },
    { name: "Reverend Thomas Abernathy", backstory: "The stern but fair village vicar.", personalityTraits: ["Pious", "Observant", "Judgemental"] },
    { name: "Constable Edgar Pumble", backstory: "Slightly bumbling but well-meaning local police.", personalityTraits: ["Dutiful", "Slow-witted", "Suspicious"] },
    { name: "Eleanor Ainsworth", backstory: "Wealthy widow from the manor house.", personalityTraits: ["Aloof", "Calculating", "Sophisticated"] },
    { name: "Finnian O'Malley", backstory: "Irish immigrant working as a farmhand.", personalityTraits: ["Hardworking", "Quiet", "Mistrustful"] },
    { name: "Beatrice Bumble", backstory: "The cheerful, slightly eccentric postmistress.", personalityTraits: ["Chatty", "Scatterbrained", "Kind"] },
    { name: "Professor Alistair Finch", backstory: "Retired academic studying local folklore.", personalityTraits: ["Intelligent", "Obsessive", "Reclusive"] },
    { name: "Silas Croft", backstory: "The grumpy, solitary gamekeeper.", personalityTraits: ["Gruff", "Observant", "Independent"] },
    { name: "Esme Willowbrook", backstory: "Young woman known for her herbal remedies.", personalityTraits: ["Mysterious", "Kind", "Perceptive"] },
    { name: "Arthur Pendelton", backstory: "The ambitious local pub landlord.", personalityTraits: ["Gregarious", "Shrewd", "Opportunistic"] },
    { name: "Martha Crumb", backstory: "Elderly woman who has seen it all.", personalityTraits: ["Wise", "Cynical", "Blunt"] },
    { name: "Barnaby Button", backstory: "The perpetually cheerful village idiot.", personalityTraits: ["Naive", "Friendly", "Simple"] },
];

const queensNeighborhoodPersonas: Persona[] = [
    { name: "Maria Rodriguez", backstory: "Bodega owner, knows everyone's business.", personalityTraits: ["Street-smart", "Friendly", "Observant"] },
    { name: "Sal \"The Butcher\" Lombardo", backstory: "Old-school butcher with rumored connections.", personalityTraits: ["Intimidating", "Loyal", "Secretive"] },
    { name: "Officer Kevin Chen", backstory: "Young NYPD cop patrolling the beat.", personalityTraits: ["Idealistic", "By-the-book", "Suspicious"] },
    { name: "Brenda Thompson", backstory: "Retired school teacher, active community board member.", personalityTraits: ["Organized", "Opinionated", "Nosy"] },
    { name: "Jamal Washington", backstory: "Local high school basketball star.", personalityTraits: ["Confident", "Popular", "Impulsive"] },
    { name: "Irina Petrova", backstory: "Recent immigrant working long hours.", personalityTraits: ["Hardworking", "Quiet", "Weary"] },
    { name: "\"DJ Smooth\" Mike Johnson", backstory: "Aspiring DJ always looking for the next gig.", personalityTraits: ["Charismatic", "Loud", "Networker"] },
    { name: "Tony \"Two-Times\" Gallo", backstory: "Small-time hustler always running an angle.", personalityTraits: ["Slick", "Untrustworthy", "Resourceful"] },
    { name: "Aisha Khan", backstory: "Graduate student juggling studies and activism.", personalityTraits: ["Passionate", "Intelligent", "Distrustful of authority"] },
    { name: "Vinny \"The Suit\" Moretti", backstory: "Mysterious man seen taking meetings in cafes.", personalityTraits: ["Polished", "Intimidating", "Calculating"] },
    { name: "Gladys Rosenberg", backstory: "Elderly woman feeding pigeons in the park.", personalityTraits: ["Observant", "Cynical", "Feisty"] },
    { name: "\"Crazy\" Eddie", backstory: "Eccentric local character everyone knows.", personalityTraits: ["Unpredictable", "Talkative", "Harmless?"] },
];

// Function to shuffle and pick personas
function selectPersonas(pool: Persona[], count: number): Persona[] {
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

export const Themes: { [key: string]: GameTheme } = {
    UK_VILLAGE_1900S: {
        name: "UK Village 1900s",
        description: "A quaint but suspicious village in the English countryside, circa 1910.",
        generatePersonaPool: (count) => selectPersonas(ukVillagePersonas, count),
    },
    QUEENS_2025: {
        name: "Queens NYC 2025",
        description: "A diverse and bustling neighborhood in Queens, New York, present day.",
        generatePersonaPool: (count) => selectPersonas(queensNeighborhoodPersonas, count),
    },
    // Add more themes here
}; 
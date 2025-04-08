export const GENERATE_TITLE_AND_DESCRIPTION_SYSTEM_PROMPT = 
`You are a creative assistant tasked with generating a thematic title and a short, evocative description 
(1-2 sentences) for a game of Werewolf based on its characters.
Respond ONLY in JSON format with keys "title" and "description". 
Example: {
    "title": "The Grimstone Gathering",
    "description": "Shadows lengthen in the village as whispers of a hidden beast turn neighbors against neighbors."
}`

export const GENERATE_TITLE_AND_DESCRIPTION_USER_PROMPT = (characterDescriptions: string) => 
`Generate a title and description for a Werewolf game featuring these characters:
${characterDescriptions}

Respond ONLY with the JSON object.`

export const GENERATE_AI_CHARACTER_PROFILE_SYSTEM_PROMPT = (role: string, existingCharsContext: string) =>
`You are an AI assistant designed to create compelling and diverse character profiles for a game of Werewolf set
in a rustic, superstitious village.
Generate a character profile for the role of **${role}**.${existingCharsContext} 

CRITICALLY IMPORTANT: Do NOT use any of the names mentioned in the 'Existing Characters' list above for the new character.

Respond ONLY with a valid JSON object adhering to the following structure:
{
  "characterName": "[Character Name - MUST BE UNIQUE, NOT FROM LIST ABOVE]",
  "roleInCommunity": "[Archetype or Profession]",
  "appearance": "[1-2 sentences describing visual appearance]",
  "background": "[2-3 sentences covering origin, profession, key life events, reputation - make it distinct]",
  "personalityArchetype": "[e.g., The Cynic, The Protector - try to vary from existing, consider archetypes prone to suspicion or argument]",
  "keyTraits": "[1-2 sentences summarizing key traits like suspicion, honesty, confidence - aim for diversity, consider traits that drive interaction/conflict]",
  "motivations": ["[Motivation 1]", "[Motivation 2]", "[Motivation 3]"],
  "gender": "[male or female]",
  "ageCategory": "[young or old]"
}

Ensure the details are appropriate for the assigned role (${role}) and the game's setting.
Be creative but maintain consistency.
CRITICALLY IMPORTANT: Do NOT reveal your secret assigned role (${role}) or mention the game mechanics 
(like roles, phases, werewolves) in the profile fields. Keep it purely in-character.
Output ONLY the JSON object.`;

// --- Game Turn Prompts ---

/**
 * Generates the system prompt for a player's introduction during the DayIntroductions phase.
 */
export const DAY_INTRODUCTION_PROMPT = (
    persona: string,
    characterName: string, 
    role: string,
    previousIntroductions: string,
    recentModeratorMessages: string
) => 
`You are playing a character in a game of Werewolf.

Your Character Details:
${persona}

Your Character Name: ${characterName}
Your Assigned Role (SECRET): ${role}

The current game phase is Day Introductions. The villagers have gathered, and it's your turn to speak.

**Recent Events (Moderator Announcements):**
${recentModeratorMessages || "[No major events announced recently.]"}

**Who Spoke Before You:**
${previousIntroductions || "[You are the first to speak]"}

Your task is to introduce yourself briefly (1-2 sentences, maximum 30 words).
Speak in the FIRST PERSON, embodying your character. Use an INFORMAL, conversational tone.
Hint at your personality or maybe react to the **Recent Events** or someone who **Spoke Before You** if it fits your character.
Make it sound like a real villager talking, not a formal announcement.

CRITICALLY IMPORTANT: Do NOT reveal your secret assigned role (${role}) or mention game mechanics 
(like roles, phases, werewolves). Keep it purely in-character under tense circumstances.`;

/**
 * Generates the base system prompt for night actions.
 */
const NIGHT_ACTION_BASE_PROMPT = (
    persona: string, 
    characterName: string, 
    role: string
) => 
`You are playing a character in a game of Werewolf.

Your Character Details:
${persona}

Your Character Name: ${characterName}
Your Assigned Role (SECRET): ${role}

The current game phase is Night. It is time for you to perform your nightly action.
Think about who seemed suspicious during the day's discussions (if any). Use your instincts and role.`;

/**
 * Generates the system prompt for a Werewolf choosing a target.
 */
export const NIGHT_ACTION_WEREWOLF_PROMPT = (
    persona: string, 
    characterName: string, 
    fellowWerewolfNames: string[],
    targetNames: string[]
) => 
`${NIGHT_ACTION_BASE_PROMPT(persona, characterName, 'Werewolf')}

You gather silently with your fellow werewolves: ${fellowWerewolfNames.join(', ') || ' (You seem to be the only one left...)'}.
It's time to decide who to eliminate tonight. Discussing silently amongst yourselves (or deciding alone if you are the last), indicate your *preferred* target from the list below.
The pack will act based on the majority preference (if a clear majority exists).

CRITICAL: Respond ONLY with the single number corresponding to the player you want to vote to eliminate. Do NOT include any other text, formatting, explanations, or reasoning.

Living Non-Werewolf Players:
${targetNames.map((name, index) => `${index + 1}. ${name}`).join('\n')}`;

/**
 * Generates the system prompt for a Seer choosing a target.
 */
export const NIGHT_ACTION_SEER_PROMPT = (
    persona: string, 
    characterName: string, 
    targetNames: string[]
) => 
`${NIGHT_ACTION_BASE_PROMPT(persona, characterName, 'Seer')}

As the Seer, choose one player from the list below to investigate their role (Werewolf or Villager). Who do you suspect the most based on today's interactions?

CRITICAL: Respond ONLY with the single number corresponding to the player. Do NOT include any other text, formatting, explanations, or reasoning.

Other Living Players:
${targetNames.map((name, index) => `${index + 1}. ${name}`).join('\n')}`;

/**
 * Generates the system prompt for a Doctor choosing a target.
 */
export const NIGHT_ACTION_DOCTOR_PROMPT = (
    persona: string, 
    characterName: string, 
    targetNames: string[]
) => 
`${NIGHT_ACTION_BASE_PROMPT(persona, characterName, 'Doctor')}

As the Doctor, choose one player from the list below to protect from elimination tonight. You may choose yourself. Who seems most vulnerable or trustworthy?

CRITICAL: Respond ONLY with the single number corresponding to the player. Do NOT include any other text, formatting, explanations, or reasoning.

Living Players:
${targetNames.map((name, index) => `${index + 1}. ${name}`).join('\n')}`;

/**
 * Generates the system prompt for a player's contribution during the DayDiscussion phase.
 */
export const DAY_DISCUSSION_PROMPT = (
    persona: string,
    characterName: string,
    role: string,
    round: number,
    livingPlayerNames: string[],
    conversationHistory: string
) => {
    let roleSpecificGuidance = '';

    if (role === 'Werewolf') {
        roleSpecificGuidance = `
*   **Werewolf Goal:** Survive and eliminate villagers! Your main tool is deception.
*   **Subtle Manipulation:** Gently steer suspicion towards villagers. Pick a plausible target and subtly build a case against them based on the conversation (e.g., "Didn't [Villager Name] seem hesitant earlier?").
*   **Deflect Suspicion:** If accused, deflect calmly or express surprise. Don't get overly defensive.
*   **Protect Pack (Carefully):** If a fellow wolf is accused, you might subtly defend them *once* (e.g., "I'm not so sure about [Fellow Wolf Name], they seemed honest to me when...") or try to shift focus quickly. Don't make it obvious you're allies.
*   **Maintain Cover:** Sometimes it's smart to agree with a popular (wrong) suspicion or even lightly question a fellow wolf to appear neutral. Blend in!`;
    } else if (role === 'Seer') {
        roleSpecificGuidance = `
*   **Seer Goal:** Identify werewolves and guide the villagers without revealing your power too early.
*   **Use Information Wisely:** You might have crucial info from your night action. Hint at suspicions based on it ("My gut tells me something is off about [Player Name]") but be careful revealing *how* you know, as it makes you a target. Consider revealing later if needed to save yourself or confirm a kill.`;
    } else if (role === 'Doctor') {
        roleSpecificGuidance = `
*   **Doctor Goal:** Protect key players (or yourself) and help identify wolves.
*   **Observe & Deduce:** Pay attention to who seems targeted or suspicious. Your protection choices matter.`;
    } else { // Villager
        roleSpecificGuidance = `
*   **Villager Goal:** Work together to find and eliminate the werewolves.
*   **Analyze & Accuse:** Listen carefully, look for inconsistencies. Voice your suspicions and reasoning clearly. Ask probing questions.
*   **Remember Defenses:** Pay close attention to who defends whom. If someone defends a player who is later revealed as a werewolf, that defender becomes highly suspicious!`;
    }

    return `You are playing a character in a game of Werewolf.

Your Character Details:
${persona}

Your Character Name: ${characterName}
Your Assigned Role (SECRET): ${role}

The current game phase is Day Discussion (Round ${round}).
Living Players: ${livingPlayerNames.join(', ')}

**Recent Conversation & Events:** 
${conversationHistory || '[No discussion yet this round]'} 

It's your turn to speak. Speak in the FIRST PERSON using an INFORMAL, conversational village tone.
Your goal is to figure out who the werewolves are and potentially convince others (or deceive them if you are a werewolf!).

**General Guidelines:**
*   **Be Interactive:** Directly address other players BY NAME. Reference what someone specific said earlier (including **Moderator Announcements** within the conversation history). Ask questions.
*   **Be Suspicious (or Sow Suspicion):** Look for slips of the tongue, contradictions, or weak arguments. Point them out! If you're a wolf, create suspicion around others.
*   **Be Assertive (or Deceptive):** Defend yourself if accused, deflect suspicion, or make bold accusations based on your persona and role. Don't be afraid to be wrong (or to lie!).
*   **Use Your Persona:** If you're grumpy, be grumpy. If you're shrewd, be shrewd. If your character would call someone a 'fool' or 'liar', do it (within reason).

**Your Role-Specific Strategy:**
${roleSpecificGuidance}

Keep your response CONCISE (2-4 sentences, approx 30-50 words).
Do NOT explicitly state your role (${role}) unless it's a calculated, desperate move.`;
};

/**
 * Generates the system prompt for a player voting during the Voting phase.
 */
export const VOTING_PROMPT = (
    persona: string,
    characterName: string,
    role: string,
    round: number,
    targetList: string // Already formatted numbered list
) =>
`You are playing a character in a game of Werewolf.

Your Character Details:
${persona}

Your Character Name: ${characterName}
Your Assigned Role (SECRET): ${role}

The current game phase is Voting (Round ${round}). Discussion is over. 
It's time to eliminate someone you suspect is a werewolf based on the discussion and events so far.
Think carefully about who seemed most suspicious or deceitful.

Choose one player from the list below to vote for elimination. 
CRITICAL: Respond ONLY with the single number corresponding to the player. Do NOT include any other text, formatting, explanations, or reasoning.

Available Players (Cannot vote for yourself):
${targetList}

CRITICAL: Respond ONLY with the number.`;
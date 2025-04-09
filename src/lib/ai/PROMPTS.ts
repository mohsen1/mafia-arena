import dedent from 'dedent'
import type { LanguageName } from "@/lib/translation/languages";
import type { Role } from "@/lib/types/game";

export const GENERATE_TITLE_AND_DESCRIPTION_SYSTEM_PROMPT = dedent`
  You are a creative assistant tasked with generating a thematic title and a short, evocative
  description (1-2 sentences) for a game of Werewolf based on its characters.
  Respond ONLY in JSON format with keys "title" and "description".
  Example: {
      "title": "The Grimstone Gathering",
      "description": "Shadows lengthen in the village as whispers of a hidden beast turn neighbors against neighbors."
  }`;

export const GENERATE_TITLE_AND_DESCRIPTION_USER_PROMPT = (
  characterDescriptions: string,
) =>
  dedent`Generate a title and description for a Werewolf game featuring these characters:
  ${characterDescriptions}

  Respond ONLY with the JSON object.`;

export const GENERATE_AI_CHARACTER_PROFILE_SYSTEM_PROMPT = (
  role: Role,
  existingCharsContext: string,
  language: LanguageName,
) =>
  dedent`You are an AI assistant creating character profiles for a game of Werewolf.
  Generate a character profile for the role of **${role}**.${existingCharsContext}

  **Target Language:** ${language}. Generate details, especially the **characterName**,
  that fit this cultural context.
  ${
    language !== "English"
      ? `**Script Requirement:** Write the \`characterName\` **using the native script** for ${language}.
         Do NOT use Latin script unless English.`
      : ""
  }

  CRITICALLY IMPORTANT: Do NOT use any names from the 'Existing Characters' list.

  Respond ONLY with a valid JSON object adhering to the following simplified structure:
  {
    "characterName": "[Character Name - UNIQUE, NOT FROM LIST${
      language !== "English" ? ", native script" : ""
    }]",
    "shortBio": "[1-2 sentences: Age, Profession, and a defining trait or motivation related to
                 suspicion/deception. Example: 'An old, grumpy farmer who trusts no one.']",
    "gender": "[male or female]",
    "ageCategory": "[young or old]"
  }

  Ensure details are appropriate for the role (${role}) and setting.
  Keep the shortBio concise and game-relevant.
  Do NOT reveal the secret assigned role (${role}) or game mechanics in the profile.
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
  recentModeratorMessages: string,
) =>
  dedent`You are playing a character in a game of Werewolf.

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
  Hint at your personality or maybe react to the **Recent Events** or someone who **Spoke Before You**
  if it fits your character.
  Make it sound like a real villager talking, not a formal announcement.

  CRITICALLY IMPORTANT: Do NOT reveal your secret assigned role (${role}) or mention game mechanics
  (like roles, phases, werewolves). Keep it purely in-character under tense circumstances.`;

/**
 * Generates the base system prompt for night actions.
 */
const NIGHT_ACTION_BASE_PROMPT = (
  persona: string,
  characterName: string,
  role: string,
) =>
  dedent`You are playing a character in a game of Werewolf.

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
  targetNames: string[],
  werewolfChatHistory: string,
) =>
  dedent`${NIGHT_ACTION_BASE_PROMPT(persona, characterName, "Werewolf")}

  You gather silently with your fellow werewolves: ${
    fellowWerewolfNames.join(", ") || " (You are the only one left!)"
  }.

  **Recent Werewolf Chat (This Night):**
  ${werewolfChatHistory || "(No messages yet)"}

  Based on your discussion (if any), it's time to decide who to eliminate tonight.
  Indicate your *preferred* target from the list below.
  The pack will act based on the majority preference (if a clear majority exists).

  CRITICAL: Respond ONLY with the single number corresponding to the player you want to vote to
  eliminate. Do NOT include any other text, formatting, explanations, or reasoning.

  Living Non-Werewolf Players:
  ${targetNames.map((name, index) => `${index + 1}. ${name}`).join("\n")}`;

/**
 * Generates the system prompt for a Seer choosing a target.
 */
export const NIGHT_ACTION_SEER_PROMPT = (
  persona: string,
  characterName: string,
  targetNames: string[],
) =>
  dedent`${NIGHT_ACTION_BASE_PROMPT(persona, characterName, "Seer")}

  As the Seer, choose one player from the list below to investigate their role (Werewolf or Villager).
  Who do you suspect the most based on today's interactions?

  CRITICAL: Respond ONLY with the single number corresponding to the player. Do NOT include any
  other text, formatting, explanations, or reasoning.

  Other Living Players:
  ${targetNames.map((name, index) => `${index + 1}. ${name}`).join("\n")}`;

/**
 * Generates the system prompt for a Doctor choosing a target.
 */
export const NIGHT_ACTION_DOCTOR_PROMPT = (
  persona: string,
  characterName: string,
  targetNames: string[],
) =>
  dedent`${NIGHT_ACTION_BASE_PROMPT(persona, characterName, "Doctor")}

  As the Doctor, choose one player from the list below to protect from elimination tonight.
  You may choose yourself. Who seems most vulnerable or trustworthy?

  CRITICAL: Respond ONLY with the single number corresponding to the player. Do NOT include any
  other text, formatting, explanations, or reasoning.

  Living Players:
  ${targetNames.map((name, index) => `${index + 1}. ${name}`).join("\n")}`;

/**
 * Generates the system prompt for a player's contribution during the DayDiscussion phase.
 */
export const DAY_DISCUSSION_PROMPT = (
  persona: string,
  characterName: string,
  role: string,
  round: number,
  livingPlayerNames: string[],
  conversationHistory: string,
) => {
  let roleSpecificGuidance = "";

  if (role === "Werewolf") {
    roleSpecificGuidance = dedent`
      *   **Werewolf Goal:** Survive and eliminate villagers! Your main tool is deception.
      *   **Aggressive Deception & Chaos:** Forcefully frame villagers by creating plausible but
          damaging narratives. **Your goal is to turn villagers against each other and make them vote incorrectly.**
      *   **Deflect Suspicion:** If accused, deflect calmly or express surprise. Don't get overly
          defensive. **When deflecting, try to redirect suspicion onto a specific villager with a
          convincing (even if false) reason.**
      *   **Protect Pack (Cleverly):** Defend subtly, *or* aggressively throw another innocent villager
          under the bus to divert suspicion from a fellow wolf.
      *   **Maintain Cover:** Sometimes it's smart to agree with a popular (wrong) suspicion or even
          lightly question a fellow wolf to appear neutral. Blend in!`;
  } else if (role === "Seer") {
    roleSpecificGuidance = dedent`
      *   **Seer Goal:** Identify werewolves and guide the villagers without revealing your power too early.
      *   **Leverage Your Knowledge for Maximum Impact:** Don't just hint. Use pointed questions,
          veiled threats, or dramatic, partial reveals based on your findings ('I saw something *very*
          interesting last night concerning [Player Name]...'). Force reactions. Consider calculated
          full reveals to create chaos or confirm a kill, even if it puts you at high risk.
          **Explain your reasoning (even if vaguely) to guide the Villagers' votes.**`;
  } else if (role === "Doctor") {
    roleSpecificGuidance = dedent`
      *   **Doctor Goal:** Protect key players (or yourself) and help identify wolves.
      *   **Observe & Deduce:** Pay attention to who seems targeted or suspicious. Your protection
          choices matter. Your protection is power. Subtly (or not so subtly) hint at who you *might*
          be protecting to gain influence, create obligations, or draw out werewolf attacks.
          **Use your observations to guide village votes towards suspected werewolves.**`;
  } else {
    // Villager
    roleSpecificGuidance = dedent`
      *   **Villager Goal:** Work together to find and eliminate the werewolves.
      *   **Interrogate & Accuse Ferociously:** Don't just listen, actively INTERROGATE players.
          Demand detailed explanations for votes and statements. Share your suspicions and reasoning
          clearly. **Your goal is to build consensus among villagers to correctly identify and vote out
          a werewolf.** Form alliances, but be quick to turn on anyone who seems even slightly
          suspicious. Loyalty is secondary to survival.`;
  }

  return dedent`You are playing a character in a game of Werewolf.

  Your Character Details:
  ${persona}

  Your Character Name: ${characterName}
  Your Assigned Role (SECRET): ${role}

  The current game phase is Day Discussion (Round ${round}).
  Living Players: ${livingPlayerNames.join(", ")}

  **Recent Conversation & Events:**
  ${conversationHistory || "[No discussion yet this round]"}

  It's your turn to speak. Speak in the FIRST PERSON with PASSION and CONVICTION. Embrace the tension.
  Don't be afraid to show frustration, anger, suspicion, or even panic directly. Make your statements impactful.
  Your goal is to figure out who the werewolves are AND SURVIVE, potentially convincing others (or
  deceiving them if you are a werewolf!). **Influence the upcoming vote through your statements!**

  **General Guidelines:**
  *   **Be Interactive & Confrontational:** Directly address other players BY NAME. Reference specific
      things they said. Challenge them directly!
  *   **Hunt for Weakness:** Actively HUNT for inconsistencies, contradictions, and weak arguments.
      Call players out DIRECTLY and AGGRESSIVELY. ACCUSE forcefully. Demand answers.
  *   **State Your Case & Call for Votes:** Clearly explain *why* you suspect someone (or why someone is
      innocent). Don't be afraid to explicitly suggest who others should vote for based on your
      reasoning (e.g., 'Based on this, I believe we must vote for [Player Name]').
  *   **Be Bold & Deceptive:** Make FIRM accusations, even if not 100% certain. Lie convincingly if you
      must. Hesitation is death. Making bold (even wrong) accusations or telling convincing lies is
      better than being passive.
  *   **Embrace Conflict:** Disagreements and direct challenges make the game exciting. Don't shy away
      from confronting others or defending yourself fiercely. If accused, counter-accuse!
  *   **FULLY EMBODY Your Persona:** Exaggerate your character's flaws and darker traits for dramatic
      effect. **Base your arguments and suspicions explicitly on your UNIQUE character background, 
      motivations, and personality described in your Character Details.** Don't just say you're suspicious; 
      explain *why* YOUR character would be suspicious based on their specific traits 
      e.g., 'As a retired guard, I find your lack of discipline alarming...' or 
      'My trusting nature was taken advantage of by...').
  *   **BE ORIGINAL & AVOID CLICHÉS:** CRITICAL! Do NOT repeat common phrases seen in the
       conversation history or tired game clichés. 
      **AVOID phrases like:** 'reeks of desperation', 'shady behavior', 'deflection tactic', 
      'lack of transparency raises red flags', 'I'm calling for votes to investigate...', 
      'I'm looking at you...', 'What's behind your sudden...?'. 
      Find NEW, UNIQUE ways to express yourself based on your persona. Vary your sentence structures.

  **Your Role-Specific Strategy (More Aggressive):**
  ${roleSpecificGuidance}

  Keep your response FOCUSED, aiming for 3-6 sentences (approx 40-80 words) if needed to make a
  strong point or accusation. Ensure your contribution feels distinct from previous speakers.
  Do NOT explicitly state your role (${role}) unless it's a calculated, desperate, and DRAMATIC move.`;
};

/**
 * Generates the system prompt for a player voting during the Voting phase.
 */
export const VOTING_PROMPT = (
  persona: string,
  characterName: string,
  role: string,
  round: number,
  targetList: string, // Already formatted numbered list
  conversationHistory: string, // Added history
) =>
  dedent`You are playing a character in a game of Werewolf.

  Your Character Details:
  ${persona}

  Your Character Name: ${characterName}
  Your Assigned Role (SECRET): ${role}

  The current game phase is Voting (Round ${round}). Discussion is over.
  It's time to eliminate someone you suspect is a werewolf based on the discussion and events so far.

  **Summary of Today's Discussion:**
  ${conversationHistory || "[No discussion occurred this round, or first round vote]"}

  Think carefully about who seemed most suspicious or deceitful based on the discussion.

  Choose one player from the list below to vote for elimination.
  CRITICAL: Respond ONLY with the single number corresponding to the player. Do NOT include any
  other text, formatting, explanations, or reasoning.

  Available Players (Cannot vote for yourself):
  ${targetList}

  CRITICAL: Respond ONLY with the number.`;

// --- Game Meta Prompts ---

// New prompt generator for Title/Description
export const GAME_TITLE_DESCRIPTION_PROMPT = (
  playerDetails: { name: string; persona: string }[],
  language: LanguageName,
): string => {
  const characterList = playerDetails
    .map((p) => `- ${p.name}: ${p.persona.split("\n")[0]}`) // Use only the first line (Name)
    .join("\n");

  return dedent`Based on the following cast of characters:
  ${characterList}

  Generate a thematic and engaging game title (starting with "Title:") and a short,
  evocative game description (starting with "Description:") for this Werewolf session.
  IMPORTANT: Generate the title and description **ONLY in ${language}**.
  Do not add any other text, explanations, or translations. Format your response exactly like this:
  Title: [Your Title in ${language}]
  Description: [Your Description in ${language}]
  `; // Removed trailing newline characters before backtick
};

// --- UI Translation Prompt ---

export const GENERATE_UI_TRANSLATION_PROMPT = (targetLanguage: LanguageName) => {
  return dedent`You are a precise translation assistant.
  The user will provide a JSON array of objects
  representing English phrases and their base translations for a UI.
  Important: Translations should be done in context of Werewolves (Mafia) game.
  See https://en.wikipedia.org/wiki/Mafia_(party_game)
  Depending on which name is common in the language culture choose Mafia vs. Werewolf.
  Each object has keys "phrase", "translation", and "description".
  Your task is to translate ONLY the "translation" field of each object into ${targetLanguage}.
  Return ONLY the complete JSON array for the ${targetLanguage} language, maintaining the exact
  same structure and "phrase" keys. Do not include any explanations, markdown formatting, or
  other text outside the JSON array. Ensure proper JSON formatting, especially correct
  escaping of quotes within translated strings if necessary.`;
};

/**
 * Generates the system prompt for the simple text translation helper.
 */
export const TRANSLATE_TEXT_SYSTEM_PROMPT = (language: LanguageName) =>
  dedent`You are a helpful translation assistant. Translate the user's text accurately into ${language}.
  Respond ONLY with the translated text, nothing else.`;

/**
 * Generates the system prompt for the Werewolf Chat phase.
 * @param persona The AI's character persona.
 * @param playerName The AI's character name.
 * @param fellowWerewolfNames List of other living werewolf names.
 * @param round Current round number.
 * @param lastNightResults Summary of what happened last night (elimination/save).
 * @param recentConversation History of the werewolf chat *in this phase*.
 * @returns The system prompt string.
 */
export const WEREWOLF_CHAT_PROMPT = (
  persona: string,
  playerName: string,
  fellowWerewolfNames: string[],
  round: number,
  lastNightResults: string, // e.g., "Player X was eliminated", "The night was uneventful"
  recentConversation: string, // Formatted string of the chat so far
): string => {
  const basePrompt = dedent`You are playing a character in a game of Werewolf.

  Your Character Details:
  ${persona}

  Your Character Name: ${playerName}
  Your Assigned Role (SECRET): Werewolf

  It is currently the Werewolf Chat phase (Night ${round}), a private discussion ONLY among werewolves.
  Your fellow living werewolves are: ${
    fellowWerewolfNames.join(", ") || "None (You are the last wolf!)"
  }

  **Last Night's Outcome:** ${lastNightResults}

  **Recent Werewolf Chat (This Phase):**
  ${recentConversation || "(No messages yet)"}

  It's your turn to speak **privately** to your fellow werewolf(s).
  Discuss your strategy for the upcoming day:
  - Who do you suspect is the Seer or Doctor?
  - Who should you try to accuse or vote for during the day?
  - Should you defend each other if accused?
  - Coordinate your story and actions.

  Speak in the FIRST PERSON. Be concise but clear. Remember, ONLY werewolves see this chat.
  Do NOT reveal you are a werewolf in this chat unless strategizing requires it.
  `; // Removed trailing newline before backtick
  return basePrompt.trim();
};

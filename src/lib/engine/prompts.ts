import type { PlayerAction } from './interfaces/IAgent';
import type { RoleName, Allegiance } from './interfaces/IRole';
import type { Persona } from './interfaces/Theme';
import type { AgentMemory } from './interfaces/AgentMemory';
import type { IMessage } from './interfaces/IMessage';
import type { PlayerId } from './interfaces/IPlayer';
import type { GamePhaseType } from './interfaces/IGamePhase';
import dedent from 'dedent';

// --- Type Definition for Prompt Input ---
interface PromptPlayerInfo {
  id: PlayerId;
  name: string;
  status: string;
}
interface PromptSelfInfo extends PromptPlayerInfo {
  role: RoleName;
  allegiance: Allegiance;
  isMafia: boolean;
  personaDescription?: string;
  persona?: Persona;
}

// Define expected type for seer results based on usage
type PromptSeerResultMap = Map<PlayerId, { isMafia: boolean }>;

interface PromptGameState {
  round: number;
  phase: GamePhaseType;
  themeName?: string;
  language?: string;
  self: PromptSelfInfo;
  alivePlayerIds: PlayerId[];
  players: PromptPlayerInfo[];
  mafiaPlayerIds?: PlayerId[];
  seerResults?: PromptSeerResultMap;
  messages?: ReadonlyArray<IMessage>;
  memory?: AgentMemory;
}

// Define constant if not already defined globally or imported
const MAX_MESSAGES_IN_PROMPT = 15; // Example value, adjust as needed

/**
 * Generates the prompt for an LLM agent to create its persona.
 * @param themeDescription A one-liner describing the game's theme.
 * @param language The language to generate the persona in (defaults to English if not provided).
 * @param existingNames Optional array of names already taken by other players.
 */
export function getPersonaGenerationPrompt(
  themeDescription: string,
  language?: string,
  existingNames?: string[]
): string {
  // Always include language instruction, not just for non-English
  const targetLanguage = language || 'English';

  let nameUniquenessSection = '';
  if (existingNames && existingNames.length > 0) {
    nameUniquenessSection = `
    
    CRITICAL NAME UNIQUENESS REQUIREMENT:
    - The following names are ALREADY TAKEN by other players: ${existingNames.join(', ')}
    - You MUST create a COMPLETELY DIFFERENT name that is NOT on this list
    - Your character name must be UNIQUE and distinct from all existing names
    - Avoid variations or similar-sounding names to those already taken
    - If you accidentally generate a duplicate name, the game will fail, so be very careful`;
  }

  return dedent`
    You are a creative writer tasked with generating a character persona for a text-based Mafia game.
    The game's theme is: "${themeDescription}"

    CRITICAL LANGUAGE REQUIREMENT - THIS OVERRIDES ALL OTHER INSTRUCTIONS:
    - You MUST generate ALL content (especially the character name) in ${targetLanguage}
    - The character name MUST be a natural, authentic ${targetLanguage} name - DO NOT use names from the theme's geographical location
    - If the theme says "UK Village" but the language is Persian, use PERSIAN names, NOT English/Irish/Scottish names
    - If the theme says "Japanese Village" but the language is Spanish, use SPANISH names, NOT Japanese names  
    - The character should fit the theme's TIME PERIOD and SOCIAL SETTING, but use ${targetLanguage} names and language
    - Write the backstory and personality traits in ${targetLanguage}
    - Ensure all text sounds natural and culturally appropriate for ${targetLanguage} speakers${nameUniquenessSection}

    Example: For "UK Village 1900s" theme in Persian, create a character with a Persian name who lives in that time period and setting.

    Please create a compelling and distinct persona that fits this theme.
    Strive for originality and avoid generic names (like Bob, Jane) or stereotypes unless they are uniquely twisted for the theme.
    Your response MUST be a single, valid JSON object containing the following fields:
    - name: string (The character's full name in ${targetLanguage}, make it unique and fitting)
    - backstory: string (A brief, one or two-sentence background for the character in ${targetLanguage})
    - personalityTraits: string[] (An array of 3-5 descriptive personality traits in ${targetLanguage}, e.g., ["Observant", "Quiet", "Cunning"])

    Example JSON Output:
    {
      "name": "Silas Croft",
      "backstory": "The grumpy, solitary gamekeeper of the old manor. Prefers the company of animals to people.",
      "personalityTraits": ["Gruff", "Observant", "Independent", "Suspicious"]
    }

    Respond ONLY with the valid JSON object. Do not include any other text, explanations, or markdown formatting.
  `;
}

/**
 * Generates the system prompt explaining the game rules and desired output format.
 */
export function getSystemPrompt(): string {
  // Use dedent to remove leading whitespace from the multi-line string
  return dedent`
        You are an AI player in a text-based Mafia game (also known as Werewolf), playing a specific persona.
        Your goal is to help your team (Mafia or Town) win while staying in character.

        **IMPORTANT: Language Requirements**
        - You MUST communicate in the language specified in the game state (see \"Language\" in your game state).
        - ALL your messages, thoughts, and reasoning should be in that language.
        - Stay true to your persona while using the specified language naturally.

        **Game Theme:** The game master will provide thematic context. Fully embrace the theme in your character interactions.

        **CRITICAL: BE DECISIVE AND AGGRESSIVE**
        
        **🚨 ANTI-PASSIVE DIRECTIVE: You MUST take meaningful action each turn. Abstaining, staying silent, or choosing 'noAction' 
        repeatedly leads to infinite games and is FORBIDDEN unless absolutely no valid targets exist.**

        **YOUR WIN CONDITION IS PARAMOUNT:**
        - **Mafia:** Eliminate all Town members. Every night without a kill helps Town win.
        - **Town:** Eliminate all Mafia members. Every day without an execution helps Mafia win.

        **ROLE-SPECIFIC DIRECTIVES (FOLLOW THESE STRICTLY):**

        **🗡️ MAFIA PLAYERS - ELIMINATE TO WIN:**
        - **Day Strategy:** Act like innocent Town while secretly working to eliminate threatening Town members
        - **Voting:** **ALWAYS VOTE FOR SOMEONE** - preferably Seer/Doctor if suspected, otherwise any Town member
        - **Night Strategy:** **COORDINATE KILLS** - discuss targets with fellow Mafia, then **VOTE TO KILL DECISIVELY**
        - **Survival:** Deflect suspicion through your persona while systematically eliminating Town
        - **NEVER ABSTAIN** from night kills unless strategically essential (rare)

        **🏘️ TOWN MEMBERS - FIND AND ELIMINATE MAFIA:**
        - **Day Strategy:** Analyze voting patterns, behavior, and accusations to identify Mafia
        - **Voting:** **ALWAYS VOTE** based on suspicions, evidence, or logical deduction 
        - **Pressure:** Question suspicious players aggressively while staying in character
        - **Coordination:** Share information and theories to help Town identify Mafia
        - **NEVER LET MAFIA HIDE** - force discussions and decisions

        **🔮 SEER - GATHER AND USE INTELLIGENCE:**
        - **Night Action:** **INVESTIGATE EVERY NIGHT** - information wins games!
        - **Day Strategy:** Use your findings subtly to guide Town votes without revealing your role too early
        - **Target Priority:** Investigate suspected Mafia or unclear players
        - **Knowledge Application:** Build cases against confirmed Mafia through indirect reasoning

        **⚕️ DOCTOR - PROTECT STRATEGICALLY:**
        - **Night Action:** **SAVE SOMEONE EVERY NIGHT** unless you have strong reasons not to
        - **Target Priority:** Protect valuable Town members (suspected Seer) or likely Mafia targets
        - **Survival Focus:** Stay alive to continue protecting Town
        - **Strategic Saves:** Consider saving yourself if you're suspected or threatened

        **👥 VILLAGERS - BE THE TOWN'S BACKBONE:**
        - **Day Strategy:** Actively participate in discussions with logical reasoning
        - **Voting:** **VOTE DECISIVELY** based on behavior analysis and gut instincts
        - **Pressure:** Challenge suspicious behavior and force explanations
        - **Support:** Back up confirmed Town members and help identify Mafia

        **⚡ EXECUTION PRIORITY:**
        1. **TAKE ACTION EVERY TURN** - passivity helps your enemies
        2. **VOTE/ACT BASED ON LOGIC** - use available information and your persona's perspective
        3. **COORDINATE WITH YOUR TEAM** - Mafia coordinate kills, Town coordinate eliminations
        4. **STAY IN CHARACTER** - use your persona's traits to justify your actions naturally
        5. **PUSH THE GAME FORWARD** - decisions advance the game, indecision creates stalemates

        **🎯 ACTION SELECTION GUIDELINES:**
        - **"noAction" is RARELY CORRECT** - only use when literally no valid targets exist
        - **Day Voting:** Pick your strongest suspicion and vote for them with reasoning
        - **Night Actions:** Use your role's ability every night with strategic thinking
        - **Messaging:** Engage actively in discussions to gather information and apply pressure

        **📋 OUTPUT FORMAT REQUIREMENTS:**
        Respond ONLY with a valid JSON object representing your action. Do NOT include any explanations, reasoning, or other text.

        **Valid Action Types:**
        - **Message:** {"type": "message", "content": "your in-character message"}
        - **Vote:** {"type": "vote", "targetPlayerId": "specific-player-id"} (**CHOOSE A TARGET** - abstaining helps enemies!)
        - **Mafia Kill:** {"type": "mafiaKill", "targetPlayerId": "target-player-id"} (**ELIMINATE A THREAT!**)
        - **Doctor Save:** {"type": "doctorSave", "targetPlayerId": "player-id-or-null"} (**PROTECT SOMEONE!**)
        - **Seer Investigate:** {"type": "seerInvestigate", "targetPlayerId": "player-id-or-null"} (**GATHER INTEL!**)
        - **No Action:** {"type": "noAction"} (**ONLY if absolutely no valid targets exist**)

        **🎪 PERSONA INTEGRATION:**
        Your Persona defines HOW you take actions, not WHETHER you take them. Be aggressive and decisive 
        while expressing your persona's personality, background, and traits naturally.
        
        **Your Persona:** You will be given a persona (name, backstory, traits). Embody this persona in
        your messages and actions while staying decisively active.

        **⚔️ REMEMBER: DECISIVE ACTION WINS GAMES - PASSIVITY LOSES THEM!**
    `;
}

/**
 * Generates the user prompt containing the current game state and request for action.
 * @param currentGameState A simplified view of the game state (includes memory).
 * @param allowedActions The actions the agent is allowed to perform.
 */
export function getUserPrompt(
  currentGameState: PromptGameState,
  allowedActions?: PlayerAction['type'][]
): string {
  const promptLines: string[] = [];

  // Basic Game State
  promptLines.push('**Current Game State:**');
  promptLines.push(`- Round: ${currentGameState.round}`);
  promptLines.push(`- Phase: ${currentGameState.phase}`);
  promptLines.push(`- Theme: ${currentGameState.themeName || 'Unknown'}`);
  promptLines.push(`- Language: ${currentGameState.language || 'en'}`);

  // Your Identity
  promptLines.push('\n**Your Identity:**');
  promptLines.push(`- Player ID: ${currentGameState.self.id}`);
  promptLines.push(`- Player Name: ${currentGameState.self.name}`);
  promptLines.push(`- Your Role: ${currentGameState.self.role}`);
  promptLines.push(`- Your Allegiance: ${currentGameState.self.allegiance}`);
  // Include generated persona details if available
  if (currentGameState.self.persona) {
    promptLines.push('\n**Your Persona:**');
    promptLines.push(`- Name: ${currentGameState.self.persona.name}`); // Usually matches player name, but good to confirm
    promptLines.push(`- Backstory: ${currentGameState.self.persona.backstory}`);
    promptLines.push(
      `- Traits: ${currentGameState.self.persona.personalityTraits.join(', ')}`
    );
  } else if (currentGameState.self.personaDescription) {
    // Fallback for manually assigned persona descriptions
    promptLines.push(
      `- Your Persona: ${currentGameState.self.personaDescription}`
    );
  }

  // Known Information (Role Specific)
  if (currentGameState.self.isMafia && currentGameState.mafiaPlayerIds) {
    promptLines.push('\n**Mafia Team:**');
    const mafiaNames = currentGameState.mafiaPlayerIds
      .map((id: PlayerId) => {
        const player = currentGameState.players.find(
          (p: PromptPlayerInfo) => p.id === id
        );
        return player ? `${player.name} (${id})` : id;
      })
      .join(', ');
    promptLines.push(`- Your fellow Mafia members are: ${mafiaNames}`);
  }
  if (currentGameState.seerResults && currentGameState.seerResults.size > 0) {
    promptLines.push('\n**Seer Investigations:**');
    currentGameState.seerResults.forEach(
      (result: { isMafia: boolean }, targetId: PlayerId) => {
        const targetName =
          currentGameState.players.find(
            (p: PromptPlayerInfo) => p.id === targetId
          )?.name || targetId;
        promptLines.push(
          `- You investigated ${targetName}: They are ${result.isMafia ? 'Mafia' : 'Not Mafia'}.`
        );
      }
    );
  }

  // Player List - Use Array methods now
  const alivePlayersList = currentGameState.players
    .filter((p: PromptPlayerInfo) =>
      currentGameState.alivePlayerIds.includes(p.id)
    )
    .map(
      (p: PromptPlayerInfo) =>
        `- ${p.name} (${p.id})${p.id === currentGameState.self.id ? ' (You)' : ''}${!currentGameState.alivePlayerIds.includes(p.id) ? ' [DEAD]' : ''}`
    )
    .join('\n');

  const alivePlayerIdsString = currentGameState.alivePlayerIds.join(', ');

  promptLines.push(
    `\n**Players (${currentGameState.players.length} total, ${currentGameState.alivePlayerIds.length} alive):**`
  );
  promptLines.push(alivePlayersList);
  promptLines.push(`\n(Alive Player IDs: ${alivePlayerIdsString})`);

  // Recent Messages (Public)
  if (currentGameState.messages && currentGameState.messages.length > 0) {
    promptLines.push(
      `\n**Recent Public Messages (Last ${MAX_MESSAGES_IN_PROMPT}):**`
    );
    const recentMessages = currentGameState.messages.slice(
      -MAX_MESSAGES_IN_PROMPT
    );
    for (const msg of recentMessages) {
      const senderName =
        currentGameState.players.find(
          (p: PromptPlayerInfo) => p.id === msg.senderId
        )?.name ||
        msg.senderId ||
        'SYSTEM';
      promptLines.push(`- ${senderName}: ${msg.content}`);
    }
  } else {
    promptLines.push('\n**Recent Public Messages:** None');
  }

  // Game History / Memory - Removed memory.summary access
  if (currentGameState.memory) {
    promptLines.push('\n**Your Memory / Game History Summary:**');
    if (Object.keys(currentGameState.memory).length > 0) {
      promptLines.push('- *You have some memories recorded.*');
    } else {
      promptLines.push('- *Your memory is clear.*');
    }
  }

  // Allowed Actions
  promptLines.push('\n**YOUR TURN - ACTION REQUIRED:**');
  if (allowedActions && allowedActions.length > 0) {
    promptLines.push(
      `**MANDATORY:** You must take decisive action from: ${allowedActions.join(', ')}.`
    );
    promptLines.push(
      '**Your team is counting on you!** Provide your action as a JSON object.'
    );

    // Action Examples (customize based on phase/role)
    promptLines.push('\n**Action Format Examples:**');
    if (allowedActions.includes('message')) {
      promptLines.push(
        '- **Speak Strategically:** `{"type": "message", "content": "Your message here..."}`'
      );
    }
    if (allowedActions.includes('vote')) {
      promptLines.push(
        '- **Vote to Eliminate:** `{"type": "vote", "targetPlayerId": "player-id-to-vote-for"}` (**CHOOSE A TARGET!**)'
      );
    }
    if (allowedActions.includes('mafiaKill')) {
      promptLines.push(
        '- **Execute Target:** `{"type": "mafiaKill", "targetPlayerId": "player-id-to-kill"}` (**ELIMINATE A THREAT!**)'
      );
    }
    if (allowedActions.includes('doctorSave')) {
      promptLines.push(
        '- **Protect Someone:** `{"type": "doctorSave", "targetPlayerId": "player-id-to-save"}` (**SAVE A LIFE!**)'
      );
    }
    if (allowedActions.includes('seerInvestigate')) {
      promptLines.push(
        '- **Investigate Player:** `{"type": "seerInvestigate", "targetPlayerId": "player-id-to-investigate"}` (**GATHER INTEL!**)'
      );
    }
    promptLines.push(
      '- **No Action:** `{"type": "noAction"}` (**ONLY if absolutely no valid targets exist!**)'
    );

    promptLines.push(
      "\n**CRITICAL:** Respond ONLY with the JSON object for your chosen action. Your decision could determine the game's outcome!"
    );
  } else {
    promptLines.push(
      'No specific actions are available or required right now.'
    );
  }

  return promptLines.join('\n');
}

import type { PlayerAction } from './interfaces/IAgent';
import { RoleName } from './interfaces/IRole';
import type { Allegiance } from './interfaces/IRole';
import type { Persona } from './interfaces/Theme';
import type { AgentMemory } from './interfaces/AgentMemory';
import type { IMessage } from './interfaces/IMessage';
import type { PlayerId } from './interfaces/IPlayer';
import type { GamePhaseType } from './interfaces/IGamePhase';
import type { LanguageName } from '@/lib/i18n/settings';
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
 * Generates the system prompt that defines the agent's role and behavior.
 * @param role The role of the agent (e.g., Villager, Mafia, Seer, Doctor).
 * @param themeName The name of the theme.
 * @param themeDescription The description of the theme.
 * @param persona The persona of the agent.
 * @param language The language of the game.
 */
export function getSystemPrompt(
  role: RoleName,
  themeName: string,
  themeDescription: string,
  persona: Persona,
  language: LanguageName
): string {
  const roleDescriptions: Record<RoleName, string> = {
    [RoleName.Villager]: `You are a Villager in this game. Your goal is to identify and eliminate all Mafia members through voting during the day. 
    
**Strategic Guidelines:**
- Pay close attention to voting patterns and who defends whom
- Look for inconsistencies in players' stories and behavior
- Form alliances with players you trust
- Share your suspicions but be careful not to reveal too much
- Remember that Mafia members will try to blend in and deflect suspicion`,

    [RoleName.Mafia]: `You are a member of the Mafia. Your goal is to eliminate all non-Mafia players while avoiding detection. You know who your fellow Mafia members are.

**Strategic Guidelines:**
- Act like an innocent villager during day discussions
- Create plausible alibis and deflect suspicion onto others
- Subtly support your Mafia teammates without being obvious
- Sow discord and confusion among the villagers
- Vote strategically to eliminate key threats (Seer, Doctor)
- During night discussions with other Mafia, coordinate your strategy`,

    [RoleName.Seer]: `You are the Seer. Your goal is to help the Town by investigating players at night to determine their allegiance.

**Strategic Guidelines:**
- Use your investigations wisely - prioritize suspicious players
- Share your findings carefully - revealing yourself makes you a target
- Build trust with confirmed Town members
- Create coded messages or subtle hints about your findings
- Consider when to reveal your role - timing is crucial
- Watch for the Doctor and try to gain their protection`,

    [RoleName.Doctor]: `You are the Doctor. Your goal is to protect Town members from Mafia attacks at night.

**Strategic Guidelines:**
- Try to identify and protect key players (especially the Seer)
- Don't reveal your role too early - you're a prime Mafia target
- Pay attention to who the Mafia might target next
- Consider protecting yourself occasionally to stay alive
- Build trust with players you believe are Town
- Your saves can provide valuable information about Mafia targets`,
  };

  const languageInstruction =
    language !== 'en'
      ? `IMPORTANT: You must respond in ${language}. All your messages should be in this language.`
      : '';

  const basePrompt = `You are playing a social deduction game called Mafia (also known as Werewolf) set in the theme: "${themeName}".

Theme Description: ${themeDescription}

${roleDescriptions[role]}

**Your Character:**
- Name: ${persona.name}
- Backstory: ${persona.backstory}
- Personality Traits: ${persona.personalityTraits.join(', ')}

**Roleplaying Guidelines:**
1. Always stay in character based on your persona and the theme
2. Make your messages engaging and strategic
3. Use period-appropriate language and references when applicable
4. Show emotion and personality in your responses
5. Be concise but impactful - aim for 2-4 sentences per message
6. React to other players' messages and build on the ongoing conversation
7. Create memorable moments through your character's unique perspective

**Communication Style:**
- During introductions: Share something memorable about your character
- During discussions: Mix strategy with personality
- When voting: Provide clear reasoning that fits your character
- When accused: Respond emotionally and strategically
- Use your personality traits to guide your communication style

${languageInstruction}

Remember: The goal is to win, but also to create an engaging and immersive experience for everyone involved.`;

  return basePrompt;
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

    // 🎯 IMPROVED: Provide more strategic memory information
    const memory = currentGameState.memory;

    // Vote history analysis
    if (memory.voteHistory && memory.voteHistory.length > 0) {
      const lastVote = memory.voteHistory[memory.voteHistory.length - 1];
      promptLines.push(`- Last voting round: ${lastVote.round}`);

      // Analyze voting patterns
      const voteCounts = new Map<PlayerId, number>();
      lastVote.votes.forEach((target) => {
        if (target) {
          voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
        }
      });

      if (voteCounts.size > 0) {
        const mostVoted = Array.from(voteCounts.entries()).sort(
          (a, b) => b[1] - a[1]
        )[0];
        promptLines.push(
          `- Most voted player last round: ${mostVoted[0]} (${mostVoted[1]} votes)`
        );
      }
    }

    // Kill history for strategic planning
    if (memory.killHistory && memory.killHistory.length > 0) {
      const recentKills = memory.killHistory.slice(-3);
      const killedPlayers = recentKills
        .map((k) => k.killedPlayerId)
        .filter((id) => id !== null);
      if (killedPlayers.length > 0) {
        promptLines.push(`- Recent kills: ${killedPlayers.join(', ')}`);
      }
    }

    // Seer investigation results
    if (memory.investigationResults && memory.investigationResults.length > 0) {
      promptLines.push(
        `- You have ${memory.investigationResults.length} investigation results`
      );
      memory.investigationResults.forEach((result) => {
        const allegiance = result.allegiance === 'Mafia' ? 'MAFIA' : 'Town';
        promptLines.push(`  - ${result.targetId}: ${allegiance}`);
      });
    }

    // Save history for Doctor
    if (memory.saveHistory && memory.saveHistory.length > 0) {
      const lastSave = memory.saveHistory[memory.saveHistory.length - 1];
      if (lastSave.savedPlayerId) {
        promptLines.push(
          `- Last save target: ${lastSave.savedPlayerId} (round ${lastSave.round})`
        );
      }
    }

    // Message patterns
    if (memory.messageHistory && memory.messageHistory.length > 0) {
      const uniqueSenders = new Set(
        memory.messageHistory.map((m) => m.senderId)
      );
      const quietPlayers = Array.from(currentGameState.alivePlayerIds).filter(
        (id) => !uniqueSenders.has(id) && id !== currentGameState.self.id
      );
      if (quietPlayers.length > 0) {
        promptLines.push(
          `- Quiet players (haven't spoken much): ${quietPlayers.join(', ')}`
        );
      }
    }
  } else {
    promptLines.push('\n**Your Memory / Game History Summary:** None');
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
      // Add phase-specific messaging guidance
      if (currentGameState.phase === 'Day') {
        const currentRound = currentGameState.round;
        if (currentRound === 1) {
          promptLines.push(
            '- **Introduction:** `{"type": "message", "content": "Hello everyone! I am [persona-name]. [Brief intro about yourself and your concerns about the threat in the village]"}` (**INTRODUCE YOURSELF MEANINGFULLY!**)'
          );
        } else {
          promptLines.push(
            '- **Strategic Discussion:** `{"type": "message", "content": "Based on yesterday\'s events, I suspect [player] because [reasoning]. What do others think?"}` (**SHARE SUSPICIONS & BUILD CASES!**)'
          );
        }
      }
      promptLines.push(
        '- **General Message:** `{"type": "message", "content": "Your strategic message here..."}` (**ENGAGE ACTIVELY IN CONVERSATION!**)'
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

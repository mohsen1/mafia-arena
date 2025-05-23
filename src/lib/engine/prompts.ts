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
 */
export function getPersonaGenerationPrompt(themeDescription: string, language?: string): string {
  const languageInstruction = language && language !== 'en' 
    ? `\n\nIMPORTANT: Generate the persona content (name, backstory, personalityTraits) in ${language}. Use natural, authentic ${language} text that fits the theme.`
    : '';
    
  return dedent`
    You are a creative writer tasked with generating a character persona for a text-based Mafia game.
    The game's theme is: "${themeDescription}"${languageInstruction}

    Please create a compelling and distinct persona that fits this theme.
    Strive for originality and avoid generic names (like Bob, Jane) or stereotypes unless they are uniquely twisted for the theme.
    Your response MUST be a single, valid JSON object containing the following fields:
    - name: string (The character's full name, make it unique and fitting)
    - backstory: string (A brief, one or two-sentence background for the character)
    - personalityTraits: string[] (An array of 3-5 descriptive personality traits, e.g., ["Observant", "Quiet", "Cunning"])

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
        - You MUST communicate in the language specified in the game state (see "Language" in your game state).
        - ALL your messages, thoughts, and reasoning should be in that language.
        - Stay true to your persona while using the specified language naturally.

        **Game Theme:** The game master will provide the current theme (e.g., UK Village 1900s).

        **Your Persona:** You will be given a persona (name, backstory, traits). Embody this persona in
        your messages and actions.

        **Round 1 Introductions:** During the first Day phase, you MUST introduce yourself to the group
        in character.

        **General Strategy & Secrecy:**
        - Stay in character based on your assigned persona!
        - **DO NOT REVEAL YOUR ROLE** (Mafia, Doctor, Seer, Villager) unless it is strategically
          critical and fits your persona.
        - Act like your persona would. Avoid suspicious behavior if you are Mafia (unless your persona is
          naturally suspicious!).
        - Pay attention to player messages, votes, and lack of activity to deduce roles.
        - Use your actions strategically to help your team, considering how your persona would act.
        - Make the conversation lively! Challenge others, defend yourself, but stay in character.

        **Game Rules:**
        - Players are secretly assigned roles: Mafia, Villager, Doctor, Seer.
        - Mafia win if their numbers are >= Town (Villagers, Doctor, Seer). Town wins if all Mafia are
          eliminated.
        - Game alternates Day and Night phases.
        - Day: Discuss suspicions, then vote to execute one player. Majority vote needed.
        - Night: Mafia first has a private discussion phase (use \`message\`!) to coordinate, then a voting phase (
          \`mafiaKill\`) to secretly choose a target. Doctor secretly votes to save one player (
          \`doctorSave\` prevents kill). Seer secretly investigates one player (\`seerInvestigate\`) to 
          learn their allegiance (Mafia or Town).

        **Role-Specific Hints (Apply within your Persona):**
        - **Mafia:** Your goal is to eliminate Town members. **Night Strategy:** At night, you will have two steps:
          1.  **Discussion Phase:** Use the \`message\` action to talk privately with your fellow Mafia.
              Discuss potential targets, strategy, and coordinate your kill vote. This is crucial for success!
          2.  **Voting Phase:** After discussion, use the \`mafiaKill\` action to cast your vote for a target.
              A consensus is preferred. You can target any living player, but usually Town members.
              Choosing \`noAction\` during the vote is possible but usually counter-productive.
          **Day Strategy:** Blend in using your persona. Avoid suspicion. Deflect blame. Coordinate subtle signals
          if possible, but prioritize secrecy.
        - **Villager:** Actively participate in discussions as your persona. Share suspicions based on
          behavior/votes. Accuse players you suspect and explain why (in character). Vote decisively.
        - **Doctor:** Saving is powerful. Protect valuable Town members or those likely targeted, perhaps
          influenced by your persona's relationships or judgments. Avoid saving the same person every
          night without reason.
        - **Seer:** Your investigation is crucial. Use the information! Convince the Town to vote out
          Mafia (perhaps hinting or revealing strategically, fitting your persona). Defend known Town
          members. Avoid investigating the same person repeatedly.

        **Your Task:** Based on the game state, your role, your persona, and allowed actions, decide
        your action.

        **Output Format:** Respond ONLY with a valid JSON object representing your action. Do NOT include
        any other text, explanations, or markdown formatting.
        Valid Actions (based on phase and role):
        - { "type": "message", "content": "your message text (in character)" } (Day Discussion / Introduction)
        - { "type": "vote", "targetPlayerId": "player-id-string" | null } (Day Vote - Use null to
        abstain, but voting is encouraged!)
        - { "type": "mafiaKill", "targetPlayerId": "player-id-string" } (Night, Mafia only - target
        any living player)
        - { "type": "doctorSave", "targetPlayerId": "player-id-string" | null } (Night, Doctor only -
          null for no save)
        - { "type": "seerInvestigate", "targetPlayerId": "player-id-string" | null } (Night, Seer only -
          null for no investigation, don't investigate yourself)
        - { "type": "noAction" } (Use only if truly no other action is appropriate or allowed)

        Player IDs are strings like "player-1-name". Ensure targetPlayerId is a valid ID from the alive
        players list when required.
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
    promptLines.push(`**Current Game State:**`);
    promptLines.push(`- Round: ${currentGameState.round}`);
    promptLines.push(`- Phase: ${currentGameState.phase}`);
    promptLines.push(`- Theme: ${currentGameState.themeName || 'Unknown'}`);
    promptLines.push(`- Language: ${currentGameState.language || 'en'}`);

    // Your Identity
    promptLines.push(`\n**Your Identity:**`);
    promptLines.push(`- Player ID: ${currentGameState.self.id}`);
    promptLines.push(`- Player Name: ${currentGameState.self.name}`);
    promptLines.push(`- Your Role: ${currentGameState.self.role}`);
    promptLines.push(`- Your Allegiance: ${currentGameState.self.allegiance}`);
    // Include generated persona details if available
    if (currentGameState.self.persona) {
        promptLines.push(`\n**Your Persona:**`);
        promptLines.push(`- Name: ${currentGameState.self.persona.name}`); // Usually matches player name, but good to confirm
        promptLines.push(`- Backstory: ${currentGameState.self.persona.backstory}`);
        promptLines.push(`- Traits: ${currentGameState.self.persona.personalityTraits.join(', ')}`);
    } else if (currentGameState.self.personaDescription) {
        // Fallback for manually assigned persona descriptions
        promptLines.push(`- Your Persona: ${currentGameState.self.personaDescription}`);
    }

    // Known Information (Role Specific)
    if (currentGameState.self.isMafia && currentGameState.mafiaPlayerIds) {
        promptLines.push(`\n**Mafia Team:**`);
        const mafiaNames = currentGameState.mafiaPlayerIds
            .map((id: PlayerId) => {
                const player = currentGameState.players.find((p: PromptPlayerInfo) => p.id === id);
                return player ? `${player.name} (${id})` : id;
            })
            .join(', ');
        promptLines.push(`- Your fellow Mafia members are: ${mafiaNames}`);
    }
    if (currentGameState.seerResults && currentGameState.seerResults.size > 0) {
        promptLines.push(`\n**Seer Investigations:**`);
        currentGameState.seerResults.forEach((result: { isMafia: boolean }, targetId: PlayerId) => {
            const targetName = currentGameState.players.find((p: PromptPlayerInfo) => p.id === targetId)?.name || targetId;
            promptLines.push(`- You investigated ${targetName}: They are ${result.isMafia ? 'Mafia' : 'Not Mafia'}.`);
        });
    }

    // Player List - Use Array methods now
    const alivePlayersList = currentGameState.players
        .filter((p: PromptPlayerInfo) => currentGameState.alivePlayerIds.includes(p.id))
        .map((p: PromptPlayerInfo) => 
            `- ${p.name} (${p.id})${p.id === currentGameState.self.id ? ' (You)' : ''}${!currentGameState.alivePlayerIds.includes(p.id) ? ' [DEAD]' : ''}`
        )
        .join('\n');
    
    const alivePlayerIdsString = currentGameState.alivePlayerIds.join(', ');

    promptLines.push(`\n**Players (${currentGameState.players.length} total, ${currentGameState.alivePlayerIds.length} alive):**`);
    promptLines.push(alivePlayersList);
    promptLines.push(`\n(Alive Player IDs: ${alivePlayerIdsString})`);

    // Recent Messages (Public)
    if (currentGameState.messages && currentGameState.messages.length > 0) {
        promptLines.push(`\n**Recent Public Messages (Last ${MAX_MESSAGES_IN_PROMPT}):**`);
        currentGameState.messages
            .slice(-MAX_MESSAGES_IN_PROMPT)
            .forEach((msg: IMessage) => {
                 const senderName = currentGameState.players.find((p: PromptPlayerInfo) => p.id === msg.senderId)?.name || msg.senderId || 'SYSTEM';
                 promptLines.push(`- ${senderName}: ${msg.content}`);
            });
    } else {
        promptLines.push("\n**Recent Public Messages:** None");
    }

    // Game History / Memory - Removed memory.summary access
    if (currentGameState.memory) {
        promptLines.push(`\n**Your Memory / Game History Summary:**`);
        if (Object.keys(currentGameState.memory).length > 0) {
             promptLines.push("- *You have some memories recorded.*");
        } else {
             promptLines.push("- *Your memory is clear.*");
        }
    }

    // Allowed Actions
    promptLines.push(`\n**Your Turn:**`);
    if (allowedActions && allowedActions.length > 0) {
        promptLines.push(`You must choose one of the following actions: ${allowedActions.join(', ')}.`);
        promptLines.push("Provide your action as a JSON object matching the examples below.");

        // Action Examples (customize based on phase/role)
        promptLines.push(`\n**Action Format Examples:**`);
        if (allowedActions.includes('message')) {
            promptLines.push('- Speak: `{"type": "message", "content": "Your message here..."}`');
        }
        if (allowedActions.includes('vote')) {
            promptLines.push('- Vote: `{"type": "vote", "targetPlayerId": "player-id-to-vote-for"}`');
        }
        if (allowedActions.includes('mafiaKill')) {
            promptLines.push('- Mafia Kill: `{"type": "mafiaKill", "targetPlayerId": "player-id-to-kill"}`');
        }
        if (allowedActions.includes('doctorSave')) {
            promptLines.push('- Doctor Save: `{"type": "doctorSave", "targetPlayerId": "player-id-to-save"}`');
        }
        if (allowedActions.includes('seerInvestigate')) {
            promptLines.push('- Seer Investigate: `{"type": "seerInvestigate", "targetPlayerId": "player-id-to-investigate"}`');
        }
        promptLines.push('- Abstain/No Action: `{"type": "noAction"}` (or `{"type": "vote", "targetPlayerId": null}` for voting)');

        promptLines.push(`\n**Important:** Respond ONLY with the JSON object for your chosen action. Include a brief 'reasoning' field within the JSON if possible, explaining your choice concisely.`);

    } else {
        promptLines.push("No specific actions are available or required right now.");
    }

    return promptLines.join('\n');
}
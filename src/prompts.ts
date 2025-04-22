import type { PlayerAction } from './interfaces/IAgent';
import type { RoleName } from './interfaces/IRole';
import type { Persona } from './interfaces/Theme';
import type { AgentMemory } from './interfaces/AgentMemory'; // Import AgentMemory
import type { IMessage } from './interfaces/IMessage'; // Import IMessage

/**
 * Generates the system prompt explaining the game rules and desired output format.
 */
export function getSystemPrompt(): string {
     return `You are an AI player in a text-based Mafia game (also known as Werewolf), playing a specific persona.
Your goal is to help your team (Mafia or Town) win while staying in character.

**Game Theme:** The game master will provide the current theme (e.g., UK Village 1900s).

**Your Persona:** You will be given a persona (name, backstory, traits). Embody this persona in your messages and actions.

**Round 1 Introductions:** During the first Day phase, you MUST introduce yourself to the group in character.

**General Strategy & Secrecy:**
- Stay in character based on your assigned persona!
- **DO NOT REVEAL YOUR ROLE** (Mafia, Doctor, Seer, Villager) unless it is strategically critical and fits your persona.
- Act like your persona would. Avoid suspicious behavior if you are Mafia (unless your persona is naturally suspicious!).
- Pay attention to player messages, votes, and lack of activity to deduce roles.
- Use your actions strategically to help your team, considering how your persona would act.
- Make the conversation lively! Challenge others, defend yourself, but stay in character.

**Game Rules:**
- Players are secretly assigned roles: Mafia, Villager, Doctor, Seer.
- Mafia win if their numbers are >= Town (Villagers, Doctor, Seer). Town wins if all Mafia are eliminated.
- Game alternates Day and Night phases.
- Day: Discuss suspicions, then vote to execute one player. Majority vote needed.
- Night: Mafia secretly votes to kill one player. Doctor secretly votes to save one player (save prevents kill). Seer secretly investigates one player to learn their allegiance (Mafia or Town).

**Role-Specific Hints (Apply within your Persona):**
- **Mafia:** Blend in using your persona. Deflect suspicion. Create doubt about others. Don't be afraid to accuse town members to misdirect. Target key roles like Seer or Doctor if you identify them. Use night chat (message action) to coordinate kills if applicable (though you act individually here).
- **Villager:** Actively participate in discussions as your persona. Share suspicions based on behavior/votes. Accuse players you suspect and explain why (in character). Vote decisively.
- **Doctor:** Saving is powerful. Protect valuable Town members or those likely targeted, perhaps influenced by your persona's relationships or judgments. Avoid saving the same person every night without reason.
- **Seer:** Your investigation is crucial. Use the information! Convince the Town to vote out Mafia (perhaps hinting or revealing strategically, fitting your persona). Defend known Town members. Avoid investigating the same person repeatedly.

**Your Task:** Based on the game state, your role, your persona, and allowed actions, decide your action.

**Output Format:** Respond ONLY with a valid JSON object representing your action. Do NOT include any other text, explanations, or markdown formatting.
Valid Actions (based on phase and role):
- { "type": "message", "content": "your message text (in character)" } (Day Discussion / Introduction)
- { "type": "vote", "targetPlayerId": "player-id-string" | null } (Day Vote - Use null to abstain, but voting is encouraged!)
- { "type": "mafiaKill", "targetPlayerId": "player-id-string" } (Night, Mafia only - target a non-Mafia player)
- { "type": "doctorSave", "targetPlayerId": "player-id-string" | null } (Night, Doctor only - null for no save)
- { "type": "seerInvestigate", "targetPlayerId": "player-id-string" | null } (Night, Seer only - null for no investigation, don't investigate yourself)
- { "type": "noAction" } (Use only if truly no other action is appropriate or allowed)

Player IDs are strings like "player-1-name". Ensure targetPlayerId is a valid ID from the alive players list when required.`;
}

/**
 * Generates the user prompt containing the current game state and request for action.
 * @param currentGameState A simplified view of the game state (includes memory).
 * @param allowedActions The actions the agent is allowed to perform.
 */
export function getUserPrompt(currentGameState: any, allowedActions?: PlayerAction['type'][]): string {
    const memory: AgentMemory = currentGameState.memory; // Extract memory

    let prompt = `Current Game State:
Theme: ${currentGameState.themeName || 'Default'}
Round: ${currentGameState.round}, Phase: ${currentGameState.phase}, Language: ${currentGameState.language}
`;

    // Add Persona Info
    if (currentGameState.self?.persona) {
        const p = currentGameState.self.persona;
        prompt += `Your Persona: ${p.name} (${p.personalityTraits.join(', ')}). Backstory: ${p.backstory}\n`;
    }

    prompt += `Your Info (Self Role): ${JSON.stringify({ role: currentGameState.self.role, isMafia: currentGameState.self.isMafia }) }\n`;
    prompt += `Alive Players: ${currentGameState.alivePlayerIds.join(', ')}\n`;
    prompt += `All Player Status: ${JSON.stringify(currentGameState.players)}\n`;

    if (currentGameState.mafiaPlayerIds) {
        prompt += `Known Mafia Members: ${currentGameState.mafiaPlayerIds.join(', ')}\n`;
    }

    // --- Format Memory --- 
    prompt += `\n--- Your Memory ---\n`;

    // Add Seer results from memory
    if (memory.investigationResults.length > 0) {
        prompt += `Your Investigation Results:\n`;
        memory.investigationResults.forEach(res => {
             const target = currentGameState.players.find((p: any) => p.id === res.targetId);
             const targetName = target ? target.name : res.targetId;
             prompt += `- Round ${res.round}: Investigated ${targetName} (${res.targetId}) - Result: ${res.allegiance}\n`;
        });
    }

    // Add Past Vote History from memory
    if (memory.voteHistory.length > 0) {
        prompt += `Previous Day Voting History:\n`;
        memory.voteHistory.forEach(voteRecord => {
            prompt += ` Round ${voteRecord.round} Votes:\n`;
            if (voteRecord.votes.size === 0) {
                 prompt += `  (No votes cast)\n`;
            } else {
                 for (const [voterId, targetId] of voteRecord.votes.entries()) {
                    const voterName = currentGameState.players.find((p: any) => p.id === voterId)?.name ?? voterId;
                    const targetName = targetId ? (currentGameState.players.find((p: any) => p.id === targetId)?.name ?? targetId) : 'Abstain';
                    prompt += `  - ${voterName} voted for ${targetName}\n`;
                 }
            }
        });
    }

    // Add Past Kill History from memory
     if (memory.killHistory.length > 0) {
        prompt += `Previous Night Kill History:\n`;
        memory.killHistory.forEach(killRecord => {
            const targetName = killRecord.killedPlayerId ? (currentGameState.players.find((p: any) => p.id === killRecord.killedPlayerId)?.name ?? killRecord.killedPlayerId) : 'No one';
            prompt += `- Round ${killRecord.round}: ${targetName} was killed.\n`;
        });
    }

    // Add Full Conversation History from memory
    if (memory.messageHistory && memory.messageHistory.length > 0) {
        prompt += `\nFull Conversation History (Visible to You):\n`;
        memory.messageHistory.forEach((msg: IMessage) => {
            // Add visibility prefix for non-public messages if needed
            const visibilityPrefix = msg.visibility === 'Mafia' ? '[MAFIA ONLY] ' : '';
            prompt += `[R${msg.round} ${msg.phase}] ${visibilityPrefix}${msg.senderName}: ${msg.content}\n`;
        });
    } else {
        prompt += `\nNo conversation history visible yet.\n`;
    }
    prompt += `--- End Memory --- \n`;

    prompt += `\nAllowed Actions: ${allowedActions ? allowedActions.join(', ') : 'None (likely noAction expected)'}\n`;
    
    // Special instruction for Round 1
    if (currentGameState.round === 1 && currentGameState.phase === 'Day' && allowedActions?.includes('message')) {
        prompt += `\n**It's Round 1 Introductions! Your ONLY goal this turn is to introduce yourself based on your Persona.** Respond with a JSON message action like: { "type": "message", "content": "Your introduction here..." }`;
    } else {
        prompt += `Choose your action based on your role, persona, memory (investigations, votes, kills, conversation), current game state, and allowed actions. Remember to output ONLY the action JSON object.`;
    }

    return prompt;
}
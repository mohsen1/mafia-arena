import type { PlayerAction } from './interfaces/IAgent';
import type { RoleName } from './interfaces/IRole';

/**
 * Generates the system prompt explaining the game rules and desired output format.
 */
export function getSystemPrompt(): string {
     return `You are an AI player in a text-based Mafia game (also known as Werewolf).
Your goal is to help your team (Mafia or Town) win.

**General Strategy & Secrecy:**
- **DO NOT REVEAL YOUR ROLE** unless it is strategically critical (e.g., a Seer revealing late game to confirm someone).
- Act like a normal player. Engage in discussion! Avoid suspicious behavior if you are Mafia.
- Pay attention to player messages, votes, and lack of activity to deduce roles.
- Use your actions strategically to help your team. Make reasoned accusations during the day to drive discussion and uncover lies.
- Make the conversation lively! Challenge others, defend yourself, but stay in character.

**Game Rules:**
- Players are secretly assigned roles: Mafia, Villager, Doctor, Seer.
- Mafia win if their numbers are >= Town (Villagers, Doctor, Seer). Town wins if all Mafia are eliminated.
- Game alternates Day and Night phases.
- Day: Discuss suspicions, then vote to execute one player. Majority vote needed.
- Night: Mafia secretly votes to kill one player. Doctor secretly votes to save one player (save prevents kill). Seer secretly investigates one player to learn their allegiance (Mafia or Town).

**Role-Specific Hints:**
- **Mafia:** Blend in during the day. Deflect suspicion. Create doubt about others. Don't be afraid to accuse town members to misdirect. Target key roles like Seer or Doctor if you identify them. Coordinate kills if applicable (though you act individually here).
- **Villager:** Actively participate in discussions! Share suspicions based on behavior, votes, or contradictions. Accuse players you suspect and explain why. Vote decisively to eliminate suspected Mafia.
- **Doctor:** Saving is powerful. Try to protect valuable Town members (like a known Seer) or those likely to be targeted by Mafia. Avoid saving the same person every night unless you have a strong reason.
- **Seer:** Your investigation is crucial. Use the information! If you find Mafia, convince the Town to vote them out (perhaps by hinting strongly or revealing strategically late game). If you find Town, defend them. Avoid investigating the same person repeatedly. Communicate your findings carefully.

**Your Task:** Based on the provided game state and allowed actions, decide your action.

**Output Format:** Respond ONLY with a valid JSON object representing your action. Do NOT include any other text, explanations, or markdown formatting.
Valid Actions (based on phase and role):
- { "type": "message", "content": "your message text" } (Day Discussion)
- { "type": "vote", "targetPlayerId": "player-id-string" | null } (Day Vote - Use null to abstain, but voting is encouraged!)
- { "type": "mafiaKill", "targetPlayerId": "player-id-string" } (Night, Mafia only - target a non-Mafia player)
- { "type": "doctorSave", "targetPlayerId": "player-id-string" | null } (Night, Doctor only - null for no save)
- { "type": "seerInvestigate", "targetPlayerId": "player-id-string" | null } (Night, Seer only - null for no investigation, don't investigate yourself)
- { "type": "noAction" } (Use only if truly no other action is appropriate or allowed)

Player IDs are strings like "player-1-name". Ensure targetPlayerId is a valid ID from the alive players list when required.`;
}

/**
 * Generates the user prompt containing the current game state and request for action.
 * @param currentGameState A simplified view of the game state.
 * @param allowedActions The actions the agent is allowed to perform.
 */
export function getUserPrompt(currentGameState: any, allowedActions?: PlayerAction['type'][]): string {
    let prompt = `Current Game State:
Round: ${currentGameState.round}, Phase: ${currentGameState.phase}, Language: ${currentGameState.language}
Your Info (Self): ${JSON.stringify(currentGameState.self)}
Alive Players: ${currentGameState.alivePlayerIds.join(', ')}
All Player Status: ${JSON.stringify(currentGameState.players)}
`;

    if (currentGameState.mafiaPlayerIds) {
        prompt += `Known Mafia Members: ${currentGameState.mafiaPlayerIds.join(', ')}\n`;
    }

    // Add Seer result if available
    if (currentGameState.lastNightInvestigationResult) {
        const target = currentGameState.players.find((p: any) => p.id === currentGameState.lastNightInvestigationResult.targetId);
        const targetName = target ? target.name : currentGameState.lastNightInvestigationResult.targetId;
        prompt += `Your Last Night Investigation Result: You investigated ${targetName} (${currentGameState.lastNightInvestigationResult.targetId}) and found their allegiance is ${currentGameState.lastNightInvestigationResult.allegiance}.\n`;
    }

    // Add Previous Day's Vote Results
    if (currentGameState.previousDayVoteResults && currentGameState.previousDayVoteResults.size > 0) {
        prompt += `\nPrevious Day's Voting Results:\n`;
        for (const [voterId, targetId] of currentGameState.previousDayVoteResults.entries()) {
            const voterName = currentGameState.players.find((p: any) => p.id === voterId)?.name ?? voterId;
            const targetName = targetId ? (currentGameState.players.find((p: any) => p.id === targetId)?.name ?? targetId) : 'Abstain';
            prompt += `- ${voterName} voted for ${targetName}\n`;
        }
    }

    // Add Conversation History
    if (currentGameState.conversationHistory && currentGameState.conversationHistory.length > 0) {
        prompt += `\nRecent Conversation History (up to ${currentGameState.conversationHistory.length} messages):\n`;
        currentGameState.conversationHistory.forEach((msg: any) => {
            // Simple formatting, adjust as needed
            prompt += `[R${msg.round} ${msg.phase}] ${msg.senderName}: ${msg.content}\n`;
        });
    }

    prompt += `\nAllowed Actions: ${allowedActions ? allowedActions.join(', ') : 'None (likely noAction expected)'}\n`;
    prompt += `Choose your action based on your role (${currentGameState.self.role}), the game state, previous votes, recent conversation, and the allowed actions. Remember to output ONLY the action JSON object.`;

    return prompt;
} 
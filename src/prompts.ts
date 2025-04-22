import type { PlayerAction } from './interfaces/IAgent';
import type { RoleName } from './interfaces/IRole';
import type { Persona } from './interfaces/Theme';
import type { AgentMemory } from './interfaces/AgentMemory'; // Import AgentMemory
import type { IMessage } from './interfaces/IMessage'; // Import IMessage
import dedent from 'dedent'; // Import dedent

/**
 * Generates the system prompt explaining the game rules and desired output format.
 */
export function getSystemPrompt(): string {
    // Use dedent to remove leading whitespace from the multi-line string
    return dedent`
        You are an AI player in a text-based Mafia game (also known as Werewolf), playing a specific persona.
        Your goal is to help your team (Mafia or Town) win while staying in character.

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
        - Night: Mafia secretly votes to kill one player. Doctor secretly votes to save one player
          (save prevents kill). Seer secretly investigates one player to learn their allegiance
          (Mafia or Town).

        **Role-Specific Hints (Apply within your Persona):**
        - **Mafia:** Your goal is to eliminate threats to the Mafia. At night, you can choose a target\n          using the \`mafiaKill\` action (this can be any living player, even another Mafia if\n          strategically necessary, though usually you target Town members). You are strongly\n          encouraged to use the \`message\` action first to discuss strategy and targets with fellow\n          Mafia (remember, messages are only seen by others in the next state). Submitting a\n          \`mafiaKill\` action is usually expected, but choosing \`noAction\` is possible if strategically\n          justified (e.g., to avoid detection). Blend in during the day using your persona.
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
        - { "type": "vote", "targetPlayerId": "player-id-string" | null } (Day Vote - Use null to\n          abstain, but voting is encouraged!)
        - { "type": "mafiaKill", "targetPlayerId": "player-id-string" } (Night, Mafia only - target\n          any living player)
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
export function getUserPrompt(currentGameState: any, allowedActions?: PlayerAction['type'][]): string {
    const memory: AgentMemory = currentGameState.memory;

    // Use dedent for the main prompt construction parts
    let prompt = dedent`
        Current Game State:
        Theme: ${currentGameState.themeName || 'Default'}
        Round: ${currentGameState.round}, Phase: ${currentGameState.phase}, Language: ${currentGameState.language}
    `;

    if (currentGameState.self?.persona) {
        const p = currentGameState.self.persona;
        prompt += dedent`

            Your Persona: ${p.name} (${p.personalityTraits.join(', ')}).
            Backstory: ${p.backstory}
        `;
    }

    prompt += dedent`

        Your Info (Self Role): ${JSON.stringify({ role: currentGameState.self.role, isMafia: currentGameState.self.isMafia }) }
        Alive Players: ${currentGameState.alivePlayerIds.join(', ')}
        All Player Status: ${JSON.stringify(currentGameState.players)}
    `;

    if (currentGameState.mafiaPlayerIds) {
        prompt += dedent`

            Known Mafia Members: ${currentGameState.mafiaPlayerIds.join(', ')}
        `; // Newline added below
    }

    // --- Format Memory --- 
    prompt += dedent`

        --- Your Memory ---
    `; // Add spacing

    if (memory.investigationResults.length > 0) {
        prompt += dedent`

            Your Investigation Results:
        `;
        memory.investigationResults.forEach(res => {
            const target = currentGameState.players.find((p: any) => p.id === res.targetId);
            const targetName = target ? target.name : res.targetId;
            prompt += dedent`
                - Round ${res.round}: Investigated ${targetName} (${res.targetId}) - Result: ${res.allegiance}
            `;
        });
    }

    if (memory.voteHistory.length > 0) {
        prompt += dedent`

            Previous Day Voting History:
        `;
        memory.voteHistory.forEach(voteRecord => {
            prompt += dedent`

                Round ${voteRecord.round} Votes:
            `;
            if (voteRecord.votes.size === 0) {
                prompt += dedent`

                    (No votes cast)
                `;
            } else {
                for (const [voterId, targetId] of voteRecord.votes.entries()) {
                    const voterName = currentGameState.players.find((p: any) => p.id === voterId)?.name ?? voterId;
                    const targetName = targetId ? (currentGameState.players.find((p: any) => p.id === targetId)?.name ?? targetId) : 'Abstain';
                    prompt += dedent`

                        - ${voterName} voted for ${targetName}
                    `;
                }
            }
        });
    }

    if (memory.killHistory.length > 0) {
        prompt += dedent`

            Previous Night Kill History:
        `;
        memory.killHistory.forEach(killRecord => {
            const targetName = killRecord.killedPlayerId ?
                (currentGameState.players.find((p: any) => p.id === killRecord.killedPlayerId)?.name ?? killRecord.killedPlayerId)
                : 'No one';
            prompt += dedent`

                - Round ${killRecord.round}: ${targetName} was killed.
            `;
        });
    }

    if (memory.messageHistory && memory.messageHistory.length > 0) {
        prompt += dedent`

            Full Conversation History (Visible to You):
        `;
        memory.messageHistory.forEach((msg: IMessage) => {
            const visibilityPrefix = msg.visibility === 'Mafia' ? '[MAFIA ONLY] ' : '';
            prompt += dedent`

                [R${msg.round} ${msg.phase}] ${visibilityPrefix}${msg.senderName}: ${msg.content}
            `;
        });
    } else {
        prompt += dedent`

            No conversation history visible yet.
        `;
    }
    prompt += dedent`

        --- End Memory ---
    `;

    // Add Allowed Actions and Final Instruction
    prompt += dedent`

        Allowed Actions: ${allowedActions ? allowedActions.join(', ') : 'None (likely noAction expected)'}
    `;
    
    if (currentGameState.round === 1 && currentGameState.phase === 'Day' && allowedActions?.includes('message')) {
        prompt += dedent`

            **It's Round 1 Introductions! Your ONLY goal this turn is to introduce yourself based on your Persona.**
            Respond with a JSON message action like: { "type": "message", "content": "Your introduction here..." }
        `;
    } else {
        prompt += dedent`

            Choose your action based on your role, persona, memory (investigations, votes, kills, conversation),
            current game state, and allowed actions. Remember to output ONLY the action JSON object.
        `;
    }

    return prompt;
}
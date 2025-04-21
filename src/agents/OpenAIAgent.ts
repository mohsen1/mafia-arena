import { OpenAI } from 'openai';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { RoleName } from '../interfaces/IRole';
import * as dotenv from 'dotenv'; // Import dotenv

// Load environment variables from .env file
dotenv.config();
// Ensure API key and model are set in environment variables
if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
}
if (!process.env.OPENAI_MODEL) {
    console.warn("OPENAI_MODEL environment variable is not set. Using default 'gpt-4o-mini'.");
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL, // Optional: Defaults to OpenAI's base URL
});

const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export class OpenAIAgent implements IAgent {
    public playerId!: PlayerId; // Set by Game constructor

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        console.log(`[${this.playerId} - ${gameState.self.role}] Thinking...`);

        // Filter gameState for brevity and relevance if needed
        const relevantGameState = {
            round: gameState.round,
            phase: gameState.phase,
            self: gameState.self,
            alivePlayerIds: Array.from(gameState.alivePlayerIds),
            players: gameState.players.map(p => ({ id: p.id, name: p.name, status: p.status })),
            language: gameState.language,
            mafiaPlayerIds: gameState.self.isMafia ? Array.from(gameState.mafiaPlayerIds ?? []) : undefined,
        };

        const systemPrompt = this.buildSystemPrompt();
        const userPrompt = this.buildUserPrompt(relevantGameState, allowedActions);

        try {
            const response = await openai.chat.completions.create({
                model: model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.7, // Adjust for creativity vs consistency
                max_tokens: 150,
                response_format: { type: "json_object" } // Ensure JSON output if model supports it
            });

            const responseContent = response.choices[0]?.message?.content;
            if (!responseContent) {
                console.error(`[${this.playerId}] OpenAI response was empty.`);
                return { type: 'noAction' };
            }

            // Parse and validate the action
            let action: PlayerAction;
            try {
                 // The response should *only* be the JSON object
                action = JSON.parse(responseContent.trim()) as PlayerAction;
            } catch (parseError) {
                 console.error(`[${this.playerId}] Failed to parse JSON response: ${responseContent}`, parseError);
                return { type: 'noAction' };
            }

            // Validate action type
            if (!allowedActions || allowedActions.length === 0) {
                // If no actions are specified, assume noAction is the only valid one (or handle error)
                if (action.type !== 'noAction') {
                    console.warn(`[${this.playerId}] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                    return { type: 'noAction' };
                }
            } else if (!allowedActions.includes(action.type)) {
                 console.warn(`[${this.playerId}] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            // TODO: Add more specific validation based on action type (e.g., targetPlayerId exists and is alive)

            console.log(`[${this.playerId} - ${gameState.self.role}] Chose action:`, action);
            return action;

        } catch (error) {
            console.error(`[${this.playerId}] Error calling OpenAI API:`, error);
            return { type: 'noAction' }; // Fallback on API error
        }
    }

    private buildSystemPrompt(): string {
        // Explain the game, roles, and expected JSON output format
        return `You are an AI player in a text-based Mafia game (also known as Werewolf).
Game Rules:
- Players are secretly assigned roles: Mafia, Villager, Doctor, Seer.
- Mafia win if their numbers are >= Town (Villagers, Doctor, Seer). Town wins if all Mafia are eliminated.
- Game alternates Day and Night phases.
- Day: Discuss, then vote to execute one player. Majority vote needed.
- Night: Mafia secretly votes to kill one player. Doctor secretly votes to save one player (save prevents kill). Seer secretly investigates one player to learn their allegiance (Mafia or Town).
Roles:
- Mafia: Knows fellow Mafia. Kills at night. Goal: Eliminate Town.
- Villager: Basic Town member. Goal: Eliminate Mafia.
- Doctor: Town member. Can save one player each night. Goal: Eliminate Mafia.
- Seer: Town member. Can investigate one player each night. Goal: Eliminate Mafia.
Your Task: Based on the provided game state and allowed actions, decide your action.
Output Format: Respond ONLY with a valid JSON object representing your action. Do NOT include any other text, explanations, or markdown formatting.
Action Types:
- { "type": "message", "content": "your message" } (Day Discussion)
- { "type": "vote", "targetPlayerId": "player-id-string" | null } (Day Vote, null to abstain)
- { "type": "mafiaKill", "targetPlayerId": "player-id-string" } (Night, Mafia only)
- { "type": "doctorSave", "targetPlayerId": "player-id-string" | null } (Night, Doctor only, null for no save)
- { "type": "seerInvestigate", "targetPlayerId": "player-id-string" | null } (Night, Seer only, null for no investigation)
- { "type": "noAction" } (If no other action is applicable or allowed)
Player IDs are strings like "player-1-name". Ensure targetPlayerId is a valid ID from the alive players list when required.`;
    }

    private buildUserPrompt(currentGameState: any, allowedActions?: PlayerAction['type'][]): string {
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
             const target = currentGameState.players.find((p:any) => p.id === currentGameState.lastNightInvestigationResult.targetId);
             const targetName = target ? target.name : currentGameState.lastNightInvestigationResult.targetId;
            prompt += `Your Last Night Investigation Result: You investigated ${targetName} (${currentGameState.lastNightInvestigationResult.targetId}) and found their allegiance is ${currentGameState.lastNightInvestigationResult.allegiance}.\n`;
        }

        prompt += `Allowed Actions: ${allowedActions ? allowedActions.join(', ') : 'None (likely noAction expected)'}\n`;
        prompt += `Choose your action based on your role (${currentGameState.self.role}), the game state, and the allowed actions. Remember to output ONLY the action JSON object.`;

        return prompt;
    }
} 
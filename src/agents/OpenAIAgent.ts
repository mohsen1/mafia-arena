import { OpenAI } from 'openai';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import * as dotenv from 'dotenv'; // Import dotenv
import { getSystemPrompt, getUserPrompt } from '../prompts'; // Import prompt functions
import type { Persona } from '../interfaces/Theme'; // Import Persona
import debug from 'debug'; // Import debug

// Create a specific debugger instance for this agent
const log = debug('mafia:agent:openai');

// Load environment variables from .env file
dotenv.config();
// Ensure API key and model are set in environment variables
if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is not set.");
}
if (!process.env.OPENAI_MODEL) {
    log(`WARN: OPENAI_MODEL environment variable is not set. Using default 'gpt-3.5-turbo'.`);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL, // Optional: Defaults to OpenAI's base URL
});

const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

export class OpenAIAgent implements IAgent {
    public playerId!: PlayerId; // Set by Game constructor
    public persona?: Persona; // Add persona property

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        log(`[${this.playerId} - ${gameState.self.role}] Thinking...`);

        // Pass the necessary parts of gameState, including the memory object, to the prompt function
        const promptInputState = {
            round: gameState.round,
            phase: gameState.phase,
            self: gameState.self,
            alivePlayerIds: Array.from(gameState.alivePlayerIds),
            players: gameState.players.map(p => ({ id: p.id, name: p.name, status: p.status })),
            language: gameState.language,
            mafiaPlayerIds: gameState.self.isMafia ? Array.from(gameState.mafiaPlayerIds ?? []) : undefined,
            themeName: gameState.themeName,
            memory: gameState.memory // Pass the whole memory object
        };

        const systemPrompt = getSystemPrompt();
        const userPrompt = getUserPrompt(promptInputState, allowedActions); // Pass the constructed state

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
                log(`ERROR: [${this.playerId}] OpenAI response was empty.`);
                return { type: 'noAction' };
            }

            // Parse and validate the action
            let action: PlayerAction;
            try {
                 // The response should *only* be the JSON object
                action = JSON.parse(responseContent.trim()) as PlayerAction;
            } catch (parseError) {
                 log(`ERROR: [${this.playerId}] Failed to parse JSON response: ${responseContent} %O`, parseError);
                return { type: 'noAction' };
            }

            // Validate action type
            if (!allowedActions || allowedActions.length === 0) {
                // If no actions are specified, assume noAction is the only valid one (or handle error)
                if (action.type !== 'noAction') {
                    log(`WARN: [${this.playerId}] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                    return { type: 'noAction' };
                }
            } else if (!allowedActions.includes(action.type)) {
                 log(`WARN: [${this.playerId}] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            // TODO: Add more specific validation based on action type (e.g., targetPlayerId exists and is alive)

            log(`[${this.playerId} - ${gameState.self.role}] Chose action: %o`, action); // Use %o for object formatting
            return action;

        } catch (error) {
            log(`ERROR: [${this.playerId}] Error calling OpenAI API: %O`, error); // Use %O for detailed error object
            return { type: 'noAction' }; // Fallback on API error
        }
    }
} 
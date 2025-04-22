import Anthropic from '@anthropic-ai/sdk';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { getSystemPrompt, getUserPrompt } from '../prompts'; // Import prompt functions
import type { Persona } from '../interfaces/Theme'; // Import Persona
import * as dotenv from 'dotenv'; // Import dotenv
import debug from 'debug'; // Import debug

// Create a specific debugger instance
const log = debug('mafia:agent:claude');

// Load environment variables from .env file
dotenv.config();

// Ensure API key is set in environment variables
if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
}

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Define the model to use (e.g., Claude 3 Sonnet or Opus)
// Consider making this configurable via environment variable ANTHROPIC_MODEL
const model = "claude-3-sonnet-20240229"; 

export class ClaudeAgent implements IAgent {
    public playerId!: PlayerId; // Set by Game constructor
    public persona?: Persona; // Add persona property

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        log(`[${this.playerId} - ${gameState.self.role} (Claude)] Thinking...`);

        // Pass the necessary parts of gameState, including the memory object
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
        const userPrompt = getUserPrompt(promptInputState, allowedActions); 

        try {
            const response = await anthropic.messages.create({
                model: model,
                system: systemPrompt,
                messages: [
                    { role: "user", content: userPrompt },
                    // Add an assistant prefill to encourage JSON output
                    { role: "assistant", content: "{" }
                ],
                temperature: 0.7, // Adjust for creativity vs consistency
                max_tokens: 200, // Allow slightly more tokens for JSON structure
                stop_sequences: ["}"], // Stop generation once JSON is likely complete
            });

            // Extract the response text (Claude might add the closing brace)
            let responseText = "";
            if (response.content.length > 0 && response.content[0].type === 'text') {
                 responseText = response.content[0].text;
            }

            // Construct the full JSON string
            const potentialJson = "{" + responseText + "}";

            if (!responseText) {
                log(`ERROR: [${this.playerId} (Claude)] API response was empty.`);
                return { type: 'noAction' };
            }

            // Parse and validate the action
            let action: PlayerAction;
            try {
                action = JSON.parse(potentialJson.trim()) as PlayerAction;
            } catch (parseError) {
                 log(`ERROR: [${this.playerId} (Claude)] Failed to parse JSON response: ${potentialJson} %O`, parseError);
                return { type: 'noAction' };
            }

            // Validate action type
            if (!allowedActions || allowedActions.length === 0) {
                if (action.type !== 'noAction') {
                    log(`WARN: [${this.playerId} (Claude)] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                    return { type: 'noAction' };
                }
            } else if (!allowedActions.includes(action.type)) {
                 log(`WARN: [${this.playerId} (Claude)] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            // TODO: Add more specific validation based on action type

            log(`[${this.playerId} - ${gameState.self.role} (Claude)] Chose action: %o`, action);
            return action;

        } catch (error) {
            log(`ERROR: [${this.playerId} (Claude)] Error calling Anthropic API: %O`, error);
            return { type: 'noAction' }; // Fallback on API error
        }
    }
} 
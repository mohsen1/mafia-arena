import Anthropic from '@anthropic-ai/sdk';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { getSystemPrompt, getUserPrompt } from '../prompts'; // Import prompt functions
import type { Persona } from '../interfaces/Theme'; // Import Persona

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
        console.log(`[${this.playerId} - ${gameState.self.role} (Claude)] Thinking...`);

        // Filter gameState for brevity and relevance
        const relevantGameState = {
            round: gameState.round,
            phase: gameState.phase,
            self: gameState.self,
            alivePlayerIds: Array.from(gameState.alivePlayerIds),
            players: gameState.players.map(p => ({ id: p.id, name: p.name, status: p.status })),
            language: gameState.language,
            mafiaPlayerIds: gameState.self.isMafia ? Array.from(gameState.mafiaPlayerIds ?? []) : undefined,
            lastNightInvestigationResult: gameState.lastNightInvestigationResult // Pass seer results
        };

        const systemPrompt = getSystemPrompt(); // Use imported function
        const userPrompt = getUserPrompt(relevantGameState, allowedActions); // Use imported function

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
                console.error(`[${this.playerId} (Claude)] API response was empty.`);
                return { type: 'noAction' };
            }

            // Parse and validate the action
            let action: PlayerAction;
            try {
                action = JSON.parse(potentialJson.trim()) as PlayerAction;
            } catch (parseError) {
                 console.error(`[${this.playerId} (Claude)] Failed to parse JSON response: ${potentialJson}`, parseError);
                return { type: 'noAction' };
            }

            // Validate action type
            if (!allowedActions || allowedActions.length === 0) {
                if (action.type !== 'noAction') {
                    console.warn(`[${this.playerId} (Claude)] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                    return { type: 'noAction' };
                }
            } else if (!allowedActions.includes(action.type)) {
                 console.warn(`[${this.playerId} (Claude)] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            // TODO: Add more specific validation based on action type

            console.log(`[${this.playerId} - ${gameState.self.role} (Claude)] Chose action:`, action);
            return action;

        } catch (error) {
            console.error(`[${this.playerId} (Claude)] Error calling Anthropic API:`, error);
            return { type: 'noAction' }; // Fallback on API error
        }
    }
} 
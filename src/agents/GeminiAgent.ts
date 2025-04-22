import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { getSystemPrompt, getUserPrompt } from '../prompts'; // Import prompt functions
import type { Persona } from '../interfaces/Theme'; // Import Persona

// Ensure API key is set in environment variables
if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define the model to use (e.g., gemini-1.5-flash)
// Consider making this configurable via environment variable GEMINI_MODEL
const modelName = "gemini-1.5-flash";

// Configure safety settings to be less restrictive for game context
// Adjust these as needed, but be aware of potential harmful content generation
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export class GeminiAgent implements IAgent {
    public playerId!: PlayerId; // Set by Game constructor
    public persona?: Persona; // Add persona property

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        console.log(`[${this.playerId} - ${gameState.self.role} (Gemini)] Thinking...`);

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

        // Gemini prefers the system prompt as part of the initial user message typically
        const systemPrompt = getSystemPrompt();
        const userPrompt = getUserPrompt(relevantGameState, allowedActions);
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        try {
            const model = genAI.getGenerativeModel({
                 model: modelName,
                 safetySettings,
                 // Specify JSON output mode if supported and desired
                 // generationConfig: { responseMimeType: "application/json" }
             });

            const result = await model.generateContent(fullPrompt);
            const response = result.response;
            const responseText = response.text();

            if (!responseText) {
                console.error(`[${this.playerId} (Gemini)] API response was empty.`);
                return { type: 'noAction' };
            }

            // Attempt to extract JSON from the response (Gemini might add markdown backticks)
            let potentialJson = responseText.trim();
            if (potentialJson.startsWith('```json')) {
                potentialJson = potentialJson.substring(7);
            }
            if (potentialJson.endsWith('```')) {
                potentialJson = potentialJson.substring(0, potentialJson.length - 3);
            }
            potentialJson = potentialJson.trim(); // Trim again after removing backticks

            // Parse and validate the action
            let action: PlayerAction;
            try {
                action = JSON.parse(potentialJson) as PlayerAction;
            } catch (parseError) {
                console.error(`[${this.playerId} (Gemini)] Failed to parse JSON response: ${potentialJson}`, parseError);
                return { type: 'noAction' };
            }

            // Validate action type
             if (!allowedActions || allowedActions.length === 0) {
                if (action.type !== 'noAction') {
                    console.warn(`[${this.playerId} (Gemini)] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                    return { type: 'noAction' };
                }
            } else if (!allowedActions.includes(action.type)) {
                 console.warn(`[${this.playerId} (Gemini)] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            // TODO: Add more specific validation based on action type

            console.log(`[${this.playerId} - ${gameState.self.role} (Gemini)] Chose action:`, action);
            return action;

        } catch (error) {
            console.error(`[${this.playerId} (Gemini)] Error calling Google Generative AI API:`, error);
            return { type: 'noAction' }; // Fallback on API error
        }
    }
} 
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { getSystemPrompt, getUserPrompt } from '../prompts'; // Import prompt functions
import type { Persona } from '../interfaces/Theme'; // Import Persona
import * as dotenv from 'dotenv'; // Import dotenv
import debug from 'debug'; // Import debug
import { RoleName, type Allegiance } from '../interfaces/IRole'; // Import RoleName and Allegiance
import type { AgentMemory, AIConversationLog } from '../interfaces/AgentMemory'; // Corrected import path

// Create a specific debugger instance
const log = debug('mafia:agent:gemini');

// Load environment variables from .env file
dotenv.config();    

// Ensure API key is set in environment variables
if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Define the model to use (e.g., gemini-1.5-flash)
// Consider making this configurable via environment variable GEMINI_MODEL
const defaultModelName = "gemini-1.5-flash"; // Default model

// Configure safety settings to be less restrictive for game context
// Adjust these as needed, but be aware of potential harmful content generation
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export class GeminiAgent implements IAgent {
    // public playerId!: PlayerId; // Removed: Set by Game constructor
    public persona?: Persona; // Add persona property
    private modelName: string; // Store the selected model name

    constructor(model?: string, persona?: Persona) { // Accept optional model and persona
        this.modelName = model || defaultModelName; // Use provided model or default
        this.persona = persona;
        log(`Initialized GeminiAgent with model: ${this.modelName}`);
    }

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        const agentIdForLog = `${gameState.self.id} - ${gameState.self.role}`;
        log(`[${agentIdForLog} (Gemini)] Thinking with model ${this.modelName}...`);

        // Determine allegiance
        const allegiance: Allegiance = gameState.self.role === RoleName.Mafia ? 'Mafia' : 'Town';

        // Prepare memory for prompt: Create a copy and replace AI logs with empty array
        const memoryForPrompt: AgentMemory = {
            ...gameState.memory,
            aiConversationLogs: [] // Replace with empty array for the prompt
        };

        // Prepare state for the prompt, converting Set to Array and adding allegiance
        const promptInputState = {
            round: gameState.round,
            phase: gameState.phase,
            self: {
                ...gameState.self, // Spread existing self properties
                allegiance: allegiance // Add the determined allegiance
            },
            alivePlayerIds: Array.from(gameState.alivePlayerIds), // Convert Set to Array here
            players: gameState.players.map(p => ({ id: p.id, name: p.name, status: p.status })),
            language: gameState.language,
            mafiaPlayerIds: gameState.self.isMafia ? Array.from(gameState.mafiaPlayerIds ?? []) : undefined,
            themeName: gameState.themeName,
            // Pass the filtered memory to the prompt generation
            memory: memoryForPrompt 
        };

        const systemPrompt = getSystemPrompt();
        // Pass the modified state with the array to getUserPrompt
        const userPrompt = getUserPrompt(promptInputState, allowedActions); 
        const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

        // Use original memory for logging the current AI conversation
        const memoryForLogging = gameState.memory;

        // TODO: Add logging for Gemini agent similar to OpenAI agent
        // const logEntry: Partial<AIConversationLog> = {
        //     round: gameState.round,
        //     phase: gameState.phase,
        //     timestamp: new Date(),
        //     model: this.modelName,
        //     prompt: { system: systemPrompt, user: userPrompt },
        //     response: { raw: null, parsedAction: null }
        // };

        try {
            const model = genAI.getGenerativeModel({
                 model: this.modelName,
                 safetySettings,
                 // Specify JSON output mode if supported and desired
                 // generationConfig: { responseMimeType: "application/json" }
             });

            const result = await model.generateContent(fullPrompt);
            const response = result.response;
            const responseText = response.text();

            if (!responseText) {
                log(`ERROR: [${agentIdForLog} (Gemini)] API response was empty.`);
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
                log(`ERROR: [${agentIdForLog} (Gemini)] Failed to parse JSON response: ${potentialJson} %O`, parseError);
                return { type: 'noAction' };
            }

            // Validate action type
             if (!allowedActions || allowedActions.length === 0) {
                if (action.type !== 'noAction') {
                    log(`WARN: [${agentIdForLog} (Gemini)] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                    return { type: 'noAction' };
                }
            } else if (!allowedActions.includes(action.type)) {
                 log(`WARN: [${agentIdForLog} (Gemini)] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            // TODO: Add more specific validation based on action type

            log(`[${agentIdForLog} (Gemini)] Chose action: %o`, action);
            return action;

        } catch (error) {
            log(`ERROR: [${agentIdForLog} (${this.modelName})] Error calling Google Generative AI API: %O`, error);
            return { type: 'noAction' }; // Fallback on API error
        }
    }
} 
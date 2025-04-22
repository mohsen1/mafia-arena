import type { IAgent } from '../interfaces/IAgent';
import type { PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import type { Persona } from '../interfaces/Theme';
import { Anthropic } from '@anthropic-ai/sdk'; // Ensure this is installed
import * as dotenv from 'dotenv'; // Import dotenv
import debug from 'debug'; // Import debug
import { getSystemPrompt, getUserPrompt } from '../prompts'; // Import prompt functions
import { RoleName, type Allegiance } from '../interfaces/IRole'; // Import RoleName and Allegiance

// Create a specific debugger instance
const log = debug('mafia:agent:claude');

// Load environment variables from .env file
dotenv.config();

// Initialize Anthropic client (outside the class to be shared potentially)
const apiKey = process.env.ANTHROPIC_API_KEY;
let anthropic: Anthropic | null = null;
if (apiKey) {
    anthropic = new Anthropic({ apiKey });
} else {
    log('WARN: ANTHROPIC_API_KEY environment variable not set. ClaudeAgent will not work.');
}

// Default model if not specified
const defaultModel = "claude-3-sonnet-20240229"; 

// Renamed from ClaudeAgentOld
export class ClaudeAgent implements IAgent {
    public playerId!: PlayerId; // Set by Game constructor
    public persona?: Persona; // Add persona property
    private modelName: string; // Store the selected model name

    constructor(model?: string) { // Accept optional model
        this.modelName = model || defaultModel; // Use provided model or default
        log(`Initialized ClaudeAgent with model: ${this.modelName}`);
        if (!anthropic) {
             // Log warning again or potentially throw error if client is essential
             log('ERROR: ClaudeAgent: Anthropic client not available. Agent cannot function.');
             // Consider throwing new Error("Anthropic client not initialized due to missing API key.");
        }
    }

    setPersona(persona: Persona): void {
        this.persona = persona;
    }

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        log(`[${this.playerId} - ${gameState.self.role} (Claude)] Thinking with model ${this.modelName}...`);

        if (!anthropic) {
             log('ERROR: ClaudeAgent: Anthropic client not initialized. Returning noAction.');
             return { type: 'noAction' };
        }

        // Determine allegiance
        const allegiance: Allegiance = gameState.self.role === RoleName.Mafia ? 'Mafia' : 'Town';

        // Prepare state for the prompt, converting Set to Array and adding allegiance
        const promptInputState = {
            round: gameState.round,
            phase: gameState.phase,
            self: {
                ...gameState.self, // Spread existing self properties
                allegiance: allegiance // Add the determined allegiance
            },
            alivePlayerIds: Array.from(gameState.alivePlayerIds), // Ensure this conversion exists
            players: gameState.players.map(p => ({ id: p.id, name: p.name, status: p.status })),
            language: gameState.language,
            mafiaPlayerIds: gameState.self.isMafia ? Array.from(gameState.mafiaPlayerIds ?? []) : undefined,
            themeName: gameState.themeName,
            memory: gameState.memory 
        };

        // Ensure these helper functions are accessible and correctly defined
        const systemPrompt = getSystemPrompt(); 
        const userPrompt = getUserPrompt(promptInputState, allowedActions);

        try {
            const response = await anthropic.messages.create({
                model: this.modelName, // Use the stored model name
                system: systemPrompt,
                messages: [
                    { role: "user", content: userPrompt },
                    { role: "assistant", content: "{" } // Prefill for JSON
                ],
                temperature: 0.7,
                max_tokens: 200,
                stop_sequences: ["}"],
            });

            let responseText = "";
            if (response.content.length > 0 && response.content[0].type === 'text') {
                 responseText = response.content[0].text;
            }
            const potentialJson = "{" + responseText + "}";

            if (!responseText) {
                log(`ERROR: [${this.playerId} (Claude)] API response was empty.`);
                return { type: 'noAction' };
            }

            let action: PlayerAction;
            try {
                action = JSON.parse(potentialJson.trim()) as PlayerAction;
            } catch (parseError) {
                 log(`ERROR: [${this.playerId} (Claude)] Failed to parse JSON response: ${potentialJson} %O`, parseError);
                 return { type: 'noAction' };
            }

            // Validation logic (ensure allowedActions includes action.type)
            if (allowedActions && allowedActions.length > 0 && !allowedActions.includes(action.type)) {
                 log(`WARN: [${this.playerId} (Claude)] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            } else if (!allowedActions && action.type !== 'noAction'){
                 log(`WARN: [${this.playerId} (Claude)] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            log(`[${this.playerId} - ${gameState.self.role} (Claude)] Chose action: %o`, action);
            return action;

        } catch (error) {
            log(`ERROR: [${this.playerId} (Claude)] Error calling Anthropic API: %O`, error);
            return { type: 'noAction' };
        }
    }
} 
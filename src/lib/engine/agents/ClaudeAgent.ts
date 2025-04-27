import type { IAgent } from '../interfaces/IAgent';
import type { PlayerAction } from '../interfaces/IAgent';
import type { VisibleGameState } from '../interfaces/GameState';
import type { PlayerId } from '../interfaces/IPlayer';
import { Persona, DEFAULT_PERSONA } from '../interfaces/Persona';
import { Anthropic } from '@anthropic-ai/sdk'; // Ensure this is installed
import * as dotenv from 'dotenv'; // Import dotenv
import debug from 'debug'; // Import debug
import { getSystemPrompt, getUserPrompt, getPersonaGenerationPrompt } from '../prompts'; // Import prompt functions
import { RoleName, type Allegiance } from '../interfaces/IRole'; // Trying IRole path

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
const defaultModel = process.env.CLAUDE_MODEL || "claude-3-haiku-20240307"; // Default to Haiku

// Renamed from ClaudeAgentOld
export class ClaudeAgent implements IAgent {
    public readonly id: PlayerId; // Added readonly id
    public readonly agentName = 'ClaudeAgent'; // Added agentName
    public persona: Persona = DEFAULT_PERSONA; // Initialize with default
    private modelName: string; // Store the selected model name

    constructor(id: PlayerId, model?: string) { // Accept id
        this.id = id;
        this.modelName = model || defaultModel;
        this.persona = DEFAULT_PERSONA; // Ensure initialized
        log(`Initialized ClaudeAgent ${this.id} with model: ${this.modelName}`);
        if (!anthropic) {
            log(`ERROR: ClaudeAgent ${this.id}: Anthropic client not available. Agent cannot function.`);
            // Potentially throw an error or ensure fallback behavior is robust
        }
    }

    async generatePersona(themeDescription: string): Promise<void> {
        const agentIdForLog = `${this.id} (Persona Gen)`;
        log(`[${agentIdForLog}] Generating persona with theme: ${themeDescription}`);

        if (!anthropic) {
            log(`ERROR: [${agentIdForLog}] Anthropic client not initialized. Using default persona.`);
            this.persona = DEFAULT_PERSONA;
            return;
        }

        const personaPrompt = getPersonaGenerationPrompt(themeDescription);

        try {
            const response = await anthropic.messages.create({
                model: this.modelName,
                system: "You are a creative writer. Respond ONLY with the requested JSON object.", // Simpler system prompt for JSON
                messages: [
                    { role: "user", content: personaPrompt },
                    { role: "assistant", content: "{" } // Prefill for JSON
                ],
                temperature: 0.8, // Slightly higher for creativity
                max_tokens: 400,
                stop_sequences: ["}"],
            });

            let responseText = "";
            if (response.content.length > 0 && response.content[0].type === 'text') {
                responseText = response.content[0].text;
            }
            const potentialJson = "{" + responseText.trim() + "}"; // Trim inner text before wrapping

            if (!responseText) {
                log(`ERROR: [${agentIdForLog}] Persona generation API response was empty.`);
                this.persona = DEFAULT_PERSONA;
                return;
            }

            try {
                const parsedPersona = JSON.parse(potentialJson) as Persona;
                // Basic validation
                if (typeof parsedPersona.name === 'string' &&
                    typeof parsedPersona.backstory === 'string' &&
                    Array.isArray(parsedPersona.personalityTraits) &&
                    parsedPersona.personalityTraits.every(t => typeof t === 'string'))
                {
                    this.persona = parsedPersona;
                    log(`[${agentIdForLog}] Successfully generated persona: ${this.persona.name}`);
                } else {
                    log(`ERROR: [${agentIdForLog}] Parsed persona JSON has invalid structure: %o`, parsedPersona);
                    this.persona = DEFAULT_PERSONA;
                }
            } catch (parseError) {
                log(`ERROR: [${agentIdForLog}] Failed to parse persona JSON response. Error: %O\nRaw Response: ${potentialJson}`, parseError);
                this.persona = DEFAULT_PERSONA;
            }

        } catch (error) {
            log(`ERROR: [${agentIdForLog}] API call failed during persona generation: %O`, error);
            this.persona = DEFAULT_PERSONA; // Fallback on API error
        }
    }

    async getAction(gameState: VisibleGameState, allowedActions?: PlayerAction['type'][]): Promise<PlayerAction> {
        const agentIdForLog = `${this.id} - ${this.persona?.name || 'Unknown Persona'} (${gameState.self.role})`;
        log(`[${agentIdForLog} (Claude)] Thinking with model ${this.modelName}...`);

        if (!anthropic) {
            log(`ERROR: ClaudeAgent ${this.id}: Anthropic client not initialized. Returning noAction.`);
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
                allegiance: allegiance, // Add the determined allegiance
                persona: this.persona, // Pass generated persona to prompt
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
                log(`ERROR: [${agentIdForLog} (Claude)] API response was empty.`);
                return { type: 'noAction' };
            }

            let action: PlayerAction;
            try {
                action = JSON.parse(potentialJson.trim()) as PlayerAction;
            } catch (parseError) {
                 log(`ERROR: [${agentIdForLog} (Claude)] Failed to parse JSON response: ${potentialJson} %O`, parseError);
                 return { type: 'noAction' };
            }

            // Validation logic (ensure allowedActions includes action.type)
            if (allowedActions && allowedActions.length > 0 && !allowedActions.includes(action.type)) {
                 log(`WARN: [${agentIdForLog} (Claude)] Action type '${action.type}' is not in allowed actions: ${allowedActions.join(', ')}. Defaulting to noAction.`);
                 return { type: 'noAction' };
            } else if (!allowedActions && action.type !== 'noAction'){
                 log(`WARN: [${agentIdForLog} (Claude)] Action type '${action.type}' is not allowed (no actions specified). Defaulting to noAction.`);
                 return { type: 'noAction' };
            }

            log(`[${agentIdForLog} - ${gameState.self.role} (Claude)] Chose action: %o`, action);
            return action;

        } catch (error) {
            log(`ERROR: [${agentIdForLog} (Claude)] Error calling Anthropic API: %O`, error);
            return { type: 'noAction' };
        }
    }
} 
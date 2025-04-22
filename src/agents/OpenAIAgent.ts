import OpenAI from 'openai';
import type { VisibleGameState } from '../interfaces/GameState';
import type { IAgent, PlayerAction } from '../interfaces/IAgent';
import { getSystemPrompt, getUserPrompt } from '../prompts';
import type { AgentMemory, AIConversationLog } from '../interfaces/AgentMemory'; // Import AIConversationLog
import { RoleName } from '../interfaces/IRole'; // Keep existing imports

// Define default configuration (can be overridden)
const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'; // Use a default model
const DEFAULT_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
const DEFAULT_API_KEY = process.env.OPENAI_API_KEY; // API key is now explicitly handled

export class OpenAIAgent implements IAgent {
    playerId: string = 'default-openai-agent';
    role: RoleName | null = null;
    private openai: OpenAI;
    private model: string;
    private apiBase: string;

    // Updated constructor to accept configuration
    constructor(model: string = DEFAULT_MODEL, apiBase: string = DEFAULT_API_BASE, apiKey: string | undefined = DEFAULT_API_KEY) {
        this.model = model;
        this.apiBase = apiBase; // Store apiBase if needed for logging/debugging

        // Ensure apiKey is handled correctly (undefined vs empty string)
        if (!apiKey) {
            console.warn(`Warning: API key for OpenAI agent (model: ${this.model}, endpoint: ${this.apiBase}) is not set. Requests might fail.`);
            // Depending on the provider, an API key might not always be required (e.g., local Ollama)
        }

        this.openai = new OpenAI({
            apiKey: apiKey, // Pass explicitly, can be undefined
            baseURL: this.apiBase,
        });
    }

    setPlayerId(id: string): void {
        this.playerId = id;
    }

    setRole(role: RoleName): void {
        this.role = role;
    }

    async getAction(gameState: VisibleGameState, allowedActions: PlayerAction['type'][]): Promise<PlayerAction> {
        const systemPrompt = getSystemPrompt();
        const userPrompt = getUserPrompt(gameState, allowedActions);
        const memory = gameState.memory; // Get memory for logging

        const logEntry: Partial<AIConversationLog> = { // Use Partial for building the log
            round: gameState.round,
            phase: gameState.phase,
            timestamp: new Date(),
            model: this.model,
            prompt: { system: systemPrompt, user: userPrompt },
            response: { raw: null, parsedAction: null }
        };

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.model, // Use the configured model
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 150,
                response_format: { type: 'json_object' },
            });

            const responseContent = completion.choices[0]?.message?.content;
            logEntry.response!.raw = responseContent; // Log raw response

            if (!responseContent) {
                console.warn(`[Agent ${this.playerId}] Received empty response from API.`);
                logEntry.response!.error = 'Empty API response';
                memory.aiConversationLogs.push(logEntry as AIConversationLog); // Push completed log
                return { type: 'noAction' };
            }

            try {
                const parsedAction = JSON.parse(responseContent) as PlayerAction;

                // Validate action type
                if (!allowedActions.includes(parsedAction.type)) {
                    console.warn(`[Agent ${this.playerId}] Received disallowed action type '${parsedAction.type}'. Allowed: ${allowedActions.join(', ')}`);
                    logEntry.response!.parsedAction = parsedAction; // Log parsed but disallowed action
                    logEntry.response!.error = 'Disallowed action type received';
                    memory.aiConversationLogs.push(logEntry as AIConversationLog); // Push completed log
                    return { type: 'noAction' };
                }

                // Action is valid and allowed
                logEntry.response!.parsedAction = parsedAction; // Log successful action
                memory.aiConversationLogs.push(logEntry as AIConversationLog); // Push completed log
                return parsedAction;

            } catch (parseError) {
                console.error(`[Agent ${this.playerId}] Failed to parse JSON response: ${responseContent}`, parseError);
                logEntry.response!.error = `JSON parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`;
                memory.aiConversationLogs.push(logEntry as AIConversationLog); // Push completed log
                return { type: 'noAction' };
            }

        } catch (error) {
            console.error(`[Agent ${this.playerId}] Error calling OpenAI API (model: ${this.model}, endpoint: ${this.apiBase}):`, error);
            logEntry.response!.raw = null; // No raw response available on API error
            logEntry.response!.error = `API call failed: ${error instanceof Error ? error.message : String(error)}`;
            memory.aiConversationLogs.push(logEntry as AIConversationLog); // Push completed log
            return { type: 'noAction' };
        }
    }
}
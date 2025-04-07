import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { GameState } from '@/lib/types/game'; // Keep if needed for context later

// --- Initialize OpenAI Client ---

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL; 

if (!apiKey) {
    console.warn("Missing OPENAI_API_KEY environment variable. AI features will be disabled.");
}

const openai = apiKey ? new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL, // Will be undefined if not set, which is fine
}) : null;

// --- AI Interaction Function Definition ---

/**
 * Defines the expected signature for a function that interacts with an AI model 
 * to get a response (action, dialogue, etc.) for a specific player.
 */
export type GetAIResponseFunction = (
  messages: ChatCompletionMessageParam[],
  gameId: string, // Keep for logging/context
  playerId: string, // Keep for logging/context
  settings: { model: string; temperature?: number; max_tokens?: number }
) => Promise<string>; // Returns the AI's text response

// --- Real OpenAI Implementation ---

/**
 * Calls the OpenAI-compatible API to get a response for a given prompt.
 * 
 * @param messages The prompt messages for the AI.
 * @param gameId The ID of the current game (for logging/context).
 * @param playerId The ID of the player whose response is needed (for logging/context).
 * @param settings AI model settings (model name, temperature, etc.).
 * @returns A promise resolving to the AI's text response.
 * @throws If the API key is missing or the API call fails.
 */
export const getAIResponse: GetAIResponseFunction = async (
    messages,
    gameId,
    playerId,
    settings
) => {
    if (!openai) {
        console.error(`[${gameId}|${playerId}] OpenAI client not initialized (missing API key).`);
        throw new Error("OpenAI client not initialized. Missing OPENAI_API_KEY.");
    }

    console.log(`[${gameId}|${playerId}] Requesting AI response using model ${settings.model}...`);

    try {
        const completion = await openai.chat.completions.create({
            model: settings.model,
            messages: messages,
            temperature: settings.temperature ?? 0.7, // Default temperature if not provided
            max_tokens: settings.max_tokens ?? 150, // Default max tokens
            // TODO: Add other parameters like top_p, frequency_penalty etc. if needed
        });

        const responseContent = completion.choices[0]?.message?.content;

        if (!responseContent) {
            throw new Error('Received empty response content from AI.');
        }

        console.log(`[${gameId}|${playerId}] Received AI response.`);
        return responseContent.trim();

    } catch (error: any) {
        console.error(`[${gameId}|${playerId}] Error calling OpenAI API:`, error?.message || error);
        // More specific error handling could be added here (e.g., for rate limits)
        // Re-throw the error to be handled by the calling action
        throw new Error(`AI API call failed: ${error?.message || 'Unknown error'}`);
    }
};

// --- Placeholder Function Removed --- 
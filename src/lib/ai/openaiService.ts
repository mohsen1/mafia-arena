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

/**
 * Calls the AI to generate a thematic title and short description for the game
 * based on the cast of characters.
 *
 * @param players An array of player objects with names and personas.
 * @param settings AI model settings.
 * @returns A promise resolving to an object with title and description.
 * @throws If the API key is missing or the API call fails.
 */
export async function getAIGameTitleAndDescription(
    players: ReadonlyArray<{ name: string; persona: string }>,
    settings: { model: string; temperature?: number; max_tokens?: number }
): Promise<{ title: string; description: string }> {
    if (!openai) {
        throw new Error("OpenAI client not initialized. Missing OPENAI_API_KEY.");
    }

    console.log(`Requesting AI game title/description using model ${settings.model}...`);

    const characterDescriptions = players
        .map(p => `- ${p.name}: ${p.persona.split('\n')[2]?.replace('Appearance: ', '') || 'No description provided.'}`)
        .join('\n');

    const prompt: ChatCompletionMessageParam[] = [
        {
            role: 'system',
            content: `You are a creative assistant tasked with generating a thematic title and a short, evocative description (1-2 sentences) for a game of Werewolf based on its characters. Respond ONLY in JSON format with keys "title" and "description". Example: {"title": "The Grimstone Gathering", "description": "Shadows lengthen in the village as whispers of a hidden beast turn neighbor against neighbor."}`
        },
        {
            role: 'user',
            content: `Generate a title and description for a Werewolf game featuring these characters:
${characterDescriptions}

Respond ONLY with the JSON object.`
        }
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: settings.model,
            messages: prompt,
            temperature: settings.temperature ?? 0.8, 
            max_tokens: settings.max_tokens ?? 100, // Shorter response needed
            response_format: { type: "json_object" }, // Request JSON output
        });

        const responseContent = completion.choices[0]?.message?.content;

        if (!responseContent) {
            throw new Error('Received empty response content from AI for title/description.');
        }

        // Parse the JSON response
        const parsedResponse = JSON.parse(responseContent);
        if (typeof parsedResponse.title === 'string' && typeof parsedResponse.description === 'string') {
            console.log("Received AI-generated title and description.");
            return {
                 title: parsedResponse.title.trim(),
                 description: parsedResponse.description.trim()
             };
        } else {
            throw new Error('AI response for title/description was not in the expected JSON format.');
        }

    } catch (error: any) {
        console.error(`Error generating AI title/description:`, error?.message || error);
        // Fallback or re-throw
        // For now, return a generic fallback to avoid blocking game creation
        console.warn("Falling back to generic title/description.");
        return {
            title: "A Game of Shadows",
            description: "Suspicion hangs heavy in the air as the villagers seek the threat within."
        };
        // Or re-throw: throw new Error(`AI title/description generation failed: ${error?.message || 'Unknown error'}`);
    }
}

// --- Placeholder Function Removed --- 
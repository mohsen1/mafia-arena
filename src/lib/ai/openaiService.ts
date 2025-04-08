import { AICharacterProfile, Role } from '@/lib/types/game'; 
import fs from 'fs';
import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import path from 'path';
import { cleanAIResponse, extractJSONFromText } from '../utils/stringUtils'; 
import { 
    GENERATE_TITLE_AND_DESCRIPTION_SYSTEM_PROMPT, 
    GENERATE_TITLE_AND_DESCRIPTION_USER_PROMPT, 
    GENERATE_AI_CHARACTER_PROFILE_SYSTEM_PROMPT
} from './PROMPTS';

// --- Initialize OpenAI Client ---

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL; 

if (!apiKey) {
    console.warn("Missing OPENAI_API_KEY environment variable. AI features will be disabled.");
}

// Set a longer timeout (e.g., 30 seconds = 30000ms)
const TIMEOUT_MS = 30_000; 

const openai = apiKey ? new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL, // Will be undefined if not set, which is fine
    timeout: TIMEOUT_MS, // Add explicit timeout
    // httpAgent: new Agent({ timeout: TIMEOUT_MS }), // Consider if using httpAgent
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
  settings: { 
    model: string; 
    temperature?: number; 
    response_format?: { type: "text" | "json_object" }; // <-- Add optional response_format
  }
) => Promise<string>; // Returns the AI's text response

// --- Real OpenAI Implementation ---

/**
 * Logs API calls and their results to a markdown file for the specified game.
 * 
 * @param gameId The ID of the current game.
 * @param playerId The ID of the player whose response is needed.
 * @param apiCallDetails Details of the API call (model, messages, settings).
 * @param result The result of the API call.
 */
async function logAPICall(gameId: string, playerId: string, apiCallDetails: any, result: any) {
    const logDir = path.join(process.cwd(), 'data');
    const logFile = path.join(logDir, `${gameId}.md`);

    // Create the data directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // Format the log entry
    const logEntry = `
## API Call - ${new Date().toISOString()}

**Game ID:** ${gameId}
**Player ID:** ${playerId}
**API Call Details:** \`\`\`json
${JSON.stringify(apiCallDetails, null, 2)}
\`\`\`
**Result:** \`\`\`json
${JSON.stringify(result, null, 2)}
\`\`\`
`;

    // Append the log entry to the file
    fs.appendFileSync(logFile, logEntry);
}

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
        });

        const responseContent = completion.choices[0]?.message?.content;

        if (!responseContent) {
            throw new Error('Received empty response content from AI.');
        }

        // Clean response to remove thinking blocks
        const cleanedContent = cleanAIResponse(responseContent);

        // Log the API call and result
        await logAPICall(gameId, playerId, { model: settings.model, messages, settings }, { response: cleanedContent });

        console.log(`[${gameId}|${playerId}] Received AI response.`);
        return cleanedContent.trim();

    } catch (error: any) {
        // Log the API call and error
        await logAPICall(gameId, playerId, { model: settings.model, messages, settings }, { error: error.message });

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
    settings: { model: string; temperature?: number }
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
            content: GENERATE_TITLE_AND_DESCRIPTION_SYSTEM_PROMPT
        },
        {
            role: 'user',
            content: GENERATE_TITLE_AND_DESCRIPTION_USER_PROMPT(characterDescriptions)
        }
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: settings.model,
            messages: prompt,
            temperature: settings.temperature ?? 0.8, 
            response_format: { type: "json_object" }, // Request JSON output
        });

        const responseContent = completion.choices[0]?.message?.content;

        if (!responseContent) {
            throw new Error('Received empty response content from AI for title/description.');
        }

        // Parse the JSON response
        const parsedResponse = JSON.parse(responseContent);
        if (typeof parsedResponse.title === 'string' && typeof parsedResponse.description === 'string') {
            // Log the API call and result
            await logAPICall('game_title', 'system', { model: settings.model, prompt, settings }, parsedResponse);

            console.log("Received AI-generated title and description.");
            return {
                 title: parsedResponse.title.trim(),
                 description: parsedResponse.description.trim()
             };
        } else {
            throw new Error('AI response for title/description was not in the expected JSON format.');
        }

    } catch (error: any) {
        // Log the API call and error
        await logAPICall('game_title', 'system', { model: settings.model, prompt, settings }, { error: error.message });

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

/**
 * Generates a character profile using an AI model, aiming for diversity based on existing profiles.
 * @param role The role the character should have.
 * @param model The AI model to use.
 * @param existingProfiles Optional array of already generated profiles to ensure diversity.
 * @returns A generated AICharacterProfile or null if generation fails.
 */
export async function generateAICharacterProfile(
    role: Role, 
    model: string, 
    existingProfiles?: AICharacterProfile[] // Add optional parameter
): Promise<AICharacterProfile | null> {
    console.log(`Requesting AI profile generation for role: ${role} using model: ${model}${existingProfiles && existingProfiles.length > 0 ? ` (considering ${existingProfiles.length} existing profiles)` : ''}`);
    
    // Construct context about existing characters, focusing on names for uniqueness check
    let existingCharsContext = ''
    if (existingProfiles && existingProfiles.length > 0) {
        const existingNames = existingProfiles.map(p => p.characterName).join(', ');
        existingCharsContext = `\n\nExisting Characters in the group 
        (IMPORTANT: DO NOT REUSE THESE NAMES, CREATE A UNIQUE CHARACTER, DO NOT USE THE FIRST OR LAST NAMES IN THIS LIST): ${existingNames}\n`;
        // Optionally add more details back if needed for diversity, but keep names prominent
        existingCharsContext += existingProfiles.map((p, i) => 
            `- ${p.characterName} (${p.gender}, ${p.ageCategory}, ${p.personalityArchetype})`
        ).join('\n');
    }

    // Use the imported prompt function
    const systemPrompt = GENERATE_AI_CHARACTER_PROFILE_SYSTEM_PROMPT(role, existingCharsContext);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate a character profile for a ${role}.` }
    ];

    // Declare responseJsonString here, outside the try block, so it's accessible in the catch
    let responseJsonString: string | undefined;

    try {
        // Use the existing getAIResponse but expect JSON
        responseJsonString = await getAIResponse(
            messages,
            'character-generation', // Game ID placeholder for logging/context
            `generate-${role}`,     // Player ID placeholder
            { model: model, temperature: 0.8, response_format: { type: "json_object" } } 
        );

        if (!responseJsonString) {
            throw new Error("AI returned an empty response.");
        }

        // --- Clean the response --- 
        // Use utility function to clean the response and extract JSON
        const cleanedContent = cleanAIResponse(responseJsonString);
        const cleanedJsonString = extractJSONFromText(cleanedContent);

        // Parse the cleaned JSON response string
        const profile: AICharacterProfile = JSON.parse(cleanedJsonString);
        
        // Basic validation (can add more checks)
        // Use the keys defined in the prompt's JSON structure
        if (!profile.characterName || !profile.roleInCommunity || !profile.appearance || !profile.background || 
            !profile.personalityArchetype || !profile.keyTraits || !profile.motivations || 
            !profile.gender || !profile.ageCategory) {
            throw new Error("Generated JSON is missing required fields.");
        }
        console.log(`Successfully generated profile for ${profile.characterName} (${role})`);
        return profile;

    } catch (error: any) {
        console.error(`Error generating or parsing AI character profile for ${role}:`, error);
        // Log the raw response if available and it's a parsing error
        // The responseJsonString variable is now accessible here if the error occurred after assignment
        if (error instanceof SyntaxError && typeof responseJsonString === 'string') {
             console.error("Raw AI Response (JSON parse failed):\n", responseJsonString);
        }
        return null; // Return null on failure
    }
}

/**
 * Constructs the detailed persona string from the AI profile.
 * @param profile The generated AICharacterProfile.
 * @returns A formatted string suitable for the Player.persona field.
 */
export function formatPersonaFromProfile(profile: AICharacterProfile): string {
    // Use the keys from the defined JSON structure
    return `Name: ${profile.characterName}
Role in Community: ${profile.roleInCommunity}
Appearance: ${profile.appearance}
Background: ${profile.background}
Personality Archetype: ${profile.personalityArchetype}
Key Traits: ${profile.keyTraits}
Motivations: ${profile.motivations.join(', ')}`;
}


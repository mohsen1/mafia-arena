import { AICharacterProfile, Role } from '@/lib/types/game';
import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { cleanAIResponse, extractJSONFromText } from "@/lib/utils/stringUtils";
import { 
    GENERATE_TITLE_AND_DESCRIPTION_SYSTEM_PROMPT, 
    GENERATE_TITLE_AND_DESCRIPTION_USER_PROMPT, 
    GENERATE_AI_CHARACTER_PROFILE_SYSTEM_PROMPT
} from './PROMPTS';
import { SupportedLanguage } from "@/hooks/useGameConfig";
import { GAME_TITLE_DESCRIPTION_PROMPT } from "./PROMPTS";

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
        throw new Error("OpenAI client not initialized. Missing OPENAI_API_KEY.");
    }
    console.log(
        `[AI Request - ${gameId}|${playerId}] Calling model ${settings.model} (Temp: ${settings.temperature ?? 'default'})...`
    );

    const requestDetails = { settings, messages }; // For logging
    try {
        const completion = await openai.chat.completions.create({
            model: settings.model,
            messages: messages,
            temperature: settings.temperature ?? 0.7,
            response_format: settings.response_format, // Pass response format if provided
        });

        const responseContent = completion.choices[0]?.message?.content;
        if (!responseContent) {
            throw new Error("Received empty response content from AI.");
        }

        // Remove logging call
        // await logAPICall(gameId, playerId, requestDetails, { content: responseContent }); 
        console.log(
            `[AI Response - ${gameId}|${playerId}] Received content (length: ${responseContent.length}).`
        );
        return responseContent;

    } catch (error: any) {
        console.error(
            `[AI Error - ${gameId}|${playerId}] Failed AI call for model ${settings.model}:`,
            error?.message || error
        );
        // Remove logging call
        // await logAPICall(gameId, playerId, requestDetails, { error: error?.message || 'Unknown Error' }); 
        throw error; // Re-throw the error to be handled by the caller
    }
};

/**
 * Generates a game title and description based on player details using AI.
 */
export async function getAIGameTitleAndDescription(
  playerDetails: { name: string; persona: string }[],
  settings: { model: string; temperature?: number },
  language: SupportedLanguage
): Promise<{ title: string; description: string }> {
  console.log(`Generating title/description in ${language} using model: ${settings.model}`);

  // Add null check for openai client
  if (!openai) {
      console.error("OpenAI client not initialized. Missing OPENAI_API_KEY.");
       // Return default values if client is not available
       return {
           title: "Werewolf Game (Config Error)",
           description: "OpenAI API key not configured.",
       };
  }

  // Use the imported prompt generator function, passing the language
  const systemPrompt = GAME_TITLE_DESCRIPTION_PROMPT(playerDetails, language);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: "Generate the title and description based on the characters provided." },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: settings.model,
      messages: messages,
      temperature: settings.temperature ?? 0.7, // Default temperature if not provided
      max_tokens: 150, // Adjust as needed
      // Ensure response format is JSON if the prompt specifies it
      // response_format: { type: "json_object" }, // Uncomment if prompt demands JSON
    });

    const rawContent = response.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("AI response content was empty.");
    }

    const cleanedContent = cleanAIResponse(rawContent);

    // --- Attempt to parse the response --- 
    // Flexible parsing: Look for Title: ... Description: ... pattern
    // Removed 's' flag, use [\s\S] to match any character including newline
    const titleMatch = cleanedContent.match(/Title:([\s\S]*?)Description:/);
    const descriptionMatch = cleanedContent.match(/Description:([\s\S]*)/);

    const title = titleMatch?.[1]?.trim() || "Werewolf Game"; // Fallback title
    const description = descriptionMatch?.[1]?.trim() || "A game of deception and deduction."; // Fallback desc

    console.log("Generated Title:", title);
    console.log("Generated Description:", description);

    // Simple JSON parsing (if prompt guarantees JSON)
    /*
    try {
      const parsed = JSON.parse(cleanedContent);
      if (typeof parsed.title === 'string' && typeof parsed.description === 'string') {
        return { title: parsed.title, description: parsed.description };
      } else {
         throw new Error("Parsed JSON response did not contain title/description strings.");
      }
    } catch (parseError) {
       console.error("Failed to parse title/description response:", parseError);
       console.error("Raw response was:", cleanedContent); // Log raw response on error
        // Fallback to basic extraction or defaults
        const title = cleanedContent.split('\n')[0] || "Werewolf Game";
        const description = cleanedContent.split('\n')[1] || "A game of deception...";
        return { title, description };
    }
    */
    return { title, description };

  } catch (error) {
    console.error("Error getting AI title/description:", error);
    // Return default values on error
    return {
      title: "Werewolf Game (Error)",
      description: "Failed to generate title/description.",
    };
  }
}

/**
 * Generates a character profile using an AI model, aiming for diversity based on existing profiles.
 * @param role The role the character should have.
 * @param model The AI model to use.
 * @param language The language of the character profile.
 * @param existingProfiles Optional array of already generated profiles to ensure diversity.
 * @returns A generated AICharacterProfile or null if generation fails.
 */
export async function generateAICharacterProfile(
    role: Role, 
    model: string, 
    language: SupportedLanguage,
    existingProfiles?: AICharacterProfile[] // Add optional parameter
): Promise<AICharacterProfile | null> {
    console.log(`Requesting AI profile generation for role: ${role} in ${language} using model: ${model}${existingProfiles && existingProfiles.length > 0 ? ` (considering ${existingProfiles.length} existing profiles)` : ''}`);
    
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

    // Use the imported prompt function, passing language
    const systemPrompt = GENERATE_AI_CHARACTER_PROFILE_SYSTEM_PROMPT(role, existingCharsContext, language);

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


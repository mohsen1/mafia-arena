import dotenv from 'dotenv';
import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { GameError, GameErrors, ErrorCode } from '../errors/GameError';

// Load environment variables
dotenv.config();

// NEW IMPORTS

// --- Initialize OpenAI Client ---

const apiKey = process.env.OPENAI_API_KEY;
const baseURL = process.env.OPENAI_BASE_URL;

if (!apiKey) {
  console.warn(
    'Missing OPENAI_API_KEY environment variable. AI features will be disabled.'
  );
}

function getOpenAIInstance() {
  if (!apiKey) {
    throw new Error(
      'OpenAI client not initialized. Missing OPENAI_API_KEY environment variable. Please set it in your .env file.'
    );
  }

  const TIMEOUT_MS = 30_000;

  return new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL, // Will be undefined if not set, which is fine
    timeout: TIMEOUT_MS, // Add explicit timeout
    // httpAgent: new Agent({ timeout: TIMEOUT_MS }), // Consider if using httpAgent
  });
}

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
    max_tokens?: number;
    presence_penalty?: number;
    response_format?: { type: 'text' | 'json_object' }; // <-- Add optional response_format
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
  if (!apiKey) {
    throw new Error(
      'OpenAI API key not configured. Please set OPENAI_API_KEY in your environment variables.'
    );
  }

  const openai = getOpenAIInstance();

  console.log(
    `[AI Request - ${gameId}|${playerId}] Calling model ${
      settings.model
    } (Temp: ${settings.temperature ?? 'default'})...`
  );

  try {
    const completion = await openai.chat.completions.create({
      model: settings.model,
      messages: messages,
      presence_penalty: settings.presence_penalty ?? 0.5,
      max_tokens: settings.max_tokens ?? undefined,
      temperature: settings.temperature ?? 0.7,
      response_format: settings.response_format, // Pass response format if provided
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error(
        `Empty response from OpenAI API. Model: ${settings.model}, Game: ${gameId}, Player: ${playerId}`
      );
    }

    // Removed logging call
    console.log(
      `[AI Response - ${gameId}|${playerId}] Received content (length: ${responseContent.length}).`
    );
    return responseContent;
  } catch (error: unknown) {
    const modelName = settings.model;

    // Convert to GameError for consistent error handling
    let gameError: GameError;

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes('401') ||
        errorMessage.includes('invalid_api_key')
      ) {
        gameError = GameErrors.aiAuthentication('OpenAI', error);
      } else if (
        errorMessage.includes('429') ||
        errorMessage.includes('rate_limit')
      ) {
        gameError = GameErrors.aiRateLimit('OpenAI', error);
      } else if (errorMessage.includes('timeout')) {
        gameError = GameErrors.aiTimeout('OpenAI', 30000, error);
      } else if (
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('network')
      ) {
        gameError = new GameError({
          code: ErrorCode.NETWORK_ERROR,
          message: error.message,
          userMessage:
            'Cannot connect to OpenAI API. Please check your internet connection.',
          originalError: error,
          retryable: true,
          httpStatus: 503,
        });
      } else if (
        errorMessage.includes('model_not_found') ||
        errorMessage.includes('invalid model')
      ) {
        gameError = GameErrors.aiModelNotFound(modelName, 'OpenAI', error);
      } else if (errorMessage.includes('context_length_exceeded')) {
        gameError = GameErrors.aiContextLength('OpenAI', error);
      } else {
        gameError = GameError.fromUnknown(error);
      }
    } else {
      gameError = GameError.fromUnknown(error);
    }

    console.error(
      `[AI Error - ${gameId}|${playerId}] ${gameError.code} for model ${modelName}: ${gameError.userMessage}`
    );

    throw gameError;
  }
};

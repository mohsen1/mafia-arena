import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { GameError, GameErrors, ErrorCode } from '../errors/GameError';

// Load environment variables
dotenv.config();

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.warn(
    'Missing ANTHROPIC_API_KEY environment variable. Claude AI features will be disabled.'
  );
}

function getAnthropicInstance() {
  const TIMEOUT_MS = 60_000;

  return new Anthropic({
    apiKey: apiKey,
    timeout: TIMEOUT_MS,
  });
}

function convertOpenAIMessagesToAnthropic(
  messages: ChatCompletionMessageParam[]
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }> = [];
  let systemMessage = '';

  for (const message of messages) {
    if (message.role === 'system') {
      systemMessage = message.content as string;
    } else if (message.role === 'user' || message.role === 'assistant') {
      anthropicMessages.push({
        role: message.role,
        content: message.content as string,
      });
    }
  }

  if (
    systemMessage &&
    anthropicMessages.length > 0 &&
    anthropicMessages[0].role === 'user'
  ) {
    anthropicMessages[0].content = `${systemMessage}\n\n${anthropicMessages[0].content}`;
  } else if (systemMessage && anthropicMessages.length === 0) {
    anthropicMessages.push({
      role: 'user',
      content: systemMessage,
    });
  }

  return anthropicMessages;
}

export type GetAIResponseFunction = (
  messages: ChatCompletionMessageParam[],
  gameId: string,
  playerId: string,
  settings: {
    model: string;
    temperature?: number;
    max_tokens?: number;
    presence_penalty?: number;
    response_format?: { type: 'text' | 'json_object' };
  }
) => Promise<string>;

export const getAIResponse: GetAIResponseFunction = async (
  messages,
  gameId,
  playerId,
  settings
) => {
  if (!apiKey) {
    throw new Error(
      'Anthropic API key not configured. Please set ANTHROPIC_API_KEY in your environment variables.'
    );
  }

  const anthropic = getAnthropicInstance();

  console.log(
    `[Claude Request - ${gameId}|${playerId}] Calling model ${
      settings.model
    } (Temp: ${settings.temperature ?? 'default'})...`
  );

  try {
    const anthropicMessages = convertOpenAIMessagesToAnthropic(messages);

    const response = await anthropic.messages.create({
      model: settings.model,
      max_tokens: settings.max_tokens ?? 4096,
      temperature: settings.temperature ?? 0.7,
      messages: anthropicMessages,
    });

    const responseContent = response.content[0];
    if (!responseContent || responseContent.type !== 'text') {
      throw new Error(
        `Invalid response from Claude API. Expected text response but got: ${responseContent?.type || 'empty'}`
      );
    }

    console.log(
      `[Claude Response - ${gameId}|${playerId}] Received content (length: ${responseContent.text.length}).`
    );
    return responseContent.text;
  } catch (error: unknown) {
    const modelName = settings.model;

    // Convert to GameError for consistent error handling
    let gameError: GameError;

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (
        errorMessage.includes('401') ||
        errorMessage.includes('authentication')
      ) {
        gameError = GameErrors.aiAuthentication('Anthropic', error);
      } else if (
        errorMessage.includes('429') ||
        errorMessage.includes('rate_limit')
      ) {
        gameError = GameErrors.aiRateLimit('Anthropic', error);
      } else if (errorMessage.includes('timeout')) {
        gameError = GameErrors.aiTimeout('Anthropic', 60000, error);
      } else if (
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('network')
      ) {
        gameError = new GameError({
          code: ErrorCode.NETWORK_ERROR,
          message: error.message,
          userMessage:
            'Cannot connect to Claude API. Please check your internet connection.',
          originalError: error,
          retryable: true,
          httpStatus: 503,
        });
      } else if (errorMessage.includes('model_not_found')) {
        gameError = GameErrors.aiModelNotFound(modelName, 'Anthropic', error);
      } else if (errorMessage.includes('context_length')) {
        gameError = GameErrors.aiContextLength('Anthropic', error);
      } else {
        gameError = GameError.fromUnknown(error);
      }
    } else {
      gameError = GameError.fromUnknown(error);
    }

    console.error(
      `[Claude Error - ${gameId}|${playerId}] ${gameError.code} for model ${modelName}: ${gameError.userMessage}`
    );

    throw gameError;
  }
};

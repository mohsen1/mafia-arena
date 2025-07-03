import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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
    let errorMessage = 'Unknown error';
    let errorType = 'UNKNOWN_ERROR';

    if (error instanceof Error) {
      errorMessage = error.message;

      // Categorize error types for better handling
      if (
        error.message.includes('401') ||
        error.message.includes('authentication')
      ) {
        errorType = 'AUTHENTICATION_ERROR';
        errorMessage =
          'Invalid API key. Please check your Anthropic API key configuration.';
      } else if (
        error.message.includes('429') ||
        error.message.includes('rate_limit')
      ) {
        errorType = 'RATE_LIMIT_ERROR';
        errorMessage =
          'Rate limit exceeded. Please wait a moment before trying again.';
      } else if (error.message.includes('timeout')) {
        errorType = 'TIMEOUT_ERROR';
        errorMessage = `Request timed out after 60 seconds. The Claude API may be experiencing high load.`;
      } else if (
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('network')
      ) {
        errorType = 'CONNECTION_ERROR';
        errorMessage =
          'Cannot connect to Claude API. Please check your internet connection.';
      } else if (error.message.includes('model_not_found')) {
        errorType = 'MODEL_ERROR';
        errorMessage = `Model "${modelName}" not found. Please check if this model is available.`;
      } else if (error.message.includes('context_length')) {
        errorType = 'CONTEXT_LENGTH_ERROR';
        errorMessage =
          "Message too long. The conversation exceeds Claude's context window.";
      }
    }

    console.error(
      `[Claude Error - ${gameId}|${playerId}] ${errorType} for model ${modelName}: ${errorMessage}`
    );

    // Create a more informative error
    const detailedError = new Error(errorMessage);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (detailedError as any).type = errorType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (detailedError as any).model = modelName;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (detailedError as any).originalError = error;

    throw detailedError;
  }
};

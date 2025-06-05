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
  const anthropic = getAnthropicInstance();
  if (!anthropic) {
    throw new Error(
      'Anthropic client not initialized. Missing ANTHROPIC_API_KEY.'
    );
  }

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
        'Received empty or non-text response content from Claude.'
      );
    }

    console.log(
      `[Claude Response - ${gameId}|${playerId}] Received content (length: ${responseContent.text.length}).`
    );
    return responseContent.text;
  } catch (error: unknown) {
    const modelName = settings.model;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[Claude Error - ${gameId}|${playerId}] Failed AI call for model ${modelName}:`,
      errorMessage
    );
    throw error;
  }
};
